#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyInstallPlan,
  createInstallPlan,
  doctorRuntime,
  initializeRuntime,
  inspectPortableHomeMarker,
  loadRuntimeConfig,
  LOCAL_CONFIG_FILE,
  repairPortableLinks
} from "../src/portable-runtime.mjs";
import {
  analyzeConfigOverlay,
  buildOverlaySpecFromFeatures,
  parseScalar as parseManagedScalar,
  scanToml
} from "../src/toml-overlay.mjs";
import { createDirectoryLinkSync } from "../src/runtime-fs.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const systemRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(systemRoot, "sync-manifest.json");

const usage = `Usage:
  node scripts/sync-codex.mjs status [--home <path>]
  node scripts/sync-codex.mjs diff [--home <path>]
  node scripts/sync-codex.mjs push [--dry-run] [--force] [--home <path>]
  node scripts/sync-codex.mjs pull [--dry-run] [--force] [--home <path>]
  node scripts/sync-codex.mjs portable init --home <path> [--codex-cli <path>] [--reconfigure]
  node scripts/sync-codex.mjs portable plan [--replace-managed]
  node scripts/sync-codex.mjs portable apply [--replace-managed]
  node scripts/sync-codex.mjs portable doctor
  node scripts/sync-codex.mjs portable status
  node scripts/sync-codex.mjs portable repair-links

Commands:
  status   Compare managed repo files with the Codex runtime home.
  diff     Show git-style diffs for managed files that differ.
  push     Copy from this repository to the Codex runtime home.
  pull     Copy from the Codex runtime home back into this repository.
  portable Explicitly initialize, plan, apply, and verify the portable core profile.

Options:
  --dry-run    Print intended writes without changing files.
  --force      Allow overwriting reviewed drift or conflicts.
  --home PATH  Override CODEX_HOME / ~/.codex.
  --replace-managed  Authorize replacement of managed drift in both portable plan and apply.
`;

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const portableCommand = command === "portable" ? args.shift() : null;
  const options = {
    command,
    portableCommand,
    dryRun: false,
    force: false,
    home: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    homeExplicit: Boolean(process.env.CODEX_HOME),
    replaceManaged: false,
    reconfigure: false,
    codexCli: null
  };

  while (args.length) {
    const arg = args.shift();
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--replace-managed") options.replaceManaged = true;
    else if (arg === "--reconfigure") options.reconfigure = true;
    else if (arg === "--home") {
      const value = args.shift();
      if (!value) fail("--home requires a path");
      options.home = expandHome(value);
      options.homeExplicit = true;
    } else if (arg === "--codex-cli") {
      const value = args.shift();
      if (!value) fail("--codex-cli requires a path");
      options.codexCli = expandHome(value);
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  if (command === "portable" && !["init", "plan", "apply", "doctor", "status", "repair-links"].includes(portableCommand)) {
    console.log(usage);
    process.exit(portableCommand ? 1 : 0);
  }
  if (!["status", "diff", "push", "pull", "portable"].includes(command)) {
    console.log(usage);
    process.exit(command ? 1 : 0);
  }
  if (command !== "portable" && (options.replaceManaged || options.reconfigure || options.codexCli)) {
    fail("portable-only option used with status/diff/push/pull");
  }
  if (command === "portable" && portableCommand === "init" && options.replaceManaged) {
    fail("--replace-managed is valid only with portable plan/apply");
  }
  options.home = path.resolve(expandHome(options.home));
  if (options.codexCli) options.codexCli = path.resolve(options.codexCli);
  return options;
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function loadManifest() {
  const manifest = readJson(manifestPath);
  if (!manifest || ![1, 2].includes(manifest.schema)) {
    fail("sync-manifest.json must have schema 1 or 2");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail("sync-manifest.json must list managed files");
  }
  const repoPaths = new Set();
  const homePaths = new Set();
  for (const entry of manifest.files) {
    if (!entry.repo || !entry.home) fail("each manifest file entry needs repo and home paths");
    if (entry.diffMode !== undefined && entry.diffMode !== "summary") {
      fail(`unsupported managed file diffMode: ${entry.diffMode}`);
    }
    assertRelativeSafe(entry.repo, "repo");
    assertRelativeSafe(entry.home, "home");
    addUniquePath(repoPaths, entry.repo, "duplicate repo path");
    addUniquePath(homePaths, entry.home, "duplicate home path");
  }

  if (manifest.homeTombstones === undefined) manifest.homeTombstones = [];
  if (!Array.isArray(manifest.homeTombstones)) {
    fail("sync-manifest.json homeTombstones must be an array");
  }
  const tombstonePaths = new Set();
  for (const tombstone of manifest.homeTombstones) {
    if (!tombstone.home) fail("each home tombstone needs a home path");
    assertRelativeSafe(tombstone.home, "home tombstone");
    const key = normalizedPathKey(tombstone.home);
    if (homePaths.has(key)) {
      fail(`home tombstone overlaps a managed file: ${tombstone.home}`);
    }
    addUniquePath(tombstonePaths, tombstone.home, "duplicate home tombstone path");
    if (!Array.isArray(tombstone.allowedSha256) || tombstone.allowedSha256.length === 0) {
      fail(`home tombstone needs allowedSha256 hashes: ${tombstone.home}`);
    }
    const hashes = new Set();
    for (const hash of tombstone.allowedSha256) {
      if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
        fail(`home tombstone has invalid SHA-256: ${tombstone.home}`);
      }
      if (hashes.has(hash)) fail(`home tombstone has duplicate SHA-256: ${tombstone.home}`);
      hashes.add(hash);
    }
  }
  validateManifestExtensions(manifest, repoPaths, homePaths, tombstonePaths);
  return manifest;
}

function validateManifestExtensions(manifest, repoPaths, homePaths, tombstonePaths) {
  if (manifest.schema === 1) {
    manifest.agentSets = [];
    manifest.externalSkills = [];
    return;
  }
  const patch = manifest.configPatch;
  if (!patch || typeof patch !== "object" || !patch.home) {
    fail("schema 2 manifest needs configPatch.home");
  }
  assertRelativeSafe(patch.home, "configPatch home");
  for (const field of ["values", "featureValues", "absent", "legacyAgentTables"]) {
    if (!Array.isArray(patch[field])) fail(`configPatch.${field} must be an array`);
  }
  const managedPaths = new Set();
  for (const entry of [...patch.values, ...patch.featureValues]) {
    if (!entry || typeof entry.path !== "string" || !isManagedScalarPath(entry.path)) {
      fail(`unsupported managed config path: ${entry && entry.path}`);
    }
    if (("value" in entry) === ("homePath" in entry)) {
      fail(`config value needs exactly one of value or homePath: ${entry.path}`);
    }
    if (entry.homePath !== undefined) assertRelativeSafe(entry.homePath, `config ${entry.path}`);
    if (entry.feature !== undefined && (typeof entry.feature !== "string" || !entry.feature)) {
      fail(`config feature name must be non-empty: ${entry.path}`);
    }
    addUniqueConfigPath(managedPaths, entry.path);
  }
  for (const managedPath of patch.absent) {
    if (typeof managedPath !== "string" || !isManagedScalarPath(managedPath)) {
      fail(`unsupported managed absence path: ${managedPath}`);
    }
    addUniqueConfigPath(managedPaths, managedPath);
  }
  const roles = new Set();
  for (const table of patch.legacyAgentTables) {
    if (!table || !isRoleName(table.role) || !table.configFile) {
      fail("legacyAgentTables entries need a safe role and configFile");
    }
    assertRelativeSafe(table.configFile, `legacy agent ${table.role}`);
    if (roles.has(table.role)) fail(`duplicate legacy agent role: ${table.role}`);
    roles.add(table.role);
  }

  if (!manifest.modelCatalog || !manifest.modelCatalog.repo || !manifest.modelCatalog.home) {
    fail("schema 2 manifest needs modelCatalog repo/home");
  }
  assertRelativeSafe(manifest.modelCatalog.repo, "modelCatalog repo");
  assertRelativeSafe(manifest.modelCatalog.home, "modelCatalog home");
  if (!repoPaths.has(normalizedPathKey(manifest.modelCatalog.repo)) ||
      !homePaths.has(normalizedPathKey(manifest.modelCatalog.home))) {
    fail("modelCatalog must reference a managed full-file mapping");
  }

  if (!Array.isArray(manifest.agentSets)) fail("schema 2 manifest agentSets must be an array");
  const setIds = new Set();
  const roleNames = new Set();
  const runtimePaths = new Set();
  for (const set of manifest.agentSets) {
    if (!set || typeof set.id !== "string" || !set.id || setIds.has(set.id)) {
      fail(`invalid or duplicate agent set id: ${set && set.id}`);
    }
    setIds.add(set.id);
    if (!["full-file", "external-junction", "inventory-only"].includes(set.ownership)) {
      fail(`unsupported agent set ownership: ${set.ownership}`);
    }
    if (["external-junction", "inventory-only"].includes(set.ownership) && !set.runtimeRoot) {
      fail(`${set.ownership} set needs runtimeRoot: ${set.id}`);
    }
    if (set.ownership === "external-junction" && !set.sourceRoot) {
      fail(`external-junction set needs sourceRoot: ${set.id}`);
    }
    if (set.hostProjectionOwner !== undefined && set.hostProjectionOwner !== "prompt") {
      fail(`unsupported host projection owner: ${set.id}`);
    }
    for (const envName of [set.sourceRootEnv, set.sharedFile && set.sharedFile.sourceEnv]) {
      if (envName !== undefined && (typeof envName !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(envName))) {
        fail(`invalid external source environment override: ${set.id}`);
      }
    }
    if (set.sharedFile) {
      if (!set.sharedFile.source || !set.sharedFile.home) fail(`sharedFile needs source/home: ${set.id}`);
      assertRelativeSafe(set.sharedFile.home, `agent set ${set.id} sharedFile home`);
    }
    if (!Array.isArray(set.roles) || set.roles.length === 0) {
      fail(`agent set must list roles: ${set.id}`);
    }
    if (set.runtimeRoot) assertRelativeSafe(set.runtimeRoot, `agent set ${set.id} runtimeRoot`);
    for (const role of set.roles) {
      if (!role || !isRoleName(role.name)) fail(`invalid agent role in set ${set.id}`);
      if (roleNames.has(role.name)) fail(`duplicate role ownership: ${role.name}`);
      roleNames.add(role.name);
      const runtimeRel = agentRuntimeRel(set, role);
      assertRelativeSafe(runtimeRel, `agent role ${role.name}`);
      addUniquePath(runtimePaths, runtimeRel, "duplicate runtime agent ownership");
      if (set.ownership === "full-file") {
        if (!role.repo || !role.home) fail(`full-file agent needs repo/home: ${role.name}`);
        assertRelativeSafe(role.repo, `agent role ${role.name} repo`);
        if (!repoPaths.has(normalizedPathKey(role.repo)) || !homePaths.has(normalizedPathKey(role.home))) {
          fail(`full-file agent must reference a managed mapping: ${role.name}`);
        }
      } else if (!role.file) {
        fail(`${set.ownership} agent needs file: ${role.name}`);
      }
    }
  }
  for (const legacyRole of roles) {
    if (roleNames.has(legacyRole)) continue;
    const legacy = patch.legacyAgentTables.find((table) => table.role === legacyRole);
    if (!tombstonePaths.has(normalizedPathKey(legacy.configFile))) {
      fail(`legacy agent role has neither an inventory owner nor a runtime tombstone: ${legacyRole}`);
    }
  }

  if (manifest.externalSkills === undefined) manifest.externalSkills = [];
  if (!Array.isArray(manifest.externalSkills)) fail("schema 2 manifest externalSkills must be an array");
  const skillNames = new Set();
  const skillRuntimePaths = new Set();
  for (const skill of manifest.externalSkills) {
    if (!skill || !isSkillName(skill.name) || skillNames.has(skill.name)) {
      fail(`invalid or duplicate external skill name: ${skill && skill.name}`);
    }
    skillNames.add(skill.name);
    if (skill.ownership !== "external-junction") {
      fail(`unsupported external skill ownership: ${skill.name}`);
    }
    if (skill.hostProjectionOwner !== "prompt") {
      fail(`external skill host projection owner must be prompt: ${skill.name}`);
    }
    if (!skill.sourceRoot || !path.isAbsolute(skill.sourceRoot)) {
      fail(`external skill sourceRoot must be absolute: ${skill.name}`);
    }
    if (!skill.runtimePath) fail(`external skill needs runtimePath: ${skill.name}`);
    assertRelativeSafe(skill.runtimePath, `external skill ${skill.name} runtimePath`);
    const runtimeParts = path.normalize(skill.runtimePath).split(path.sep);
    if (runtimeParts.length !== 2 || runtimeParts[0].toLowerCase() !== "skills" || runtimeParts[1] !== skill.name) {
      fail(`external skill runtimePath must be skills/<name>: ${skill.name}`);
    }
    addUniquePath(skillRuntimePaths, skill.runtimePath, "duplicate external skill runtime path");
    const runtimeKey = normalizedPathKey(skill.runtimePath);
    if ([...homePaths, ...tombstonePaths].some((ownedKey) => pathKeysOverlap(runtimeKey, ownedKey))) {
      fail(`external skill runtimePath overlaps a managed home path: ${skill.runtimePath}`);
    }
    for (const set of manifest.agentSets) {
      if (set.runtimeRoot && pathKeysOverlap(runtimeKey, normalizedPathKey(set.runtimeRoot))) {
        fail(`external skill runtimePath overlaps an agent runtime root: ${skill.runtimePath}`);
      }
    }
    if (skill.sourceRootEnv !== undefined &&
        (typeof skill.sourceRootEnv !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(skill.sourceRootEnv))) {
      fail(`invalid external skill source environment override: ${skill.name}`);
    }
    if (!skill.dataRoot || !path.isAbsolute(skill.dataRoot)) {
      fail(`external skill dataRoot must be an explicit absolute path: ${skill.name}`);
    }
  }
}

function addUniqueConfigPath(paths, configPath) {
  if (paths.has(configPath)) fail(`duplicate managed config path: ${configPath}`);
  paths.add(configPath);
}

function isManagedScalarPath(configPath) {
  return /^(?:[A-Za-z0-9_]+|agents\.[A-Za-z0-9_]+|features\.[A-Za-z0-9_]+)$/.test(configPath) ||
    configPath === "features.multi_agent_v2.multi_agent_mode_hint_text";
}

function isRoleName(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

function isSkillName(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function agentRuntimeRel(set, role) {
  if (role.home) return role.home;
  if (set.runtimeRoot && role.file) return path.join(set.runtimeRoot, role.file);
  fail(`agent role needs home or runtimeRoot/file: ${role && role.name}`);
}

function resolveExternalPath(defaultPath, envName) {
  const override = envName ? process.env[envName] : null;
  if (override && !path.isAbsolute(override)) fail(`${envName} must be an absolute path`);
  return path.resolve(override || defaultPath);
}

function normalizedPathKey(rel) {
  return path.normalize(rel).toLowerCase();
}

function pathKeysOverlap(left, right) {
  return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

function addUniquePath(paths, rel, message) {
  const key = normalizedPathKey(rel);
  if (paths.has(key)) fail(`${message}: ${rel}`);
  paths.add(key);
}

function assertRelativeSafe(rel, label) {
  if (path.isAbsolute(rel)) fail(`${label} path must be relative: ${rel}`);
  const normalized = path.normalize(rel);
  if (normalized.startsWith("..") || normalized.includes(`${path.sep}..${path.sep}`)) {
    fail(`${label} path must stay inside its root: ${rel}`);
  }
}

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function fileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { exists: true, isFile: false, hash: null, size: stat.size };
    }
    return { exists: true, isFile: true, hash: sha256(filePath), size: stat.size };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { exists: false, isFile: false, hash: null, size: null };
    }
    throw error;
  }
}

