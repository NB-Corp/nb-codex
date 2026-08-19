import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildOverlaySpec,
  configOverlayValid as structuralConfigOverlayValid,
  managedConfigConflict as structuralManagedConfigConflict,
  parseScalar,
  renderConfig as renderStructuralConfig,
  scanToml,
} from './toml-overlay.mjs';
import { createDirectoryLinkSync, writeBackupBytesSync } from './runtime-fs.mjs';

const LOCAL_CONFIG_SCHEMA = 1;
const PROFILE_FILE = 'portable-profile.json';
const LOCAL_CONFIG_FILE = '.nb-codex.local.json';
const RECEIPT_ROOT = '.nb-codex';
const INSTALL_PLAN_FILE = `${RECEIPT_ROOT}/install-plan.json`;
const HOME_MARKER_FILE = '.nb-codex-managed.json';

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(file, label = file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    fail(`cannot read ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON in ${label}: ${error.message}`);
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail(`${label} must be an absolute path`);
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) fail(`${label} cannot be a filesystem root`);
  return resolved;
}

function portable(value) {
  return path.resolve(value).replaceAll('\\', '/');
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) fail(`${label} must be a non-empty relative path`);
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${label} is unsafe: ${value}`);
  return normalized;
}

async function assertOrdinaryExistingDirectory(target, label) {
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') fail(`${label} does not exist: ${target}`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} must be an ordinary directory: ${target}`);
  const resolved = await realpath(target);
  if (!samePath(resolved, target)) fail(`${label} resolves through a reparse/symbolic path: ${target}`);
}

async function assertOrdinaryExistingFile(target, label) {
  await assertSafeExistingAncestors(path.dirname(target), `${label} parent`);
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') fail(`${label} does not exist: ${target}`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be an ordinary file: ${target}`);
}

async function assertSafeExistingAncestors(target, label) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const segments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let missing = false;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (missing) continue;
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') {
        missing = true;
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) fail(`${label} crosses a reparse/symbolic path: ${current}`);
    if (!stat.isDirectory()) fail(`${label} crosses a non-directory path: ${current}`);
  }
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function replaceExactly(text, needle, replacement, expected, label) {
  const actual = count(text, needle);
  if (actual !== expected) fail(`${label} anchor count drifted: expected ${expected}, found ${actual}`);
  return text.split(needle).join(replacement);
}

async function loadPortableProfile(baseDir) {
  const file = path.join(baseDir, PROFILE_FILE);
  const profile = await readJson(file, PROFILE_FILE);
  if (profile?.schemaVersion !== 1 || profile.id !== 'portable-core') fail('portable profile schema or identity is invalid');
  const canonical = profile.canonicalSelection;
  if (!canonical || typeof canonical !== 'object') fail('portable profile canonicalSelection is invalid');
  const syncManifestRel = safeRelative(canonical.syncManifest, 'portable sync manifest');
  const agentSetId = safeRelative(canonical.agentSet, 'portable agent set');
  if (agentSetId.includes('/')) fail('portable agent set must be an identifier');
  const skillRoot = safeRelative(canonical.skillRoot, 'portable skill root');
  if (skillRoot.includes('/')) fail('portable skill root must be one directory name');
  const syncManifestPath = path.join(baseDir, ...syncManifestRel.split('/'));
  const syncManifest = await readJson(syncManifestPath, 'sync-manifest.json');
  if (syncManifest?.schema !== 2 || !Array.isArray(syncManifest.files) || !Array.isArray(syncManifest.agentSets)) {
    fail('canonical sync-manifest portable selection contract is invalid');
  }
  const agentSet = syncManifest.agentSets.find((set) => set.id === agentSetId && set.ownership === 'full-file');
  if (!agentSet || !Array.isArray(agentSet.roles)) fail(`canonical agent set is missing: ${agentSetId}`);
  const fileByRepo = new Map();
  for (const entry of syncManifest.files) {
    const repo = safeRelative(entry.repo, 'canonical managed repo file');
    const home = safeRelative(entry.home, 'canonical managed home file');
    if (fileByRepo.has(repo)) fail(`duplicate canonical managed file: ${repo}`);
    fileByRepo.set(repo, { ...entry, repo, home });
  }
  const agentFiles = [];
  const agentPaths = new Set();
  for (const role of agentSet.roles) {
    const repo = safeRelative(role.repo, `canonical agent ${role.name}`);
    const entry = fileByRepo.get(repo);
    if (!entry || entry.home !== repo || path.posix.dirname(repo) !== 'agents') {
      fail(`canonical portable agent mapping is invalid: ${repo}`);
    }
    agentPaths.add(repo);
    agentFiles.push(path.posix.basename(repo));
  }
  const skillPrefix = `${skillRoot}/`;
  const coreSkills = [...new Set([...fileByRepo.keys()]
    .filter((repo) => repo.startsWith(skillPrefix))
    .map((repo) => repo.slice(skillPrefix.length).split('/')[0]))].sort();
  const coreSkillFiles = Object.fromEntries(coreSkills.map((skill) => {
    const prefix = `${skillPrefix}${skill}/`;
    const files = [...fileByRepo.values()].filter((entry) => entry.repo.startsWith(prefix)).map((entry) => {
      if (entry.home !== entry.repo) fail(`canonical portable skill mapping must preserve its relative path: ${entry.repo}`);
      return entry.repo.slice(prefix.length);
    }).sort();
    return [skill, files];
  }));
  const exactFiles = [...fileByRepo.values()]
    .filter((entry) => entry.repo !== 'AGENTS.md' && !agentPaths.has(entry.repo) && !entry.repo.startsWith(skillPrefix))
    .map((entry) => {
      if (entry.home !== entry.repo) fail(`canonical portable file mapping must preserve its relative path: ${entry.repo}`);
      return entry.repo;
    });
  if (fileByRepo.has('AGENTS.md') || exactFiles.length !== 5 || agentFiles.length !== 7 || coreSkills.length !== 2) {
    fail('canonical manifest must resolve to 5 exact files, 7 coding agents, and 2 core skills; AGENTS.md is advise-only');
  }
  if (!profile.externalComponents || typeof profile.externalComponents !== 'object') fail('portable profile externalComponents is invalid');
  for (const [name, component] of Object.entries(profile.externalComponents)) {
    if (!component || typeof component !== 'object' || typeof component.owner !== 'string' ||
        !Object.hasOwn(component, 'source') || !Object.hasOwn(component, 'ref') ||
        component.required !== false || component.enabledByDefault !== false) {
      fail(`portable external component metadata is invalid: ${name}`);
    }
    safeRelative(component.runtimePath, `portable external runtime path ${name}`);
    if (component.sourceSubpath) safeRelative(component.sourceSubpath, `portable external source path ${name}`);
    if (component.sharedPromptSource) safeRelative(component.sharedPromptSource, `portable external prompt source ${name}`);
    if (component.sharedPromptRuntime) safeRelative(component.sharedPromptRuntime, `portable external prompt runtime ${name}`);
    if (component.roles !== undefined) {
      if (!Array.isArray(component.roles) || component.roles.length === 0) fail(`portable external roles are invalid: ${name}`);
      const roleNames = new Set();
      const roleFiles = new Set();
      for (const role of component.roles) {
        if (!role || typeof role.name !== 'string' || typeof role.file !== 'string') fail(`portable external role is invalid: ${name}`);
        const roleFile = safeRelative(role.file, `portable external role file ${name}`);
        if (roleFile.includes('/') || roleNames.has(role.name) || roleFiles.has(roleFile)) fail(`portable external role duplicates or nests a file: ${name}`);
        roleNames.add(role.name);
        roleFiles.add(roleFile);
      }
    }
  }
  return {
    manifest: { ...profile, syncManifest: syncManifestRel, exactFiles, agentFiles, coreSkills, coreSkillFiles },
    bytes: await readFile(file),
    syncManifest,
    syncManifestBytes: await readFile(syncManifestPath),
  };
}