function tombstoneFileInfo(filePath, homeRoot) {
  const parentRel = path.relative(homeRoot, path.dirname(filePath));
  let current = homeRoot;
  for (const part of parentRel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        return { exists: true, isFile: false, isSymlink: false, parentSymlink: true, hash: null };
      }
      if (!stat.isDirectory()) {
        return { exists: true, isFile: false, isSymlink: false, parentNotDirectory: true, hash: null };
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return { exists: false, isFile: false, isSymlink: false, hash: null };
      }
      throw error;
    }
  }

  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      return { exists: true, isFile: false, isSymlink: true, hash: null, size: stat.size };
    }
    if (!stat.isFile()) {
      return { exists: true, isFile: false, isSymlink: false, hash: null, size: stat.size };
    }
    return {
      exists: true,
      isFile: true,
      isSymlink: false,
      hash: sha256(filePath),
      size: stat.size
    };
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return { exists: false, isFile: false, isSymlink: false, hash: null };
    }
    throw error;
  }
}

function resolveEntries(manifest, homeRoot) {
  return manifest.files.map((entry) => {
    const repoPath = path.resolve(systemRoot, entry.repo);
    const homePath = path.resolve(homeRoot, entry.home);
    assertInside(repoPath, systemRoot, `repo path escapes system root: ${entry.repo}`);
    assertInside(homePath, homeRoot, `home path escapes Codex home: ${entry.home}`);
    return {
      ...entry,
      repoPath,
      homePath,
      repoInfo: fileInfo(repoPath),
      homeInfo: fileInfo(homePath),
      repoSafety: safeFileInfo(repoPath, systemRoot),
      homeSafety: safeFileInfo(homePath, homeRoot)
    };
  });
}