function validateRuntimeConfig(config, configPath) {
  if (config?.schemaVersion !== LOCAL_CONFIG_SCHEMA) fail(`${configPath} schemaVersion must be ${LOCAL_CONFIG_SCHEMA}; run portable init`);
  config.codexHome = absolute(config.codexHome, 'codexHome');
  if (config.productFeedbackDataRoot !== null && config.productFeedbackDataRoot !== undefined) {
    config.productFeedbackDataRoot = absolute(config.productFeedbackDataRoot, 'productFeedbackDataRoot');
  } else config.productFeedbackDataRoot = null;
  if (config.codexCli !== null && config.codexCli !== undefined) config.codexCli = absolute(config.codexCli, 'codexCli');
  else config.codexCli = null;
  if (!config.adoptions || typeof config.adoptions !== 'object' || Array.isArray(config.adoptions)) config.adoptions = {};
  for (const [name, root] of Object.entries(config.adoptions)) config.adoptions[name] = absolute(root, `adoption ${name}`);
  return config;
}

export async function initializeRuntime({ baseDir, configPath = path.join(baseDir, LOCAL_CONFIG_FILE), home, productFeedbackDataRoot = null, codexCli = null, adoptions = {}, reconfigure = false }) {
  const selectedHome = absolute(home, '--home or CODEX_HOME');
  const configExists = await exists(configPath);
  const old = configExists
    ? validateRuntimeConfig(await readJson(configPath, configPath), configPath)
    : null;
  const preserveExisting = reconfigure && old !== null;
  const selectedFeedback = productFeedbackDataRoot === null
    ? (preserveExisting ? old.productFeedbackDataRoot : null)
    : absolute(productFeedbackDataRoot, '--product-feedback-data-root');
  const selectedCli = codexCli === null
    ? (preserveExisting ? old.codexCli : null)
    : absolute(codexCli, '--codex-cli');
  const selectedAdoptions = preserveExisting ? { ...old.adoptions } : {};
  for (const [name, root] of Object.entries(adoptions)) selectedAdoptions[name] = absolute(root, `--adopt ${name}`);
  const next = {
    schemaVersion: LOCAL_CONFIG_SCHEMA,
    codexHome: selectedHome,
    productFeedbackDataRoot: selectedFeedback,
    codexCli: selectedCli,
    adoptions: selectedAdoptions,
  };
  if (configExists) {
    const current = await readFile(configPath, 'utf8');
    const desired = `${JSON.stringify(next, null, 2)}\n`;
    if (current === desired) return next;
    if (!reconfigure) {
      fail(`local config already exists with different runtime choices: ${configPath}; rerun portable init with --reconfigure`);
    }
  }
  if (!samePath(path.dirname(configPath), baseDir)) fail('portable init writes only the repository-owned ignored local config');
  await writeJson(configPath, next);
  return next;
}

async function validateFeedback(skillRoot, dataRoot) {
  await assertOrdinaryExistingDirectory(dataRoot, 'product feedback data root');
  await assertOrdinaryExistingDirectory(skillRoot, 'product feedback skill root');
  if (inside(skillRoot, dataRoot) || inside(dataRoot, skillRoot)) {
    fail('product feedback skill and data roots must be separate directory trees');
  }
  const cli = path.join(skillRoot, 'scripts', 'product-feedback-cli', 'cli.mjs');
  const result = spawnSync(process.execPath, [cli, 'doctor', '--root', dataRoot], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(`cannot run adopted product feedback doctor: ${result.error.message}`);
  if (result.status !== 0) fail(`adopted product feedback doctor failed: ${(result.stderr || result.stdout).trim()}`);
  return { command: `${process.execPath} ${cli} doctor --root ${dataRoot}`, output: result.stdout.trim() };
}

async function validateScienceAdoption(profile, scienceRoot) {
  const component = profile.externalComponents['science-agents'];
  if (!component || !Array.isArray(component.roles) || component.roles.length !== 5) {
    fail('portable science component must declare exactly five roles');
  }
  const agentsRoot = path.join(scienceRoot, ...component.sourceSubpath.split('/'));
  await assertOrdinaryExistingDirectory(agentsRoot, 'science agents root');
  const expectedFiles = new Set(component.roles.map((role) => role.file));
  const observedToml = [];
  const observedCaseKeys = new Set();
  async function inventoryToml(current, relative) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) fail(`science agents inventory contains a symbolic link: ${rel}`);
      if (entry.isDirectory()) {
        await inventoryToml(target, rel);
        continue;
      }
      if (!entry.isFile()) fail(`science agents inventory contains a special file: ${rel}`);
      if (!entry.name.toLowerCase().endsWith('.toml')) continue;
      const caseKey = rel.toLowerCase();
      if (observedCaseKeys.has(caseKey)) fail(`science role inventory contains duplicate case-insensitive paths: ${rel}`);
      observedCaseKeys.add(caseKey);
      observedToml.push(rel);
    }
  }
  await inventoryToml(agentsRoot, '');
  const missing = [...expectedFiles].filter((name) => !observedToml.includes(name));
  const extra = observedToml.filter((name) => !expectedFiles.has(name));
  if (missing.length || extra.length) {
    fail(`science role inventory mismatch (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
  }
  for (const role of component.roles) {
    const source = path.join(agentsRoot, role.file);
    await assertOrdinaryExistingFile(source, `science role ${role.name}`);
    const document = scanToml(await readFile(source, 'utf8'));
    const names = document.assignments.filter((assignment) => assignment.path === 'name');
    if (names.length !== 1) fail(`science role must declare one top-level name: ${role.file}`);
    let actual;
    try {
      actual = parseScalar(names[0].valueText);
    } catch (error) {
      fail(`science role name is invalid in ${role.file}: ${error.message}`);
    }
    if (actual !== role.name) fail(`science role identity mismatch: ${role.file} declares ${actual}`);
  }
  const sharedPrompt = path.join(scienceRoot, ...component.sharedPromptSource.split('/'));
  await assertOrdinaryExistingFile(sharedPrompt, 'science shared prompt');
  if ((await readFile(sharedPrompt)).length === 0) fail('science shared prompt must not be empty');
}

function codexInvocation(config) {
  if (!config.codexCli) return { command: 'codex', prefix: [] };
  if (/\.(?:mjs|cjs|js)$/i.test(config.codexCli)) return { command: process.execPath, prefix: [config.codexCli] };
  return { command: config.codexCli, prefix: [] };
}

async function probeFeatures(baseDir, config) {
  const invocation = codexInvocation(config);
  const args = [...invocation.prefix, 'features', 'list'];
  const probeParent = path.join(baseDir, RECEIPT_ROOT, 'feature-probes');
  await mkdir(probeParent, { recursive: true });
  await assertOrdinaryExistingDirectory(probeParent, 'feature probe parent');
  const probeHome = path.join(probeParent, `probe-${process.pid}-${randomUUID()}`);
  if (!inside(probeParent, probeHome) || path.dirname(probeHome) !== probeParent) fail('unsafe feature probe path');
  await mkdir(probeHome);
  try {
    const result = spawnSync(invocation.command, args, {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CODEX_HOME: probeHome },
    });
    if (result.error) fail(`Codex feature probe could not start: ${result.error.message}`);
    if (result.status !== 0) fail(`Codex feature probe failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
    return {
      command: [invocation.command, ...args],
      stdout: result.stdout,
      stdoutSha256: sha256(Buffer.from(result.stdout)),
    };
  } finally {
    if (!inside(probeParent, probeHome) || path.dirname(probeHome) !== probeParent) fail('unsafe feature probe cleanup path');
    const stat = await lstat(probeHome).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (stat?.isSymbolicLink()) await unlink(probeHome);
    else if (stat) await rm(probeHome, { recursive: true, force: true });
    if (await exists(probeHome)) fail(`feature probe CODEX_HOME cleanup failed: ${probeHome}`);
  }
}

async function desiredRuntimeFiles(baseDir, manifest, config) {
  const files = [];
  for (const relative of manifest.exactFiles) {
    const source = path.join(baseDir, ...relative.split('/'));
    await assertOrdinaryExistingFile(source, `portable source ${relative}`);
    files.push({ relative, source, bytes: await readFile(source), transform: 'exact-copy' });
  }
  for (const name of manifest.agentFiles) {
    const source = path.join(baseDir, 'agents', name);
    await assertOrdinaryExistingFile(source, `portable source agents/${name}`);
    let text = await readFile(source, 'utf8');
    const anchor = manifest.agentsTransform.promptAssignment;
    if (count(text, anchor) !== manifest.agentsTransform.expectedCountPerFile) {
      fail(`agents/${name} prompt path anchor count drifted`);
    }
    text = text.replace(anchor, `model_instructions_file = "${portable(config.codexHome)}/`);
    files.push({ relative: `agents/${name}`, source, bytes: Buffer.from(text), transform: 'absolute-prompt-path' });
  }
  if (files.length !== 12) fail(`portable profile materialized an unexpected file count: ${files.length}`);
  return files;
}

async function observeFile(target) {
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') return { type: 'absent' };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    let declaredTarget = null;
    try {
      const raw = await readlink(target);
      declaredTarget = portable(path.isAbsolute(raw) ? raw : path.resolve(path.dirname(target), raw));
    } catch (error) {
      if (!['EINVAL', 'UNKNOWN'].includes(error.code)) throw error;
    }
    try {
      return { type: 'link', link: portable(await realpath(target)), declaredTarget, dangling: false };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { type: 'link', link: declaredTarget, declaredTarget, dangling: true };
    }
  }
  if (stat.isFile()) return { type: 'file', sha256: sha256(await readFile(target)) };
  if (stat.isDirectory()) return { type: 'directory' };
  return { type: 'special' };
}

async function fingerprintDirectory(root) {
  const entries = [];
  async function walk(current, relative) {
    const names = await readdir(current, { withFileTypes: true });
    for (const entry of names.sort((left, right) => left.name.localeCompare(right.name))) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) fail(`runtime source tree contains a symbolic link: ${target}`);
      if (entry.isDirectory()) await walk(target, rel);
      else if (entry.isFile()) entries.push({ path: rel, sha256: sha256(await readFile(target)) });
      else fail(`runtime source tree contains a special file: ${target}`);
    }
  }
  await walk(root, '');
  return { entries, sha256: fingerprint(entries) };
}