function resolveTombstones(manifest, homeRoot) {
  return manifest.homeTombstones.map((tombstone) => {
    const homePath = path.resolve(homeRoot, tombstone.home);
    assertInside(homePath, homeRoot, `home tombstone escapes Codex home: ${tombstone.home}`);
    return {
      ...tombstone,
      homePath,
      homeInfo: tombstoneFileInfo(homePath, homeRoot)
    };
  });
}

function assertInside(target, root, message) {
  const rel = path.relative(root, target);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return;
  fail(message);
}

function safeFileInfo(filePath, root) {
  const parentRel = path.relative(root, path.dirname(filePath));
  let current = root;
  for (const part of parentRel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return { exists: true, safe: false, reason: "parent-reparse" };
      if (!stat.isDirectory()) return { exists: true, safe: false, reason: "parent-not-directory" };
    } catch (error) {
      if (error && error.code === "ENOENT") return { exists: false, safe: true, hash: null };
      throw error;
    }
  }
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) return { exists: true, safe: false, reason: "target-reparse" };
    if (!stat.isFile()) return { exists: true, safe: false, reason: "target-not-file" };
    return { exists: true, safe: true, hash: sha256(filePath), size: stat.size };
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return { exists: false, safe: true, hash: null };
    }
    throw error;
  }
}

function assertSafeHomeRoot(homeRoot) {
  try {
    const stat = fs.lstatSync(homeRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("Codex home must be an ordinary directory");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

function safeDirectoryInfo(directoryPath, root) {
  const rel = path.relative(root, directoryPath);
  let current = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return { safe: false, reason: "directory-reparse" };
      if (!stat.isDirectory()) return { safe: false, reason: "not-directory" };
    } catch (error) {
      if (error && error.code === "ENOENT") return { safe: true };
      throw error;
    }
  }
  return { safe: true };
}

function discoverFeatures() {
  if (process.env.CODEX_SYNC_TEST_MODE === "1" && process.env.CODEX_SYNC_FEATURES !== undefined) {
    return {
      probed: true,
      names: new Set(process.env.CODEX_SYNC_FEATURES.split(",").map((value) => value.trim()).filter(Boolean))
    };
  }
  const command = process.env.CODEX_SYNC_CLI || "codex";
  const result = spawnSync(command, ["features", "list"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return { probed: false, names: new Set(), error: "Codex feature probe failed" };
  }
  const names = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)\s+/);
    if (match) names.add(match[1]);
  }
  return { probed: true, names };
}

function analyzeConfig(manifest, homeRoot, features) {
  if (!manifest.configPatch) return null;
  const configPath = path.resolve(homeRoot, manifest.configPatch.home);
  assertInside(configPath, homeRoot, "configPatch path escapes Codex home");
  const info = safeFileInfo(configPath, homeRoot);
  const result = {
    path: configPath,
    rel: manifest.configPatch.home,
    info,
    changes: [],
    unsupported: [],
    issues: [],
    originalHash: info.hash,
    patchedText: null
  };
  if (!info.safe) {
    result.issues.push(`unsafe config path: ${info.reason}`);
    return result;
  }
  let textValue = "";
  if (info.exists) {
    const bytes = fs.readFileSync(configPath);
    const afterRead = safeFileInfo(configPath, homeRoot);
    if (!sameFileSnapshot(afterRead, info) || sha256Bytes(bytes) !== info.hash) {
      result.issues.push("config changed while it was being read");
      return result;
    }
    textValue = bytes.toString("utf8");
  }
  if (!features.probed) {
    result.issues.push(`${features.error || "Codex feature probe failed"}; feature-managed config is unchanged`);
    return result;
  }
  for (const entry of manifest.configPatch.featureValues) {
    if (!features.names.has(entry.feature)) result.unsupported.push({ path: entry.path, feature: entry.feature });
  }
  try {
    const spec = buildOverlaySpecFromFeatures(manifest, homeRoot, features.names);
    const analysis = analyzeConfigOverlay(textValue, spec);
    result.changes = analysis.changes;
    result.patchedText = analysis.text;
  } catch (error) {
    result.issues.push(error.message);
  }
  return result;
}

function samePath(left, right) {
  const leftResolved = path.resolve(expandHome(left));
  const rightResolved = path.resolve(expandHome(right));
  return process.platform === "win32"
    ? leftResolved.toLowerCase() === rightResolved.toLowerCase()
    : leftResolved === rightResolved;
}

function validateRepositoryContract(manifest) {
  if (!manifest.modelCatalog) return null;
  const catalogPath = path.resolve(systemRoot, manifest.modelCatalog.repo);
  assertInside(catalogPath, systemRoot, "model catalog escapes system root");
  const catalog = readJson(catalogPath);
  if (!catalog || !Array.isArray(catalog.models)) fail("models.json must contain a models array");
  const slugs = new Set();
  for (const [index, model] of catalog.models.entries()) {
    if (!model || typeof model !== "object" || typeof model.slug !== "string" || !model.slug) {
      fail(`models.json model ${index} needs a non-empty slug`);
    }
    if (slugs.has(model.slug)) fail(`models.json has duplicate slug: ${model.slug}`);
    slugs.add(model.slug);
  }
  for (const promptSet of manifest.agentSets.filter((set) => set.ownership === "full-file")) {
    for (const role of promptSet.roles) {
      const profilePath = path.resolve(systemRoot, role.repo);
      assertInside(profilePath, systemRoot, `Prompt-owned agent escapes system root: ${role.repo}`);
      const summary = readProfileSummary(profilePath);
      if (summary.error) fail(`invalid Prompt-owned agent ${role.repo}: ${summary.error}`);
      if (summary.name !== role.name) {
        fail(`Prompt-owned agent name mismatch: ${role.repo} declares ${summary.name || "<missing>"}`);
      }
      if (typeof summary.model !== "string" || !slugs.has(summary.model)) {
        fail(`Prompt-owned agent model is absent from models.json: ${role.repo}`);
      }
    }
  }
  return { slugs };
}

function readProfileSummary(profilePath) {
  let textValue;
  try {
    textValue = fs.readFileSync(profilePath, "utf8");
  } catch (error) {
    return { error: error.code === "ENOENT" ? "file missing" : error.message };
  }
  let document;
  try {
    document = scanToml(textValue);
  } catch (error) {
    return { error: error.message };
  }
  if (document.errors.length) return { error: document.errors.join("; ") };
  const summary = {};
  for (const field of ["name", "model"]) {
    const matches = document.assignments.filter((assignment) => assignment.path === field);
    if (matches.length > 1) return { error: `duplicate ${field}` };
    if (matches.length === 1) {
      try {
        summary[field] = parseManagedScalar(matches[0].valueText);
      } catch (error) {
        return { error: `${field}: ${error.message}` };
      }
    }
  }
  return summary;
}

function inspectAgentInventory(manifest, homeRoot) {
  const records = [];
  const claimed = new Map();
  const observedNames = new Map();
  for (const set of manifest.agentSets || []) {
    for (const role of set.roles) {
      const rel = agentRuntimeRel(set, role).replace(/\\/g, "/");
      claimed.set(normalizedPathKey(rel), { set, role, rel });
    }
  }

  for (const set of manifest.agentSets || []) {
    if (set.ownership === "external-junction") {
      inspectJunctionSet(set, homeRoot, records, observedNames);
    } else {
      inspectSimpleSet(set, homeRoot, records, observedNames);
    }
  }

  const agentsRoot = path.resolve(homeRoot, "agents");
  for (const rel of inventoryTomlPaths(agentsRoot, manifest.agentSets || [])) {
    const key = normalizedPathKey(rel);
    if (claimed.has(key)) continue;
    const profilePath = path.resolve(homeRoot, rel);
    const summary = readProfileSummary(profilePath);
    records.push({
      status: "unclaimed-agent",
      subject: rel.replace(/\\/g, "/"),
      problem: true,
      name: summary.error ? null : summary.name
    });
    if (!summary.error && summary.name) addObservedName(observedNames, summary.name, rel, records);
  }
  return { records, hasProblem: records.some((record) => record.problem) };
}