async function buildLinkPlan(baseDir, manifest, config) {
  const links = [];
  for (const skill of manifest.coreSkills) {
    links.push({
      relative: `skills/${skill}`,
      source: path.join(baseDir, 'skills', skill),
      owner: 'nb-codex',
      expectedFiles: manifest.coreSkillFiles[skill],
    });
  }
  const feedbackRoot = config.adoptions['product-feedback'];
  if (feedbackRoot) links.push({ relative: 'skills/product-feedback', source: feedbackRoot, owner: 'ProductStewardship' });
  const scienceRoot = config.adoptions['science-agents'];
  if (scienceRoot) {
    const component = manifest.externalComponents['science-agents'];
    links.push({
      relative: component.runtimePath,
      source: path.join(scienceRoot, ...component.sourceSubpath.split('/')),
      owner: component.owner,
    });
  }
  for (const item of links) {
    await assertOrdinaryExistingDirectory(item.source, `runtime source ${item.relative}`);
    item.sourceRealpath = portable(await realpath(item.source));
    item.sourceTree = await fingerprintDirectory(item.source);
    item.target = path.join(config.codexHome, ...item.relative.split('/'));
    item.observed = await observeFile(item.target);
    if (item.observed.type === 'link') {
      const expected = item.sourceRealpath;
      if (item.observed.dangling || item.observed.link !== expected) {
        fail(`managed link is ${item.observed.dangling ? 'dangling' : 'pointing to the wrong source'}: ${item.target}; run portable repair-links from the current repository, then portable plan/apply`);
      }
      item.state = 'matching';
    } else if (item.observed.type === 'absent') item.state = 'create';
    else fail(`managed skill target is occupied and cannot be replaced: ${item.target}`);
  }
  return links;
}

function fingerprint(value) {
  const copy = structuredClone(value);
  delete copy.fingerprint;
  return sha256(Buffer.from(JSON.stringify(copy)));
}

function markerRuntimeConfig(config) {
  return {
    schemaVersion: LOCAL_CONFIG_SCHEMA,
    codexHome: portable(config.codexHome),
    productFeedbackDataRoot: config.productFeedbackDataRoot ? portable(config.productFeedbackDataRoot) : null,
    codexCli: config.codexCli ? portable(config.codexCli) : null,
    adoptions: Object.fromEntries(Object.entries(config.adoptions).sort().map(([name, root]) => [name, portable(root)])),
  };
}

function buildHomeMarker({ baseDir, config, manifest, sourceIdentity, fileEntries, links }) {
  return {
    schemaVersion: 1,
    product: 'nb-codex',
    profile: manifest.id,
    selectedHome: portable(config.codexHome),
    sourceRepository: portable(baseDir),
    sourceFingerprint: fingerprint(sourceIdentity),
    runtimeConfig: markerRuntimeConfig(config),
    managedFiles: [...fileEntries.map((item) => item.relative), 'config.toml'].sort(),
    managedLinks: links.map((item) => ({
      relative: item.relative,
      owner: item.owner,
      sourceRealpath: item.sourceRealpath,
    })).sort((left, right) => left.relative.localeCompare(right.relative)),
  };
}

function markerBytes(marker) {
  return Buffer.from(`${JSON.stringify(marker, null, 2)}\n`);
}

function validateHomeMarker(marker, selectedHome, label) {
  if (!marker || marker.schemaVersion !== 1 || marker.product !== 'nb-codex' ||
      marker.profile !== 'portable-core' || typeof marker.sourceRepository !== 'string' ||
      typeof marker.selectedHome !== 'string' || typeof marker.runtimeConfig?.codexHome !== 'string' ||
      !Array.isArray(marker.managedFiles) || !Array.isArray(marker.managedLinks) ||
      !marker.runtimeConfig || typeof marker.runtimeConfig !== 'object') {
    fail(`${label} is not a valid nb-codex portable ownership marker`);
  }
  if (!samePath(marker.selectedHome, selectedHome) || !samePath(marker.runtimeConfig.codexHome, selectedHome)) {
    fail(`${label} selects a different Codex home`);
  }
  const config = validateRuntimeConfig(structuredClone(marker.runtimeConfig), label);
  for (const link of marker.managedLinks) {
    if (!link || typeof link.relative !== 'string' || typeof link.owner !== 'string' || typeof link.sourceRealpath !== 'string') {
      fail(`${label} contains an invalid managed link record`);
    }
    safeRelative(link.relative, `${label} managed link`);
  }
  return { marker, config };
}

export async function inspectPortableHomeMarker(home) {
  const selectedHome = absolute(home, 'Codex home');
  const target = path.join(selectedHome, HOME_MARKER_FILE);
  const observed = await observeFile(target);
  if (observed.type === 'absent') return { present: false, target, observed };
  if (observed.type !== 'file') {
    return { present: true, target, observed, error: 'portable ownership marker is not an ordinary file' };
  }
  try {
    const parsed = JSON.parse(await readFile(target, 'utf8'));
    const validated = validateHomeMarker(parsed, selectedHome, target);
    return { present: true, target, observed, ...validated };
  } catch (error) {
    return { present: true, target, observed, error: error.message };
  }
}

export async function repairPortableLinks({ baseDir, config }) {
  const inspection = await inspectPortableHomeMarker(config.codexHome);
  if (!inspection.present) fail(`portable ownership marker is missing: ${inspection.target}`);
  if (inspection.error) fail(inspection.error);
  const { manifest } = await loadPortableProfile(baseDir);
  const allowed = new Set(manifest.coreSkills.map((name) => `skills/${name}`));
  const removed = [];
  const clean = [];
  for (const record of inspection.marker.managedLinks) {
    if (record.owner !== 'nb-codex') continue;
    if (!allowed.has(record.relative)) fail(`portable ownership marker declares an unknown core link: ${record.relative}`);
    const target = path.resolve(config.codexHome, ...record.relative.split('/'));
    if (!inside(config.codexHome, target)) fail(`portable repair link escapes selected home: ${record.relative}`);
    const observed = await observeFile(target);
    if (observed.type === 'absent') continue;
    if (observed.type !== 'link') fail(`portable repair refuses an ordinary occupied target: ${target}`);
    const expectedSource = path.join(baseDir, ...record.relative.split('/'));
    await assertOrdinaryExistingDirectory(expectedSource, `current core skill ${record.relative}`);
    const expectedRealpath = portable(await realpath(expectedSource));
    if (!observed.dangling && observed.link === expectedRealpath) {
      clean.push(record.relative);
      continue;
    }
    const immediate = await observeFile(target);
    if (!observationsEqual(immediate, observed)) fail(`portable repair link changed before unlink: ${target}`);
    await unlink(target);
    removed.push(record.relative);
  }
  return { removed, clean, sourceRepository: inspection.marker.sourceRepository, currentRepository: portable(baseDir) };
}