function readExternalSkillName(skillRoot) {
  const skillFile = path.join(skillRoot, "SKILL.md");
  let stat;
  try {
    stat = fs.lstatSync(skillFile);
  } catch (error) {
    return { error: error && error.code === "ENOENT" ? "SKILL.md missing" : "SKILL.md unreadable" };
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return { error: "SKILL.md is not an ordinary file" };
  let text;
  try {
    text = fs.readFileSync(skillFile, "utf8");
  } catch {
    return { error: "SKILL.md unreadable" };
  }
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return { error: "SKILL.md frontmatter missing" };
  const names = [...frontmatter[1].matchAll(/^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)];
  if (names.length !== 1) return { error: "SKILL.md needs exactly one safe name" };
  return { name: names[0][1] };
}

function safeAbsoluteDirectoryInfo(directoryPath) {
  const resolved = path.resolve(directoryPath);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const parts = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean);
  const candidates = [current];
  for (const part of parts) {
    current = path.join(current, part);
    candidates.push(current);
  }
  for (const candidate of candidates) {
    try {
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink()) {
        return {
          safe: false,
          reason: samePath(candidate, resolved) ? "directory-reparse" : "ancestor-reparse",
          at: candidate
        };
      }
      if (!stat.isDirectory()) {
        return {
          safe: false,
          reason: samePath(candidate, resolved) ? "not-directory" : "ancestor-not-directory",
          at: candidate
        };
      }
    } catch (error) {
      return {
        safe: false,
        reason: error && error.code === "ENOENT" ? "path-missing" : "path-unreadable",
        at: candidate
      };
    }
  }
  return { safe: true, resolved };
}

function inspectExternalSkillSource(skill) {
  const sourceRoot = resolveExternalPath(skill.sourceRoot, skill.sourceRootEnv);
  const safety = safeAbsoluteDirectoryInfo(sourceRoot);
  if (!safety.safe) {
    const reason = safety.reason === "path-missing" ? "source-missing" : `source-unsafe-path:${safety.reason}`;
    return { okay: false, sourceRoot, reason };
  }
  const summary = readExternalSkillName(sourceRoot);
  if (summary.error) return { okay: false, sourceRoot, reason: summary.error };
  if (summary.name !== skill.name) {
    return { okay: false, sourceRoot, reason: `skill-name-mismatch:${summary.name}` };
  }
  return { okay: true, sourceRoot };
}

function inspectExternalSkillDataRoot(skill) {
  const dataRoot = path.resolve(skill.dataRoot);
  const safety = safeAbsoluteDirectoryInfo(dataRoot);
  if (!safety.safe) {
    const reason = safety.reason === "path-missing" ? "data-root-missing" : `data-root-unsafe-path:${safety.reason}`;
    return { okay: false, dataRoot, reason };
  }
  return { okay: true, dataRoot };
}

function classifyHostProjection(targetPath, sourceRoot, homeRoot) {
  const parentSafety = safeDirectoryInfo(path.dirname(targetPath), homeRoot);
  if (!parentSafety.safe) return { status: "unsafe", reason: parentSafety.reason };
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isSymbolicLink()) return { status: "occupied" };
    let resolved;
    try { resolved = fs.realpathSync(targetPath); } catch { resolved = null; }
    return resolved && samePath(resolved, sourceRoot) ? { status: "clean" } : { status: "wrong" };
  } catch (error) {
    if (error && error.code === "ENOENT") return { status: "missing" };
    return { status: "unsafe", reason: "target-unreadable" };
  }
}

function inspectExternalSkills(manifest, homeRoot) {
  const records = [];
  for (const skill of manifest.externalSkills || []) {
    const source = inspectExternalSkillSource(skill);
    records.push({
      status: source.okay ? "external-skill-source-ok" : "external-skill-source-invalid",
      subject: `${skill.name}:${source.sourceRoot}${source.okay ? "" : ` (${source.reason})`}`,
      problem: !source.okay
    });
    const data = inspectExternalSkillDataRoot(skill);
    records.push({
      status: data.okay ? "external-skill-data-root-ok" : "external-skill-data-root-invalid",
      subject: `${skill.name}:${data.dataRoot}${data.okay ? "" : ` (${data.reason})`}`,
      problem: !data.okay
    });
    const targetPath = path.resolve(homeRoot, skill.runtimePath);
    assertInside(targetPath, homeRoot, `external skill runtime path escapes Codex home: ${skill.runtimePath}`);
    const projection = classifyHostProjection(targetPath, source.sourceRoot, homeRoot);
    records.push({
      status: `external-skill-${projection.status}`,
      subject: `${skill.name}:${skill.runtimePath}${projection.reason ? ` (${projection.reason})` : ""}`,
      problem: projection.status !== "clean"
    });
  }
  return { records, hasProblem: records.some((record) => record.problem) };
}

function inspectSimpleSet(set, homeRoot, records, observedNames) {
  for (const role of set.roles) {
    const rel = agentRuntimeRel(set, role).replace(/\\/g, "/");
    const profilePath = path.resolve(homeRoot, rel);
    const summary = readProfileSummary(profilePath);
    if (summary.error) {
      records.push({ status: "agent-missing-or-invalid", subject: `${set.id}:${rel}`, problem: true });
      continue;
    }
    const mismatch = summary.name !== role.name;
    records.push({
      status: mismatch ? "agent-name-mismatch" : (set.ownership === "inventory-only" ? "inventory-ok" : "agent-owned"),
      subject: `${set.id}:${rel}`,
      problem: mismatch
    });
    addObservedName(observedNames, summary.name, rel, records);
  }
}

function inspectJunctionSet(set, homeRoot, records, observedNames) {
  const runtimeRoot = path.resolve(homeRoot, set.runtimeRoot);
  const sourceRoot = resolveExternalPath(set.sourceRoot, set.sourceRootEnv);
  let sourceOkay = false;
  try {
    const sourceStat = fs.lstatSync(sourceRoot);
    sourceOkay = sourceStat.isDirectory() && !sourceStat.isSymbolicLink();
  } catch {
    sourceOkay = false;
  }
  let rootStatus = "external-junction-ok";
  try {
    const stat = fs.lstatSync(runtimeRoot);
    if (!sourceOkay) {
      rootStatus = "external-junction-source-missing";
    } else if (!stat.isSymbolicLink() || !samePath(fs.realpathSync(runtimeRoot), sourceRoot)) {
      rootStatus = "external-junction-drift";
    }
  } catch {
    rootStatus = sourceOkay ? "external-junction-missing" : "external-junction-source-missing";
  }
  records.push({ status: rootStatus, subject: `${set.id}:${set.runtimeRoot}`, problem: rootStatus !== "external-junction-ok" });
  for (const role of set.roles) {
    const rel = agentRuntimeRel(set, role).replace(/\\/g, "/");
    const profilePath = path.resolve(homeRoot, rel);
    const summary = readProfileSummary(profilePath);
    const status = summary.error
      ? "external-agent-missing-or-invalid"
      : summary.name === role.name ? "external-ok" : "agent-name-mismatch";
    records.push({ status, subject: `${set.id}:${rel}`, problem: status !== "external-ok" });
    if (!summary.error && summary.name) addObservedName(observedNames, summary.name, rel, records);
  }
  if (set.sharedFile) {
    const source = fileInfo(resolveExternalPath(set.sharedFile.source, set.sharedFile.sourceEnv));
    const targetPath = path.resolve(homeRoot, set.sharedFile.home);
    const target = safeFileInfo(targetPath, homeRoot);
    const okay = source.exists && source.isFile && target.exists && target.safe && source.hash === target.hash;
    records.push({
      status: okay ? "external-shared-prompt-ok" : "external-shared-prompt-drift",
      subject: `${set.id}:${set.sharedFile.home}`,
      problem: !okay
    });
  }
}

function addObservedName(observed, name, rel, records) {
  if (!name) return;
  const prior = observed.get(name);
  if (prior && normalizedPathKey(prior) !== normalizedPathKey(rel)) {
    records.push({ status: "duplicate-runtime-role", subject: `${name}:${prior},${rel}`, problem: true });
  } else {
    observed.set(name, rel);
  }
}

function inventoryTomlPaths(agentsRoot, sets) {
  const result = [];
  const declaredRoots = new Set(sets.filter((set) => set.runtimeRoot).map((set) => normalizedPathKey(set.runtimeRoot)));
  function walk(currentRoot, currentRel) {
    let entries;
    try {
      entries = fs.readdirSync(currentRoot, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const rel = path.join(currentRel, entry.name);
      if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith(".toml")) {
        result.push(rel);
      } else if (entry.isDirectory()) {
        walk(path.join(currentRoot, entry.name), rel);
      } else if (entry.isSymbolicLink() && declaredRoots.has(normalizedPathKey(rel))) {
        try {
          walk(path.join(currentRoot, entry.name), rel);
        } catch {
          // The declared set inspector reports missing or unsafe roots without following unknown links.
        }
      }
    }
  }
  walk(agentsRoot, "agents");
  return result;
}

function statePath(manifest, homeRoot) {
  const rel = manifest.stateFile || ".prompt-sync-state.json";
  assertRelativeSafe(rel, "stateFile");
  const result = path.resolve(homeRoot, rel);
  assertInside(result, homeRoot, "state file escapes Codex home");
  return result;
}

function loadState(manifest, homeRoot) {
  const target = statePath(manifest, homeRoot);
  const snapshot = safeFileInfo(target, homeRoot);
  let loaded = { schema: 1, files: {} };
  if (snapshot.safe && snapshot.exists) {
    const bytes = fs.readFileSync(target);
    const afterRead = safeFileInfo(target, homeRoot);
    if (!sameFileSnapshot(afterRead, snapshot) || sha256Bytes(bytes) !== snapshot.hash) {
      fail("sync state changed while it was being read");
    }
    loaded = JSON.parse(bytes.toString("utf8"));
  }
  if (!loaded.files || typeof loaded.files !== "object") loaded.files = {};
  Object.defineProperty(loaded, "syncFileSnapshot", { value: snapshot, enumerable: false });
  return loaded;
}

function classify(entry, state) {
  const stateFile = state.files[entry.repo];
  const stateHash = stateFile && stateFile.hash;
  const repoHash = entry.repoInfo.hash;
  const homeHash = entry.homeInfo.hash;

  if (!entry.repoSafety.safe) return { status: "repo-unsafe-path", stateHash };
  if (!entry.homeSafety.safe) return { status: "home-unsafe-path", stateHash };
  if (!entry.repoInfo.exists) return { status: "repo-missing", stateHash };
  if (!entry.repoInfo.isFile) return { status: "repo-not-file", stateHash };
  if (!entry.homeInfo.exists) return { status: "home-missing", stateHash };
  if (!entry.homeInfo.isFile) return { status: "home-not-file", stateHash };
  if (repoHash === homeHash) {
    return { status: stateHash ? "synced" : "matching-untracked", stateHash };
  }
  if (!stateHash) return { status: "drift-unknown", stateHash };

  const repoChanged = repoHash !== stateHash;
  const homeChanged = homeHash !== stateHash;
  if (repoChanged && homeChanged) return { status: "conflict", stateHash };
  if (repoChanged) return { status: "repo-ahead", stateHash };
  if (homeChanged) return { status: "home-ahead", stateHash };
  return { status: "drift-unknown", stateHash };
}

function classifyTombstone(tombstone) {
  const info = tombstone.homeInfo;
  if (info.parentSymlink) return { status: "tombstone-parent-symlink" };
  if (info.parentNotDirectory) return { status: "tombstone-parent-not-dir" };
  if (!info.exists) return { status: "tombstone-clean" };
  if (info.isSymlink) return { status: "tombstone-symlink" };
  if (!info.isFile) return { status: "tombstone-not-file" };
  if (tombstone.allowedSha256.includes(info.hash)) {
    return { status: "tombstone-pending" };
  }
  return { status: "tombstone-hash-mismatch" };
}

function formatHash(hash) {
  return hash ? hash.slice(0, 12) : "-";
}

function printStatus(entries, tombstones, state, config, inventory, externalSkills) {
  let hasProblem = false;
  for (const entry of entries) {
    const result = classify(entry, state);
    if (!["synced", "matching-untracked"].includes(result.status)) hasProblem = true;
    console.log(`${result.status.padEnd(18)} ${entry.repo}`);
    console.log(`  repo ${formatHash(entry.repoInfo.hash)} ${entry.repoPath}`);
    console.log(`  home ${formatHash(entry.homeInfo.hash)} ${entry.homePath}`);
    if (result.stateHash) console.log(`  last ${formatHash(result.stateHash)}`);
  }
  for (const tombstone of tombstones) {
    const result = classifyTombstone(tombstone);
    if (result.status !== "tombstone-clean") hasProblem = true;
    console.log(`${result.status.padEnd(26)} ${tombstone.home}`);
    console.log(`  home ${formatHash(tombstone.homeInfo.hash)} ${tombstone.homePath}`);
  }
  if (config) {
    for (const unsupported of config.unsupported) {
      console.log(`${"config-unsupported".padEnd(26)} ${unsupported.path} (CLI feature ${unsupported.feature} is not exposed)`);
    }
    for (const issue of config.issues) {
      hasProblem = true;
      console.log(`${"config-refused".padEnd(26)} ${config.rel}: ${issue}`);
    }
    if (!config.issues.length && !config.changes.length) {
      console.log(`${"config-clean".padEnd(26)} ${config.rel}`);
    }
    for (const change of config.changes) {
      hasProblem = true;
      console.log(`${"config-drift".padEnd(26)} ${change.action} ${change.path}`);
    }
  }
  for (const record of inventory.records) {
    if (record.problem) hasProblem = true;
    console.log(`${record.status.padEnd(34)} ${record.subject}`);
  }
  for (const record of externalSkills.records) {
    if (record.problem) hasProblem = true;
    console.log(`${record.status.padEnd(34)} ${record.subject}`);
  }
  return hasProblem ? 1 : 0;
}