export async function createInstallPlan({ baseDir, config, replaceManaged = false, writePlan = true }) {
  const { manifest, bytes: profileBytes, syncManifest, syncManifestBytes } = await loadPortableProfile(baseDir);
  await assertSafeExistingAncestors(config.codexHome, 'selected CODEX_HOME');
  await assertOrdinaryExistingDirectory(path.dirname(config.codexHome), 'selected CODEX_HOME parent');
  if (inside(baseDir, config.codexHome) || inside(config.codexHome, baseDir)) {
    fail('selected CODEX_HOME and repository must be separate directory trees');
  }
  for (const name of Object.keys(config.adoptions)) {
    if (!Object.hasOwn(manifest.externalComponents, name)) fail(`unknown adopted external component: ${name}`);
  }
  if (Boolean(config.productFeedbackDataRoot) !== Boolean(config.adoptions['product-feedback'])) {
    fail('Product Feedback adoption requires both --adopt product-feedback=<skill-root> and --product-feedback-data-root');
  }
  for (const [key, root] of Object.entries(config.adoptions)) {
    if (inside(baseDir, root) || inside(root, baseDir)) {
      fail(`adopted component ${key} and repository must be separate directory trees`);
    }
    if (inside(root, config.codexHome) || inside(config.codexHome, root)) {
      fail(`selected CODEX_HOME and adopted component ${key} must be separate directory trees`);
    }
  }
  if (config.productFeedbackDataRoot &&
      (inside(config.codexHome, config.productFeedbackDataRoot) || inside(config.productFeedbackDataRoot, config.codexHome))) {
    fail('product feedback data root and selected CODEX_HOME must be separate directory trees');
  }
  if (config.productFeedbackDataRoot &&
      (inside(baseDir, config.productFeedbackDataRoot) || inside(config.productFeedbackDataRoot, baseDir))) {
    fail('product feedback data root and repository must be separate directory trees');
  }
  for (const parent of ['agents', 'policies', 'prompts', 'skills']) {
    const target = path.join(config.codexHome, parent);
    await assertSafeExistingAncestors(target, `managed parent ${parent}`);
    if (await exists(target)) {
      const stat = await lstat(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`managed parent is unsafe: ${target}`);
    }
  }
  let feedbackDoctor = null;
  if (config.productFeedbackDataRoot) feedbackDoctor = await validateFeedback(config.adoptions['product-feedback'], config.productFeedbackDataRoot);
  if (config.adoptions['science-agents']) await validateScienceAdoption(manifest, config.adoptions['science-agents']);
  const featureProbe = await probeFeatures(baseDir, config);
  const spec = buildOverlaySpec(syncManifest, config.codexHome, featureProbe.stdout);
  const desired = await desiredRuntimeFiles(baseDir, manifest, config);
  const fileEntries = [];
  const replacements = [];
  for (const item of desired) {
    const target = path.join(config.codexHome, ...item.relative.split('/'));
    const observed = await observeFile(target);
    const desiredHash = sha256(item.bytes);
    let state;
    if (observed.type === 'absent') state = 'create';
    else if (observed.type === 'file' && observed.sha256 === desiredHash) state = 'matching';
    else if (observed.type === 'file' && replaceManaged) {
      state = 'replace';
      replacements.push(item.relative);
    } else if (observed.type === 'file') fail(`managed file differs; plan again with --replace-managed to replace it: ${target}`);
    else fail(`managed file target is not an ordinary file and cannot be replaced: ${target}`);
    fileEntries.push({ relative: item.relative, target, source: item.source, transform: item.transform, desiredSha256: desiredHash, observed, state });
  }
  const configTarget = path.join(config.codexHome, 'config.toml');
  const configObserved = await observeFile(configTarget);
  if (!['absent', 'file'].includes(configObserved.type)) fail(`config.toml target is not an ordinary file: ${configTarget}`);
  const currentConfig = configObserved.type === 'file' ? await readFile(configTarget, 'utf8') : '';
  const desiredConfig = renderStructuralConfig(currentConfig, spec);
  const configHash = sha256(Buffer.from(desiredConfig));
  let configState = configObserved.type === 'absent' ? 'create' : configObserved.sha256 === configHash ? 'matching' : 'merge';
  if (configState === 'merge' && structuralManagedConfigConflict(currentConfig, spec)) {
    if (!replaceManaged) fail(`managed config values differ; plan again with --replace-managed: ${configTarget}`);
    configState = 'replace-managed-overlay';
    replacements.push('config.toml');
  }
  const links = await buildLinkPlan(baseDir, manifest, config);
  const sourceIdentity = {
    profileSha256: sha256(profileBytes),
    syncManifestSha256: sha256(syncManifestBytes),
    files: fileEntries.map((item) => ({ relative: item.relative, desiredSha256: item.desiredSha256, transform: item.transform })),
    links: links.map((item) => ({ relative: item.relative, sourceRealpath: item.sourceRealpath, sourceTreeSha256: item.sourceTree.sha256, owner: item.owner, manifestFiles: item.expectedFiles ?? null })),
  };
  const desiredMarker = buildHomeMarker({ baseDir, config, manifest, sourceIdentity, fileEntries, links });
  const desiredMarkerBytes = markerBytes(desiredMarker);
  const markerTarget = path.join(config.codexHome, HOME_MARKER_FILE);
  const markerObserved = await observeFile(markerTarget);
  if (!['absent', 'file'].includes(markerObserved.type)) fail(`portable ownership marker target is not an ordinary file: ${markerTarget}`);
  const markerDesiredSha256 = sha256(desiredMarkerBytes);
  let markerState = markerObserved.type === 'absent' ? 'create' : markerObserved.sha256 === markerDesiredSha256 ? 'matching' : 'update';
  if (markerState === 'update') {
    let priorMarker;
    try {
      priorMarker = JSON.parse(await readFile(markerTarget, 'utf8'));
      validateHomeMarker(priorMarker, config.codexHome, markerTarget);
    } catch (error) {
      fail(`portable ownership marker cannot be replaced safely: ${error.message}`);
    }
  }
  const targetIdentity = {
    files: fileEntries.map((item) => ({ relative: item.relative, observed: item.observed })),
    config: configObserved,
    links: links.map((item) => ({ relative: item.relative, observed: item.observed })),
    marker: markerObserved,
  };
  const optionsIdentity = {
    profile: manifest.id,
    selectedHome: portable(config.codexHome),
    codexCli: config.codexCli ? portable(config.codexCli) : 'PATH:codex',
    replaceManaged,
    productFeedbackDataRoot: config.productFeedbackDataRoot ? portable(config.productFeedbackDataRoot) : null,
    adoptions: Object.fromEntries(Object.entries(config.adoptions).sort().map(([name, root]) => [name, portable(root)])),
  };
  const plan = {
    schemaVersion: 1,
    product: 'nb-codex',
    profile: manifest.id,
    selectedHome: config.codexHome,
    options: optionsIdentity,
    fingerprints: {
      options: fingerprint(optionsIdentity),
      sources: fingerprint(sourceIdentity),
      targets: fingerprint(targetIdentity),
    },
    sourceIdentity,
    targetIdentity,
    featureProbe: { command: featureProbe.command, stdoutSha256: featureProbe.stdoutSha256, exposed: spec.exposed },
    feedbackDoctor,
    files: fileEntries,
    config: { target: configTarget, desiredSha256: configHash, observed: configObserved, state: configState },
    links: links.map((item) => ({ relative: item.relative, source: item.source, sourceRealpath: item.sourceRealpath, sourceTreeSha256: item.sourceTree.sha256, target: item.target, observed: item.observed, state: item.state })),
    marker: { relative: HOME_MARKER_FILE, target: markerTarget, desiredSha256: markerDesiredSha256, observed: markerObserved, state: markerState },
    replacements,
  };
  plan.fingerprint = fingerprint(plan);
  Object.defineProperty(plan, '_desiredConfig', { value: desiredConfig, enumerable: false });
  Object.defineProperty(plan, '_desiredFiles', {
    value: new Map(desired.map((item) => [item.relative, Buffer.from(item.bytes)])),
    enumerable: false,
  });
  Object.defineProperty(plan, '_desiredMarker', { value: desiredMarkerBytes, enumerable: false });
  if (writePlan) {
    const receiptDir = path.join(baseDir, RECEIPT_ROOT);
    await mkdir(receiptDir, { recursive: true });
    await writeJson(path.join(baseDir, INSTALL_PLAN_FILE), plan);
  }
  return plan;
}