function runDiff(entries, tombstones, config, inventory, externalSkills) {
  let exitCode = 0;
  for (const entry of entries) {
    if (!entry.repoSafety.safe || !entry.homeSafety.safe) {
      console.log(`diff refused ${entry.repo}: unsafe path or reparse point`);
      exitCode = 1;
      continue;
    }
    if (!entry.repoInfo.exists || !entry.homeInfo.exists) {
      console.log(`diff skipped ${entry.repo}: missing on one side`);
      exitCode = 1;
      continue;
    }
    if (entry.repoInfo.hash === entry.homeInfo.hash) {
      console.log(`diff clean ${entry.repo}`);
      continue;
    }
    if (entry.diffMode === "summary") {
      console.log(`diff summary ${entry.repo}: managed bytes differ (content suppressed)`);
      exitCode = 1;
      continue;
    }
    console.log(`\n--- diff ${entry.repo} ---`);
    const result = spawnSync("git", ["diff", "--no-index", "--", entry.repoPath, entry.homePath], {
      encoding: "utf8"
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) {
      console.log(`git diff unavailable: ${result.error.message}`);
      console.log(`repo: ${entry.repoPath}`);
      console.log(`home: ${entry.homePath}`);
    }
    exitCode = 1;
  }
  for (const tombstone of tombstones) {
    const result = classifyTombstone(tombstone);
    if (result.status === "tombstone-clean") {
      console.log(`diff tombstone clean ${tombstone.home}`);
      continue;
    }
    if (result.status === "tombstone-pending") {
      console.log(`diff tombstone delete ${tombstone.home}`);
    } else {
      console.log(`diff tombstone refused ${tombstone.home}: ${result.status}`);
    }
    exitCode = 1;
  }
  if (config) {
    for (const unsupported of config.unsupported) {
      console.log(`diff config unsupported ${unsupported.path}: CLI feature ${unsupported.feature} is not exposed`);
    }
    for (const issue of config.issues) {
      console.log(`diff config refused ${config.rel}: ${issue}`);
      exitCode = 1;
    }
    for (const change of config.changes) {
      console.log(`diff config ${change.action} ${change.path}`);
      exitCode = 1;
    }
    if (!config.issues.length && !config.changes.length) console.log(`diff config clean ${config.rel}`);
  }
  for (const record of inventory.records) {
    console.log(`diff inventory ${record.status} ${record.subject}`);
    if (record.problem) exitCode = 1;
  }
  for (const record of externalSkills.records) {
    console.log(`diff external-skill ${record.status} ${record.subject}`);
    if (record.problem) exitCode = 1;
  }
  return exitCode;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

let tempSequence = 0;

function nextTempPath(targetPath) {
  tempSequence += 1;
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.prompt-sync-${process.pid}-${Date.now()}-${tempSequence}.tmp`
  );
}

function sameFileSnapshot(info, expected) {
  return info.safe && info.exists === expected.exists && info.hash === expected.hash;
}

function ensureOrdinaryDirectory(directoryPath, root, createdDirs) {
  assertInside(directoryPath, root, "staging directory escapes its root");
  const candidates = [root];
  let current = root;
  for (const part of path.relative(root, directoryPath).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    candidates.push(current);
  }
  for (const candidate of candidates) {
    try {
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`unsafe staging directory: ${candidate}`);
      }
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
      fs.mkdirSync(candidate);
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`staging directory was not created as an ordinary directory: ${candidate}`);
      }
      createdDirs.push(candidate);
    }
  }
}

function removeUnusedTemps(stage, removeCreatedDirs) {
  for (const item of stage.items) {
    if (!item.tempPath) continue;
    try { fs.unlinkSync(item.tempPath); } catch (error) {
      if (!error || error.code !== "ENOENT") {
        console.log(`warning: could not remove unused staging file ${item.tempPath}`);
      }
    }
    item.tempPath = null;
  }
  if (!removeCreatedDirs) return;
  for (const directoryPath of [...stage.createdDirs].reverse()) {
    try { fs.rmdirSync(directoryPath); } catch {
      // A non-empty or concurrently claimed directory is left in place.
    }
  }
}

function testPause(point, subject = "") {
  if (process.env.CODEX_SYNC_TEST_MODE !== "1") return;
  let marker = null;
  let delay = 0;
  if (point === "before-config-replace" && process.env.CODEX_SYNC_TEST_CONFIG_MARKER) {
    marker = process.env.CODEX_SYNC_TEST_CONFIG_MARKER;
    delay = Number(process.env.CODEX_SYNC_TEST_CONFIG_DELAY_MS || 0);
  }
  if (process.env.CODEX_SYNC_TEST_RACE_POINT === point &&
      (!process.env.CODEX_SYNC_TEST_RACE_SUBJECT || process.env.CODEX_SYNC_TEST_RACE_SUBJECT === subject)) {
    marker = process.env.CODEX_SYNC_TEST_RACE_MARKER || marker;
    delay = Number(process.env.CODEX_SYNC_TEST_RACE_DELAY_MS || delay || 0);
  }
  if (marker) fs.writeFileSync(marker, `${point}:${subject}\n`, "utf8");
  if (Number.isFinite(delay) && delay > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(delay, 5000));
  }
}

function stageCopy(plan, stage) {
  ensureOrdinaryDirectory(path.dirname(plan.targetPath), plan.targetRoot, stage.createdDirs);
  if (process.env.CODEX_SYNC_TEST_MODE === "1" &&
      process.env.CODEX_SYNC_TEST_STAGE_FAIL_REPO === plan.entry.repo) {
    throw new Error(`injected staging failure for ${plan.entry.repo}`);
  }
  const tempPath = nextTempPath(plan.targetPath);
  fs.copyFileSync(plan.sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
  const item = { kind: "copy", plan, tempPath, stagedHash: null };
  stage.items.push(item);
  item.stagedHash = sha256(tempPath);
  const sourceNow = safeFileInfo(plan.sourcePath, plan.sourceRoot);
  if (!sameFileSnapshot(sourceNow, plan.sourceInfo) || item.stagedHash !== plan.sourceInfo.hash) {
    throw new Error(`source changed while staging ${plan.entry.repo}`);
  }
  return item;
}

function stageText(kind, targetPath, targetRoot, targetInfo, textValue, stage, subject) {
  ensureOrdinaryDirectory(path.dirname(targetPath), targetRoot, stage.createdDirs);
  const tempPath = nextTempPath(targetPath);
  fs.writeFileSync(tempPath, textValue, { encoding: "utf8", flag: "wx" });
  const item = { kind, targetPath, targetRoot, targetInfo, tempPath, stagedHash: null, subject };
  stage.items.push(item);
  const expectedHash = sha256Bytes(Buffer.from(textValue, "utf8"));
  item.stagedHash = sha256(tempPath);
  if (item.stagedHash !== expectedHash) throw new Error(`staged ${kind} hash mismatch: ${subject}`);
  return item;
}

function revalidateStagedItem(item) {
  const targetRoot = item.kind === "copy" ? item.plan.targetRoot : item.targetRoot;
  const staged = safeFileInfo(item.tempPath, targetRoot);
  if (!staged.safe || !staged.exists || staged.hash !== item.stagedHash) {
    throw new Error(`staged bytes changed for ${item.subject || item.plan.entry.repo}`);
  }
  if (item.kind === "copy") {
    const source = safeFileInfo(item.plan.sourcePath, item.plan.sourceRoot);
    if (!sameFileSnapshot(source, item.plan.sourceInfo) || item.stagedHash !== source.hash) {
      throw new Error(`source changed after staging ${item.plan.entry.repo}`);
    }
    const target = safeFileInfo(item.plan.targetPath, item.plan.targetRoot);
    if (!sameFileSnapshot(target, item.plan.targetInfo)) {
      throw new Error(`target changed after preflight ${item.plan.entry.repo}`);
    }
    return;
  }
  const target = safeFileInfo(item.targetPath, item.targetRoot);
  if (!sameFileSnapshot(target, item.targetInfo)) {
    throw new Error(`${item.kind} target changed after preflight: ${item.subject}`);
  }
}

function applyStagedItem(item, direction) {
  const subject = item.kind === "copy" ? item.plan.entry.repo : item.subject;
  testPause(`before-${item.kind}-replace`, subject);
  revalidateStagedItem(item);
  // Revalidation and rename are separate syscalls. This test-only pause makes
  // the non-linearizable post-check boundary explicit without changing it.
  testPause(`after-${item.kind}-revalidation`, subject);
  const targetPath = item.kind === "copy" ? item.plan.targetPath : item.targetPath;
  fs.renameSync(item.tempPath, targetPath);
  item.tempPath = null;
  if (item.kind === "copy") console.log(`copy   ${direction} ${subject}`);
  else if (item.kind === "config") console.log(`patch  push config ${subject}`);
  else console.log(`write  ${direction} state ${subject}`);
}

function planHostJunctions(manifest, homeRoot, direction) {
  const plans = [];
  const clean = [];
  const skipped = [];
  const refusals = [];
  const projections = [];
  for (const set of manifest.agentSets || []) {
    if (set.ownership !== "external-junction" || set.hostProjectionOwner !== "prompt") continue;
    projections.push({
      kind: "agent",
      identity: set.id,
      runtimePath: set.runtimeRoot,
      sourceRoot: resolveExternalPath(set.sourceRoot, set.sourceRootEnv)
    });
  }
  for (const skill of manifest.externalSkills || []) {
    if (direction === "pull") {
      projections.push({
        kind: "skill",
        identity: skill.name,
        runtimePath: skill.runtimePath,
        sourceRoot: resolveExternalPath(skill.sourceRoot, skill.sourceRootEnv),
        skill
      });
      continue;
    }
    const source = inspectExternalSkillSource(skill);
    const data = inspectExternalSkillDataRoot(skill);
    if (!source.okay) {
      refusals.push(`refuse push junction ${skill.runtimePath}: external skill source is invalid (${source.reason})`);
      continue;
    }
    if (!data.okay) {
      refusals.push(`refuse push junction ${skill.runtimePath}: external skill data root is invalid (${data.reason})`);
      continue;
    }
    projections.push({
      kind: "skill",
      identity: skill.name,
      runtimePath: skill.runtimePath,
      sourceRoot: source.sourceRoot,
      skill
    });
  }
  for (const projection of projections) {
    const { sourceRoot, runtimePath } = projection;
    const targetPath = path.resolve(homeRoot, runtimePath);
    if (direction === "pull") {
      skipped.push({ projection, targetPath, sourceRoot });
      continue;
    }
    let sourceStat;
    try {
      sourceStat = fs.lstatSync(sourceRoot);
    } catch {
      refusals.push(`refuse push junction ${runtimePath}: source directory is missing`);
      continue;
    }
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
      refusals.push(`refuse push junction ${runtimePath}: source is not an ordinary directory`);
      continue;
    }
    const parentSafety = safeDirectoryInfo(path.dirname(targetPath), homeRoot);
    if (!parentSafety.safe) {
      refusals.push(`refuse push junction ${runtimePath}: unsafe parent path (${parentSafety.reason})`);
      continue;
    }
    try {
      const targetStat = fs.lstatSync(targetPath);
      if (!targetStat.isSymbolicLink()) {
        refusals.push(`refuse push junction ${runtimePath}: occupied by an ordinary file or directory`);
      } else {
        let resolved;
        try { resolved = fs.realpathSync(targetPath); } catch { resolved = null; }
        if (!resolved || !samePath(resolved, sourceRoot)) {
          refusals.push(`refuse push junction ${runtimePath}: existing reparse target is ambiguous or wrong`);
        } else {
          clean.push({ projection, targetPath, sourceRoot });
        }
      }
    } catch (error) {
      if (error && error.code === "ENOENT") plans.push({ projection, targetPath, sourceRoot });
      else refusals.push(`refuse push junction ${runtimePath}: cannot inspect target safely`);
    }
  }
  return { plans, clean, skipped, refusals };
}

function applyHostJunctions(junctions, homeRoot, dryRun) {
  let created = 0;
  for (const item of junctions.clean) console.log(`clean  push junction ${item.projection.runtimePath}`);
  for (const item of junctions.skipped) {
    console.log(`skip   pull junction ${item.projection.runtimePath}: host projection is push-only`);
  }
  for (const item of junctions.plans) {
    if (dryRun) {
      console.log(`would create push junction ${item.projection.runtimePath} -> ${item.sourceRoot}`);
      continue;
    }
    if (item.projection.kind === "skill") {
      const source = inspectExternalSkillSource(item.projection.skill);
      const data = inspectExternalSkillDataRoot(item.projection.skill);
      if (!source.okay || !data.okay || !samePath(source.sourceRoot, item.sourceRoot)) {
        console.log(`refuse push junction ${item.projection.runtimePath}: external skill source or data root changed before creation`);
        return { ok: false, created };
      }
    }
    const parentSafety = safeDirectoryInfo(path.dirname(item.targetPath), homeRoot);
    if (!parentSafety.safe || fs.existsSync(item.targetPath)) {
      console.log(`refuse push junction ${item.projection.runtimePath}: target changed before creation`);
      return { ok: false, created };
    }
    fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
    try {
      createDirectoryLinkSync(item.sourceRoot, item.targetPath);
    } catch (error) {
      console.log(`refuse push junction ${item.projection.runtimePath}: creation failed (${error.code || "unknown"})`);
      return { ok: false, created };
    }
    console.log(`create push junction ${item.projection.runtimePath}`);
    created += 1;
  }
  return { ok: true, created };
}

function ensureStateHash(nextState, entry, hash) {
  nextState.files[entry.repo] = {
    repo: entry.repo,
    home: entry.home,
    hash,
    updatedAt: new Date().toISOString()
  };
}

function serializeState(state) {
  state.schema = 1;
  state.managedBy = "systems/codex/scripts/sync-codex.mjs";
  state.updatedAt = new Date().toISOString();
  return `${JSON.stringify(state, null, 2)}\n`;
}

function shouldRefusePush(status) {
  return ["drift-unknown", "home-ahead", "conflict", "home-not-file"].includes(status);
}

function shouldRefusePull(status) {
  return ["drift-unknown", "repo-ahead", "conflict", "repo-not-file"].includes(status);
}

function revalidateJunctionPlans(junctions, homeRoot) {
  for (const item of junctions.clean) {
    const classification = classifyHostProjection(item.targetPath, item.sourceRoot, homeRoot);
    if (classification.status !== "clean") {
      throw new Error(`junction changed after preflight: ${item.projection.runtimePath}`);
    }
  }
  for (const item of junctions.plans) {
    if (item.projection.kind === "skill") {
      const source = inspectExternalSkillSource(item.projection.skill);
      const data = inspectExternalSkillDataRoot(item.projection.skill);
      if (!source.okay || !data.okay || !samePath(source.sourceRoot, item.sourceRoot)) {
        throw new Error(`external skill source or data root changed: ${item.projection.runtimePath}`);
      }
    } else {
      const source = safeAbsoluteDirectoryInfo(item.sourceRoot);
      if (!source.safe) throw new Error(`junction source changed: ${item.projection.runtimePath}`);
    }
    const classification = classifyHostProjection(item.targetPath, item.sourceRoot, homeRoot);
    if (classification.status !== "missing") {
      throw new Error(`junction target changed after preflight: ${item.projection.runtimePath}`);
    }
  }
}

function revalidateTombstonePlan(plan, homeRoot, phase) {
  const refreshed = {
    ...plan.tombstone,
    homeInfo: tombstoneFileInfo(plan.tombstone.homePath, homeRoot)
  };
  const result = classifyTombstone(refreshed);
  if (result.status !== "tombstone-pending" || refreshed.homeInfo.hash !== plan.expectedHash) {
    throw new Error(`tombstone changed ${phase}: ${plan.tombstone.home} (${result.status})`);
  }
}

function printDryRun(direction, copyPlans, cleanPlans, junctions, config, stateRel, tombstonePlans, inventory) {
  for (const plan of copyPlans) console.log(`would stage ${direction} ${plan.entry.repo}`);
  if (direction === "push" && config && config.changes.length) {
    console.log(`would stage push config ${config.rel}`);
  }
  console.log(`would stage ${direction} state ${stateRel}`);
  for (const plan of cleanPlans.filter((item) => item.type === "copy")) {
    console.log(`clean  ${direction} ${plan.entry.repo}`);
  }
  for (const plan of copyPlans) console.log(`would copy ${direction} ${plan.entry.repo}`);
  applyHostJunctions(junctions, null, true);
  if (direction === "push" && config) {
    console.log(config.changes.length ? `would patch config ${config.rel}` : `clean  push config ${config.rel}`);
  } else if (config) {
    console.log(`skip   pull config ${config.rel}: mixed-ownership overlay is push-only`);
  }
  for (const record of inventory.records) {
    console.log(`skip   ${direction} inventory ${record.status} ${record.subject}: inventory checks are read-only`);
  }
  console.log(`would write ${direction} state ${stateRel}`);
  for (const plan of cleanPlans.filter((item) => item.type !== "copy")) {
    if (plan.type === "pull-tombstone") {
      console.log(`skip   pull tombstone ${plan.tombstone.home}: home-only cleanup applies only to push`);
    } else {
      console.log(`clean  push tombstone ${plan.tombstone.home}`);
    }
  }
  for (const plan of tombstonePlans) console.log(`would delete tombstone ${plan.tombstone.home}`);
}

function syncDirection({ direction, entries, tombstones, state, manifest, homeRoot, dryRun, force, config, inventory }) {
  const nextState = JSON.parse(JSON.stringify(state));
  const copyPlans = [];
  const tombstonePlans = [];
  const cleanPlans = [];
  const refusals = [];
  const junctions = planHostJunctions(manifest, homeRoot, direction);
  refusals.push(...junctions.refusals.map((message) => `${message}; --force cannot bypass junction ownership safety`));
  const syncStateSafety = state.syncFileSnapshot || safeFileInfo(statePath(manifest, homeRoot), homeRoot);
  if (!syncStateSafety.safe) {
    refusals.push(`refuse ${direction}: unsafe state path (${syncStateSafety.reason}); --force cannot bypass path safety`);
  }

  for (const entry of entries) {
    const result = classify(entry, state);
    const sourcePath = direction === "push" ? entry.repoPath : entry.homePath;
    const targetPath = direction === "push" ? entry.homePath : entry.repoPath;
    const sourceInfo = direction === "push" ? entry.repoInfo : entry.homeInfo;
    const targetInfo = direction === "push" ? entry.homeInfo : entry.repoInfo;
    const sourceSafety = direction === "push" ? entry.repoSafety : entry.homeSafety;
    const targetSafety = direction === "push" ? entry.homeSafety : entry.repoSafety;
    const refuse = direction === "push" ? shouldRefusePush(result.status) : shouldRefusePull(result.status);

    if (!sourceInfo.exists || !sourceInfo.isFile) {
      refusals.push(`refuse ${direction} ${entry.repo}: source is missing or not a file`);
      continue;
    }

    if (!sourceSafety.safe || !targetSafety.safe) {
      refusals.push(`refuse ${direction} ${entry.repo}: unsafe path or reparse point; --force cannot bypass path safety`);
      continue;
    }

    if (targetInfo.exists && !targetInfo.isFile) {
      refusals.push(`refuse ${direction} ${entry.repo}: target is not a file`);
      continue;
    }

    if (refuse && !force) {
      refusals.push(`refuse ${direction} ${entry.repo}: ${result.status}; rerun with --force after reviewing the managed diff`);
      continue;
    }

    if (targetInfo.exists && targetInfo.isFile && targetInfo.hash === sourceInfo.hash) {
      ensureStateHash(nextState, entry, sourceInfo.hash);
      cleanPlans.push({ type: "copy", entry });
      continue;
    }

    ensureStateHash(nextState, entry, sourceInfo.hash);
    copyPlans.push({
      entry,
      sourcePath,
      targetPath,
      sourceInfo,
      targetInfo,
      sourceRoot: direction === "push" ? systemRoot : homeRoot,
      targetRoot: direction === "push" ? homeRoot : systemRoot
    });
  }

  for (const tombstone of tombstones) {
    if (direction === "pull") {
      cleanPlans.push({ type: "pull-tombstone", tombstone });
      continue;
    }
    const result = classifyTombstone(tombstone);
    if (result.status === "tombstone-clean") {
      cleanPlans.push({ type: "tombstone", tombstone });
      continue;
    }
    if (result.status === "tombstone-pending") {
      tombstonePlans.push({ tombstone, expectedHash: tombstone.homeInfo.hash });
      continue;
    }
    refusals.push(
      `refuse push tombstone ${tombstone.home}: ${result.status}; --force cannot bypass tombstone safety checks`
    );
  }

  if (direction === "push" && config) {
    for (const issue of config.issues) {
      refusals.push(`refuse push config ${config.rel}: ${issue}; --force cannot bypass config safety checks`);
    }
    if (!config.issues.length && config.changes.length && config.info.exists && !force) {
      refusals.push(`refuse push config ${config.rel}: managed-key drift; rerun with --force after reviewing managed-only diff`);
    }
    if (!config.issues.length) {
      const refreshed = safeFileInfo(config.path, homeRoot);
      if (!refreshed.safe || refreshed.exists !== config.info.exists || refreshed.hash !== config.originalHash) {
        refusals.push(`refuse push config ${config.rel}: target changed during preflight`);
      }
    }
  }

  for (const plan of tombstonePlans) {
    try { revalidateTombstonePlan(plan, homeRoot, "during preflight"); }
    catch (error) { refusals.push(`refuse push ${error.message}`); }
  }

  if (refusals.length) {
    for (const refusal of refusals) console.log(refusal);
    console.log("preflight refused; no files changed");
    return 2;
  }

  const stateTarget = statePath(manifest, homeRoot);
  const stateRel = manifest.stateFile || ".prompt-sync-state.json";
  if (dryRun) {
    printDryRun(direction, copyPlans, cleanPlans, junctions, config, stateRel, tombstonePlans, inventory);
    return copyPlans.length || tombstonePlans.length || (direction === "push" && config && config.changes.length) ? 1 : 0;
  }

  const stage = { items: [], createdDirs: [], copyItems: [], configItem: null, stateItem: null };
  try {
    for (const plan of copyPlans) stage.copyItems.push(stageCopy(plan, stage));
    if (direction === "push" && config && config.changes.length) {
      stage.configItem = stageText(
        "config", config.path, homeRoot, config.info, config.patchedText, stage, config.rel
      );
    }
    stage.stateItem = stageText(
      "state", stateTarget, homeRoot, syncStateSafety, serializeState(nextState), stage, stateRel
    );
  } catch (error) {
    removeUnusedTemps(stage, true);
    console.log(`staging failed (${error.message}); no managed targets changed`);
    return 2;
  }

  try {
    testPause("before-global-revalidation");
    for (const item of stage.items) revalidateStagedItem(item);
    revalidateJunctionPlans(junctions, homeRoot);
    for (const plan of tombstonePlans) revalidateTombstonePlan(plan, homeRoot, "before apply");
  } catch (error) {
    removeUnusedTemps(stage, true);
    console.log(`global revalidation failed (${error.message}); no managed targets changed`);
    return 2;
  }

  let applied = 0;
  try {
    for (const plan of cleanPlans.filter((item) => item.type === "copy")) {
      console.log(`clean  ${direction} ${plan.entry.repo}`);
    }
    for (const item of stage.copyItems) {
      applyStagedItem(item, direction);
      applied += 1;
    }
    const junctionResult = applyHostJunctions(junctions, homeRoot, false);
    applied += junctionResult.created;
    if (!junctionResult.ok) throw new Error("junction application refused");

    if (direction === "push" && config) {
      if (stage.configItem) {
        applyStagedItem(stage.configItem, direction);
        applied += 1;
      } else {
        console.log(`clean  push config ${config.rel}`);
      }
    } else if (config) {
      console.log(`skip   pull config ${config.rel}: mixed-ownership overlay is push-only`);
    }

    for (const record of inventory.records) {
      console.log(`skip   ${direction} inventory ${record.status} ${record.subject}: inventory checks are read-only`);
    }

    applyStagedItem(stage.stateItem, direction);
    applied += 1;

    testPause("before-tombstones");
    for (const plan of cleanPlans.filter((item) => item.type !== "copy")) {
      if (plan.type === "pull-tombstone") {
        console.log(`skip   pull tombstone ${plan.tombstone.home}: home-only cleanup applies only to push`);
      } else {
        console.log(`clean  push tombstone ${plan.tombstone.home}`);
      }
    }
    for (const plan of tombstonePlans) {
      revalidateTombstonePlan(plan, homeRoot, "immediately before delete");
      // The hash recheck and unlink are separate syscalls; an arbitrary writer
      // can still change the path in this post-check window.
      testPause("after-tombstone-revalidation", plan.tombstone.home);
      fs.unlinkSync(plan.tombstone.homePath);
      console.log(`delete tombstone ${plan.tombstone.home}`);
      applied += 1;
    }
  } catch (error) {
    removeUnusedTemps(stage, true);
    console.log(`sync stopped (${error.message}); partial apply boundary: ${applied} managed mutation(s) completed; rerun after reviewing drift to reconverge`);
    return 2;
  }
  removeUnusedTemps(stage, true);
  return copyPlans.length || tombstonePlans.length || (direction === "push" && config && config.changes.length) ? 1 : 0;
}

async function runPortable(options) {
  const configPath = path.join(systemRoot, LOCAL_CONFIG_FILE);
  if (options.dryRun || options.force) fail("portable commands do not accept --dry-run or --force; use plan and matching --replace-managed authorization");
  if (options.portableCommand === "init") {
    if (!options.homeExplicit) fail("portable init requires an explicit --home or CODEX_HOME; it never defaults to ~/.codex");
    const config = await initializeRuntime({
      baseDir: systemRoot,
      configPath,
      home: options.home,
      codexCli: options.codexCli,
      reconfigure: options.reconfigure
    });
    console.log(`portable config: ${configPath}`);
    console.log(`selected home:   ${config.codexHome}`);
    console.log(`portable core:   ready; selected home unchanged`);
    return;
  }
  if (options.codexCli) {
    fail("--codex-cli is a portable init option");
  }
  if (options.reconfigure) fail("--reconfigure is only valid with portable init");
  const config = await loadRuntimeConfig(systemRoot, configPath);
  if (options.homeExplicit && !samePath(options.home, config.codexHome)) {
    fail(`explicit home does not match portable init: ${config.codexHome}`);
  }
  if (options.portableCommand === "plan") {
    const plan = await createInstallPlan({ baseDir: systemRoot, config, replaceManaged: options.replaceManaged });
    const pending = plan.files.filter((item) => item.state !== "matching").length +
      (plan.seeds ?? []).filter((item) => item.state === "create").length +
      plan.links.filter((item) => item.state !== "matching").length +
      (plan.config.state === "matching" ? 0 : 1) + (plan.marker.state === "matching" ? 0 : 1);
    console.log(`portable plan: ${path.join(systemRoot, ".nb-codex", "install-plan.json")}`);
    console.log(`fingerprint:   ${plan.fingerprint}`);
    console.log(`changes:       ${pending}; selected home unchanged`);
    return;
  }
  if (options.portableCommand === "apply") {
    const applied = await applyInstallPlan({ baseDir: systemRoot, config, replaceManaged: options.replaceManaged });
    console.log(`portable apply: ${applied.files.length} managed files, ${applied.links.length} managed links`);
    console.log(`selected home:  ${config.codexHome}`);
    return;
  }
  if (options.portableCommand === "repair-links") {
    if (options.replaceManaged) fail("--replace-managed is not valid with portable repair-links");
    const repaired = await repairPortableLinks({ baseDir: systemRoot, config });
    console.log(`portable repair-links: removed ${repaired.removed.length} stale core links; ${repaired.clean.length} already clean`);
    console.log("next: portable plan, then portable apply");
    return;
  }
  const result = await doctorRuntime({ baseDir: systemRoot, config });
  console.log(`portable ${options.portableCommand}: ok`);
  console.log(`managed: ${result.fileCount} files, ${result.linkCount} links`);
}

async function routePortableOwnedLegacyHome(options) {
  const inspection = await inspectPortableHomeMarker(options.home);
  if (!inspection.present) return false;
  console.log(`system: ${systemRoot}`);
  console.log(`home:   ${options.home}`);
  if (inspection.error) {
    console.log(`portable ownership marker refused: ${inspection.error}`);
    console.log("legacy mutation is disabled; repair the marker with portable plan/apply from its owning repository");
    process.exit(2);
  }
  if (options.command === "push" || options.command === "pull") {
    console.log(`refuse legacy ${options.command}: this home is owned by the portable-core profile`);
    console.log("no files changed; use portable plan, review its fingerprint, then portable apply");
    process.exit(2);
  }
  try {
    const result = await doctorRuntime({ baseDir: systemRoot, config: inspection.config });
    console.log(`portable ${options.command} clean: ${result.fileCount} managed files, ${result.linkCount} managed links, ownership marker current`);
    process.exit(0);
  } catch (error) {
    console.log(`portable ${options.command} refused: ${error.message}`);
    process.exit(1);
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.command === "portable") {
  try {
    await runPortable(options);
    process.exit(0);
  } catch (error) {
    fail(error.message);
  }
}
await routePortableOwnedLegacyHome(options);
const manifest = loadManifest();
validateRepositoryContract(manifest);
assertSafeHomeRoot(options.home);
const entries = resolveEntries(manifest, options.home);
const tombstones = resolveTombstones(manifest, options.home);
const state = loadState(manifest, options.home);
const features = manifest.configPatch ? discoverFeatures() : { probed: true, names: new Set() };
const config = analyzeConfig(manifest, options.home, features);
const inventory = inspectAgentInventory(manifest, options.home);
const externalSkills = inspectExternalSkills(manifest, options.home);

console.log(`system: ${systemRoot}`);
console.log(`home:   ${options.home}`);

if (options.command === "status") {
  process.exit(printStatus(entries, tombstones, state, config, inventory, externalSkills));
}
if (options.command === "diff") {
  process.exit(runDiff(entries, tombstones, config, inventory, externalSkills));
}
if (options.command === "push" || options.command === "pull") {
  const code = syncDirection({
    direction: options.command,
    entries,
    tombstones,
    state,
    manifest,
    homeRoot: options.home,
    dryRun: options.dryRun,
    force: options.force,
    config,
    inventory
  });
  process.exit(code === 2 ? 2 : 0);
}