async function createFixedParents(home, operations) {
  const dirs = [home, ...['agents', 'policies', 'prompts', 'skills'].map((name) => path.join(home, name))];
  for (const directory of dirs) {
    if (await exists(directory)) {
      const stat = await lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`managed parent is unsafe: ${directory}`);
    } else {
      await mkdir(directory);
      operations.push({ kind: 'created-dir', target: directory });
    }
  }
}

async function atomicWrite(target, bytes, expectedObservation, label) {
  const temp = `${target}.nb-codex-${process.pid}-${randomUUID()}.tmp`;
  await writeFile(temp, bytes, { flag: 'wx' });
  try {
    if (process.env.NB_CODEX_TEST_MODE === '1' &&
        process.env.NB_CODEX_TEST_BEFORE_RENAME_RELATIVE === label) {
      const marker = process.env.NB_CODEX_TEST_BEFORE_RENAME_MARKER;
      if (marker) await writeFile(marker, 'ready\n');
      const delay = Number(process.env.NB_CODEX_TEST_BEFORE_RENAME_DELAY_MS ?? 0);
      if (Number.isFinite(delay) && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)));
      }
    }
    const immediate = await observeFile(target);
    if (!observationsEqual(immediate, expectedObservation)) {
      fail(`${label} changed immediately before atomic replace: ${target}`);
    }
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function maybeInjectedFailure(counter) {
  const raw = process.env.NB_CODEX_TEST_FAIL_AFTER;
  if (raw !== undefined && Number(raw) === counter) fail(`injected install failure after operation ${counter}`);
}

function observationsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function recheckTarget(item, label) {
  const parent = path.dirname(item.target);
  await assertSafeExistingAncestors(parent, `${label} parent`);
  await assertOrdinaryExistingDirectory(parent, `${label} parent`);
  const observed = await observeFile(item.target);
  if (!observationsEqual(observed, item.observed)) {
    fail(`${label} changed after the approved plan: ${item.target}`);
  }
}

async function writePlannedFile(item, bytes) {
  if (item.observed.type === 'absent') await writeFile(item.target, bytes, { flag: 'wx' });
  else await atomicWrite(item.target, bytes, item.observed, item.relative ?? 'managed file');
}

async function maybeInjectTargetDrift(items) {
  const relative = process.env.NB_CODEX_TEST_DRIFT_BEFORE_MUTATION;
  if (!relative) return;
  const item = items.find((candidate) => candidate.relative === relative);
  if (!item) fail(`test drift target is not in the plan: ${relative}`);
  delete process.env.NB_CODEX_TEST_DRIFT_BEFORE_MUTATION;
  await writeFile(item.target, 'concurrent-target-drift\n', { flag: item.observed.type === 'absent' ? 'wx' : 'w' });
}

async function maybeInjectRollbackDrift(operations) {
  const relative = process.env.NB_CODEX_TEST_DRIFT_BEFORE_ROLLBACK;
  if (!relative) return;
  const operation = operations.find((candidate) => candidate.relative === relative && ['created-file', 'replaced-file'].includes(candidate.kind));
  if (!operation) fail(`test rollback drift target is not in invocation operations: ${relative}`);
  delete process.env.NB_CODEX_TEST_DRIFT_BEFORE_ROLLBACK;
  await writeFile(operation.target, 'concurrent-rollback-drift\n');
}

async function rollbackOperation(operation) {
  if (operation.kind === 'created-link') {
    const observed = await observeFile(operation.target);
    if (observed.type !== 'link' || observed.dangling || !observed.link || !samePath(observed.link, operation.sourceRealpath)) return 'link no longer matches invocation-created target';
    await unlink(operation.target);
    return null;
  }
  if (operation.kind === 'created-file' || operation.kind === 'replaced-file') {
    const observed = await observeFile(operation.target);
    if (observed.type !== 'file' || observed.sha256 !== operation.createdSha256) return 'file no longer matches invocation-created bytes';
    if (operation.kind === 'created-file') await rm(operation.target, { force: true });
    else await atomicWrite(operation.target, await readFile(operation.backup), observed, `rollback ${operation.relative}`);
    return null;
  }
  if (operation.kind === 'created-dir') {
    const stat = await lstat(operation.target).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!stat) return null;
    if (stat.isSymbolicLink() || !stat.isDirectory()) return 'directory path no longer matches invocation-created directory';
    await rmdir(operation.target);
    return null;
  }
  return `unknown rollback operation ${operation.kind}`;
}

export async function applyInstallPlan({ baseDir, config, replaceManaged = false }) {
  const planPath = path.join(baseDir, INSTALL_PLAN_FILE);
  const prior = await readJson(planPath, 'prior install plan');
  if (prior.fingerprint !== fingerprint(prior)) fail('prior install plan fingerprint is invalid');
  if (prior.options?.replaceManaged !== replaceManaged) {
    fail('portable apply requires the same --replace-managed choice as the current plan; rerun portable plan with the intended choice, then portable apply with the same choice');
  }
  const current = await createInstallPlan({ baseDir, config, replaceManaged, writePlan: false });
  if (prior.fingerprint !== current.fingerprint) {
    fail('portable apply requires an exact current plan; run portable plan again, then portable apply');
  }
  const invocation = `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}-${randomUUID()}`;
  const backupRoot = path.join(baseDir, RECEIPT_ROOT, 'backups', invocation);
  await mkdir(backupRoot, { recursive: true });
  const operations = [];
  let mutationCount = 0;
  try {
    await createFixedParents(config.codexHome, operations);
    await maybeInjectTargetDrift([...current.files, { ...current.config, relative: 'config.toml' }, ...current.links, current.marker]);
    for (const item of current.files) {
      if (item.state === 'matching') continue;
      await recheckTarget(item, `managed file ${item.relative}`);
      const sourceBytes = current._desiredFiles.get(item.relative);
      if (!sourceBytes || sha256(sourceBytes) !== item.desiredSha256) fail(`reconstructed desired bytes do not match the approved plan: ${item.relative}`);
      if (item.state === 'replace') {
        const backup = path.join(backupRoot, ...item.relative.split('/'));
        await mkdir(path.dirname(backup), { recursive: true });
        const oldBytes = await readFile(item.target);
        if (sha256(oldBytes) !== item.observed.sha256) fail(`managed file changed while creating its backup: ${item.target}`);
        writeBackupBytesSync(backup, oldBytes);
        await recheckTarget(item, `managed file ${item.relative}`);
        operations.push({ kind: 'replaced-file', relative: item.relative, target: item.target, backup, createdSha256: item.desiredSha256 });
      } else operations.push({ kind: 'created-file', relative: item.relative, target: item.target, createdSha256: item.desiredSha256 });
      await writePlannedFile(item, sourceBytes);
      mutationCount += 1;
      await maybeInjectedFailure(mutationCount);
    }
    if (current.config.state !== 'matching') {
      const configItem = { ...current.config, relative: 'config.toml' };
      await recheckTarget(configItem, 'managed config');
      const desiredConfigBytes = Buffer.from(current._desiredConfig);
      if (sha256(desiredConfigBytes) !== current.config.desiredSha256) fail('reconstructed config bytes do not match the approved plan');
      if (current.config.observed.type === 'file') {
        const backup = path.join(backupRoot, 'config.toml');
        const oldBytes = await readFile(current.config.target);
        if (sha256(oldBytes) !== current.config.observed.sha256) fail(`managed config changed while creating its backup: ${current.config.target}`);
        writeBackupBytesSync(backup, oldBytes);
        await recheckTarget(configItem, 'managed config');
        operations.push({ kind: 'replaced-file', relative: 'config.toml', target: current.config.target, backup, createdSha256: current.config.desiredSha256 });
      } else operations.push({ kind: 'created-file', relative: 'config.toml', target: current.config.target, createdSha256: current.config.desiredSha256 });
      await writePlannedFile(configItem, desiredConfigBytes);
      mutationCount += 1;
      await maybeInjectedFailure(mutationCount);
    }
    for (const item of current.links) {
      if (item.state === 'matching') continue;
      await assertOrdinaryExistingDirectory(item.source, `runtime source ${item.relative}`);
      const sourceRealpath = portable(await realpath(item.source));
      if (!samePath(sourceRealpath, item.sourceRealpath)) fail(`managed skill source changed after the approved plan: ${item.source}`);
      const sourceTree = await fingerprintDirectory(item.source);
      if (sourceTree.sha256 !== item.sourceTreeSha256) fail(`managed link source bytes changed after the approved plan: ${item.source}`);
      await recheckTarget(item, `managed skill ${item.relative}`);
      createDirectoryLinkSync(item.source, item.target);
      operations.push({ kind: 'created-link', relative: item.relative, target: item.target, sourceRealpath: item.sourceRealpath });
      mutationCount += 1;
      await maybeInjectedFailure(mutationCount);
    }
    if (current.marker.state !== 'matching') {
      await recheckTarget(current.marker, 'portable ownership marker');
      const desiredMarkerBytes = Buffer.from(current._desiredMarker);
      if (sha256(desiredMarkerBytes) !== current.marker.desiredSha256) fail('reconstructed ownership marker does not match the approved plan');
      if (current.marker.observed.type === 'file') {
        const backup = path.join(backupRoot, HOME_MARKER_FILE);
        const oldBytes = await readFile(current.marker.target);
        if (sha256(oldBytes) !== current.marker.observed.sha256) fail(`portable ownership marker changed while creating its backup: ${current.marker.target}`);
        writeBackupBytesSync(backup, oldBytes);
        await recheckTarget(current.marker, 'portable ownership marker');
        operations.push({ kind: 'replaced-file', relative: HOME_MARKER_FILE, target: current.marker.target, backup, createdSha256: current.marker.desiredSha256 });
      } else {
        operations.push({ kind: 'created-file', relative: HOME_MARKER_FILE, target: current.marker.target, createdSha256: current.marker.desiredSha256 });
      }
      await writePlannedFile(current.marker, desiredMarkerBytes);
      mutationCount += 1;
      await maybeInjectedFailure(mutationCount);
    }
    await writeJson(path.join(baseDir, RECEIPT_ROOT, 'install-receipt.json'), {
      schemaVersion: 1,
      invocation,
      planFingerprint: current.fingerprint,
      selectedHome: config.codexHome,
      status: 'applied',
      backupRoot,
      operations,
    });
    return current;
  } catch (error) {
    const rollbackErrors = [];
    const rollbackConflicts = [];
    try {
      await maybeInjectRollbackDrift(operations);
    } catch (hookError) {
      rollbackErrors.push(`rollback drift hook: ${hookError.message}`);
    }
    for (const operation of [...operations].reverse()) {
      try {
        const conflict = await rollbackOperation(operation);
        if (conflict) rollbackConflicts.push(`${operation.target}: ${conflict}`);
      } catch (rollbackError) {
        rollbackErrors.push(`${operation.target}: ${rollbackError.message}`);
      }
    }
    await writeJson(path.join(baseDir, RECEIPT_ROOT, 'install-receipt.json'), {
      schemaVersion: 1,
      invocation,
      planFingerprint: current.fingerprint,
      selectedHome: config.codexHome,
      status: 'rolled-back',
      error: error.message,
      rollbackErrors,
      rollbackConflicts,
      backupRoot,
      operations,
    });
    fail(`install failed; invocation artifacts were rolled back${rollbackConflicts.length ? ` with rollback conflicts preserved: ${rollbackConflicts.join('; ')}` : ''}${rollbackErrors.length ? ` with rollback errors: ${rollbackErrors.join('; ')}` : ''}: ${error.message}`);
  }
}

export async function doctorRuntime({ baseDir, config }) {
  const { manifest, bytes: profileBytes, syncManifest, syncManifestBytes } = await loadPortableProfile(baseDir);
  if (config.productFeedbackDataRoot) await validateFeedback(config.adoptions['product-feedback'], config.productFeedbackDataRoot);
  if (config.adoptions['science-agents']) await validateScienceAdoption(manifest, config.adoptions['science-agents']);
  const featureProbe = await probeFeatures(baseDir, config);
  const spec = buildOverlaySpec(syncManifest, config.codexHome, featureProbe.stdout);
  const desired = await desiredRuntimeFiles(baseDir, manifest, config);
  for (const item of desired) {
    const target = path.join(config.codexHome, ...item.relative.split('/'));
    const observed = await observeFile(target);
    if (observed.type !== 'file' || observed.sha256 !== sha256(item.bytes)) fail(`installed managed file is missing or modified: ${target}`);
  }
  const configTarget = path.join(config.codexHome, 'config.toml');
  const observedConfig = await observeFile(configTarget);
  if (observedConfig.type !== 'file') fail(`installed managed config is missing: ${configTarget}`);
  const currentConfig = await readFile(configTarget, 'utf8');
  if (!structuralConfigOverlayValid(currentConfig, spec)) fail(`installed managed config overlay drifted: ${configTarget}`);
  const links = await buildLinkPlan(baseDir, manifest, config);
  for (const link of links) if (link.state !== 'matching') fail(`installed managed skill link is missing: ${link.target}`);
  const fileEntries = desired.map((item) => ({
    relative: item.relative,
    desiredSha256: sha256(item.bytes),
    transform: item.transform,
  }));
  const sourceIdentity = {
    profileSha256: sha256(profileBytes),
    syncManifestSha256: sha256(syncManifestBytes),
    files: fileEntries,
    links: links.map((item) => ({ relative: item.relative, sourceRealpath: item.sourceRealpath, sourceTreeSha256: item.sourceTree.sha256, owner: item.owner, manifestFiles: item.expectedFiles ?? null })),
  };
  const desiredMarker = buildHomeMarker({ baseDir, config, manifest, sourceIdentity, fileEntries, links });
  const markerInspection = await inspectPortableHomeMarker(config.codexHome);
  if (!markerInspection.present) fail(`portable ownership marker is missing: ${markerInspection.target}`);
  if (markerInspection.error) fail(markerInspection.error);
  if (!samePath(markerInspection.marker.sourceRepository, baseDir)) {
    fail(`portable repository moved from ${markerInspection.marker.sourceRepository} to ${portable(baseDir)}; run portable repair-links, then portable plan/apply`);
  }
  if (markerInspection.observed.sha256 !== sha256(markerBytes(desiredMarker))) {
    fail(`portable ownership marker is stale or modified: ${markerInspection.target}`);
  }
  return {
    fileCount: desired.length,
    linkCount: links.length,
    externalComponents: Object.keys(config.adoptions).sort(),
    features: spec.exposed,
  };
}

export async function loadRuntimeConfig(baseDir, configPath = path.join(baseDir, LOCAL_CONFIG_FILE)) {
  return validateRuntimeConfig(await readJson(configPath, 'portable local config'), configPath);
}

export { INSTALL_PLAN_FILE, LOCAL_CONFIG_FILE, validateRuntimeConfig };
