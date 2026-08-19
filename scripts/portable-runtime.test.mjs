import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseScalar } from "../src/toml-overlay.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoots = [];

test("nb-codex identity, prompt, and seed-if-absent AGENTS contract", async () => {
  const system = await readFile(path.join(projectRoot, "system.yaml"), "utf8");
  const packageManifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const portableProfile = JSON.parse(await readFile(path.join(projectRoot, "portable-profile.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(projectRoot, "sync-manifest.json"), "utf8"));
  const prompt = await readFile(path.join(projectRoot, "prompts", "system-prompt-neutral.md"), "utf8");
  const agents = await readFile(path.join(projectRoot, "templates", "AGENTS.md"), "utf8");
  await assert.rejects(lstat(path.join(projectRoot, "AGENTS.md")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "prompts", "src")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "scripts", "build-prompts.mjs")), { code: "ENOENT" });

  assert.match(system, /^\s*name: nb-codex\s*$/m);
  assert.equal(packageManifest.name, "nb-codex");
  assert.equal(portableProfile.id, "portable-core");
  assert.deepEqual(portableProfile.seedIfAbsent, [{ repo: "templates/AGENTS.md", home: "AGENTS.md" }]);
  assert.equal("externalComponents" in portableProfile, false);
  const runtimeSource = await readFile(path.join(projectRoot, "src", "portable-runtime.mjs"), "utf8");
  assert.doesNotMatch(runtimeSource, /ProductStewardship|science-agents|product-feedback|validateScienceAdoption|validateFeedback/);
  const installerSource = await readFile(path.join(projectRoot, "scripts", "sync-codex.mjs"), "utf8");
  assert.doesNotMatch(installerSource, /--adopt|external-junction|inventory-only|product-feedback|science-agents/);
  assert.equal(manifest.files.some((entry) => entry.repo === "AGENTS.md" || entry.repo === "templates/AGENTS.md" || entry.home === "AGENTS.md"), false);
  assert.equal(manifest.files.some((entry) => entry.repo.includes("nia")), false);
  assert.equal(manifest.configPatch.values.find((entry) => entry.path === "model_instructions_file").homePath, "prompts/system-prompt-neutral.md");
  assert.doesNotMatch(prompt, /\bNia\b|妮娅|本宝宝|杂鱼大叔/);
  assert.match(prompt, /Content And Tone Floor/);
  assert.doesNotMatch(prompt, /without asking whether to commit|should I commit/);
  assert.match(agents, /版本管理由 root 负责/);
  assert.match(agents, /直接做本地 commit/);
  assert.match(agents, /协作边界|验证边界/);
  assert.doesNotMatch(agents, /先脑暴|\bPurpose\b|fork_turns/);
  assert.equal([...agents.matchAll(/匹配 hash 只证明字节相同/g)].length, 1);
  const agentLineCount = agents.replace(/(?:\r?\n)+$/, "").split(/\r?\n/).length;
  assert.ok(agentLineCount <= 145, `AGENTS template is ${agentLineCount} lines`);
  assert.doesNotMatch(agents, /\{CODEX_HOME\}|policies\/collaboration|Assay|brainstorm-to-decision|codex-agent-profile/);
  assert.doesNotMatch(agents, /xxoy1|ProductStewardship|妮娅|本宝宝|nb-codex 提供|本模板|science_\*|critic frame audit|本包装/);
  await assert.rejects(lstat(path.join(projectRoot, "agents", "critic.toml")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "policies", "collaboration.md")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "skills", "codex-agent-profile")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "agents", "check.toml")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "agents", "worker.toml")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(projectRoot, "agents", "worker-lite.toml")), { code: "ENOENT" });

  const genealogy = /妮娅|\bNia\b|\bnia\b|ProductStewardship|去掉.{0,20}人格|发布切片|科学角色|产品反馈投影|nia 工程|Assay Task/;
  const recipientDocs = [
    "README.md",
    path.join("docs", "agents-merge.md"),
    path.join("docs", "instruction-layers.md"),
    path.join("templates", "AGENTS.md"),
    path.join("prompts", "system-prompt-neutral.md"),
    path.join("prompts", "subagent-model-instructions.md")
  ];
  for (const relative of recipientDocs) {
    const text = await readFile(path.join(projectRoot, relative), "utf8");
    assert.doesNotMatch(text, genealogy, relative);
  }
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  assert.doesNotMatch(readme, /critic\.toml|worker-lite|codex-agent-profile/);
  assert.match(readme, /模板为骨架/);
  assert.doesNotMatch(readme, /Join-Path \$HOME "\.codex"/);
  const mergeDoc = await readFile(path.join(projectRoot, "docs", "agents-merge.md"), "utf8");
  assert.match(mergeDoc, /以模板为骨架/);
  assert.match(mergeDoc, /主要冲突/);
  assert.match(mergeDoc, /得到回答前不要写文件/);
  assert.match(mergeDoc, /还有未决的主要冲突就停/);
  const subagent = await readFile(path.join(projectRoot, "prompts", "subagent-model-instructions.md"), "utf8");
  assert.doesNotMatch(subagent, /Assay|A `lite` name|Feature flags are defense in depth/);
  assert.match(subagent, /built-in `default`, `explorer`, and `worker`/);
  assert.match(subagent, /Leave commits[\s\S]*parent root/);
  assert.doesNotMatch(subagent, /parent\/user authorization/);

  function developerInstructions(text, file) {
    const match = text.match(/developer_instructions\s*=\s*"""\r?\n([\s\S]*?)\r?\n"""/);
    assert.ok(match, `${file} missing developer_instructions`);
    return match[1];
  }
  const leafRoles = ["executor.toml", "explore.toml", "research.toml", "reviewer.toml"];
  const spawnCapableRoles = ["implement.toml", "frontend.toml", "think.toml"];
  for (const file of leafRoles) {
    const body = developerInstructions(await readFile(path.join(projectRoot, "agents", file), "utf8"), file);
    assert.doesNotMatch(body, /built-in/, file);
    assert.doesNotMatch(body, /You were chosen because|low-intelligence|search-layer|task-path/, file);
  }
  for (const file of spawnCapableRoles) {
    const body = developerInstructions(await readFile(path.join(projectRoot, "agents", file), "utf8"), file);
    assert.match(body, /built-in `default`|built-in `explorer`|built-in `worker`/, file);
    assert.doesNotMatch(body, /reconstruct a generic built-in worker|low-intelligence/, file);
  }
});

test.after(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
});

async function fixture(name, { existingHome = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), `nb-codex-portable-${name}-`));
  temporaryRoots.push(root);
  const baseDir = path.join(root, "repo with spaces");
  await cp(projectRoot, baseDir, {
    recursive: true,
    filter(source) {
      const relative = path.relative(projectRoot, source).replaceAll("\\", "/");
      return relative !== ".git" && !relative.startsWith(".tmp/") &&
        relative !== ".nb-codex.local.json" && !relative.startsWith(".nb-codex/");
    }
  });
  const home = path.join(root, "selected home");
  if (existingHome) await mkdir(home);
  const codexCli = path.join(root, "fake-codex.mjs");
  await writeFile(codexCli, [
    "import { mkdirSync, writeFileSync } from 'node:fs';",
    "import path from 'node:path';",
    "mkdirSync(path.join(process.env.CODEX_HOME, 'probe'), { recursive: true });",
    "writeFileSync(path.join(process.env.CODEX_HOME, 'probe', 'used-home.txt'), process.env.CODEX_HOME);",
    "if (process.argv.slice(2).join(' ') !== 'features list') process.exit(2);",
    "process.stdout.write('default_mode_request_user_input stable true\\n');"
  ].join("\n"));
  const script = path.join(baseDir, "scripts", "sync-codex.mjs");
  return { root, baseDir, home, codexCli, script };
}

function run(item, args, extraEnv = {}) {
  return spawnSync(process.execPath, [item.script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv }
  });
}

function okay(result, label) {
  assert.equal(result.status, 0, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

async function initialize(item) {
  return okay(run(item, ["portable", "init", "--home", item.home, "--codex-cli", item.codexCli]), "portable init");
}

async function planApply(item, replace = false) {
  const extra = replace ? ["--replace-managed"] : [];
  okay(run(item, ["portable", "plan", ...extra]), "portable plan");
  return okay(run(item, ["portable", "apply", ...extra]), "portable apply");
}

async function missing(target) {
  await assert.rejects(lstat(target), { code: "ENOENT" });
}

async function snapshotTree(root) {
  const records = [];
  async function walk(current, relative) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) records.push({ path: rel, type: "link", target: await readlink(target) });
      else if (entry.isDirectory()) {
        records.push({ path: rel, type: "directory" });
        await walk(target, rel);
      } else if (entry.isFile()) {
        records.push({ path: rel, type: "file", sha256: createHash("sha256").update(await readFile(target)).digest("hex") });
      }
    }
  }
  await walk(root, "");
  return records;
}

test("portable init is explicit and plan leaves the selected home byte-for-byte untouched", async () => {
  const item = await fixture("plan", { existingHome: false });
  const refused = run(item, ["portable", "init", "--codex-cli", item.codexCli], { CODEX_HOME: "" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /requires an explicit --home or CODEX_HOME/);
  assert.match(await initialize(item), /selected home unchanged/);
  await missing(item.home);
  const beforeConfig = await readFile(path.join(item.baseDir, ".nb-codex.local.json"));
  const output = okay(run(item, ["portable", "plan"]), "portable plan");
  assert.match(output, /selected home unchanged/);
  assert.match(output, /AGENTS\.md:\s+create/);
  assert.doesNotMatch(output, /keep-existing/);
  await missing(item.home);
  assert.deepEqual(await readFile(path.join(item.baseDir, ".nb-codex.local.json")), beforeConfig);
  assert.deepEqual(await readdir(path.join(item.baseDir, ".nb-codex", "feature-probes")), []);
  const plan = JSON.parse(await readFile(path.join(item.baseDir, ".nb-codex", "install-plan.json"), "utf8"));
  for (const key of ["options", "sources", "targets"]) assert.match(plan.fingerprints[key], /^[0-9a-f]{64}$/);
  assert.equal(plan.product, "nb-codex");
  assert.equal(plan.files.some((entry) => entry.relative === "AGENTS.md"), false);
  assert.equal(plan.seeds.length, 1);
  assert.equal(plan.seeds[0].relative, "AGENTS.md");
  assert.equal(plan.seeds[0].state, "create");
  assert.ok(plan.config.target.endsWith(`${path.sep}config.toml`) || plan.config.target.endsWith("/config.toml"));
});

test("managed TOML integers accept only separators between digits", async () => {
  for (const [text, expected] of [
    ["345_000", 345000], ["+15", 15], ["-1_024", -1024],
    ["0xDEAD_BEEF", 0xDEADBEEF], ["0o7_5_5", 0o755], ["0b1010_0101", 0b10100101]
  ]) assert.equal(parseScalar(text), expected, text);
  for (const malformed of ["345_", "1__2", "_12", "12_", "0x_FF", "0b10__01"]) {
    assert.throws(() => parseScalar(malformed), /managed value is not a supported scalar/);
  }
  const item = await fixture("malformed-managed-integer");
  await initialize(item);
  await planApply(item);
  const config = path.join(item.home, "config.toml");
  await writeFile(config, (await readFile(config, "utf8")).replace("model_auto_compact_token_limit = 270000", "model_auto_compact_token_limit = 270_"));
  const doctor = run(item, ["portable", "doctor"]);
  assert.notEqual(doctor.status, 0);
  assert.match(doctor.stderr, /invalid managed scalar model_auto_compact_token_limit|managed value is not a supported scalar/);
});

test("portable core overwrites the root prompt and config.toml but does not replace an existing AGENTS.md", async () => {
  const item = await fixture("core");
  await mkdir(path.join(item.home, "agents"));
  await mkdir(path.join(item.home, "skills", "custom-skill"), { recursive: true });
  await writeFile(path.join(item.home, "agents", "custom.toml"), "name = \"custom\"\n");
  await writeFile(path.join(item.home, "skills", "custom-skill", "SKILL.md"), "# custom\n");
  await writeFile(path.join(item.home, "AGENTS.md"), "# user-owned agents file\n");
  const opaque = [
    "[custom]",
    "value = 7 # preserve comment",
    "opaque_basic = \"\"\"",
    "model = \"must stay inside basic multiline\"",
    "[features]",
    "default_mode_request_user_input = false",
    "\"\"\"",
    "opaque_literal = '''",
    "model_catalog_json = \"must stay inside literal multiline\"",
    "[agents]",
    "max_concurrent_threads_per_session = 999",
    "'''",
    "# model = \"comment counterexample\"",
    "",
    "[[custom.servers]]",
    "name = \"keep\"",
    ""
  ].join("\n");
  await writeFile(path.join(item.home, "config.toml"), opaque);
  await initialize(item);
  const planOut = okay(run(item, ["portable", "plan"]), "portable plan");
  assert.match(planOut, /AGENTS\.md:\s+keep-existing/);
  assert.match(planOut, /docs\/agents-merge\.md/);
  assert.equal(await readFile(path.join(item.home, "config.toml"), "utf8"), opaque, "plan must not mutate selected-home config");
  await planApply(item);
  const ownershipMarker = JSON.parse(await readFile(path.join(item.home, ".nb-codex-managed.json"), "utf8"));
  assert.equal(ownershipMarker.product, "nb-codex");
  assert.equal(ownershipMarker.managedFiles.length, 11);
  assert.equal(ownershipMarker.managedFiles.includes("AGENTS.md"), false);
  assert.equal(ownershipMarker.managedFiles.includes("config.toml"), true);
  assert.equal(ownershipMarker.managedFiles.includes("agents/critic.toml"), false);
  assert.deepEqual(ownershipMarker.managedLinks.map((entry) => entry.relative).sort(), [
    "skills/codex-parallel-collab"
  ]);
  const installed = await readFile(path.join(item.home, "config.toml"), "utf8");
  assert.ok(installed.includes(opaque), "independent byte oracle: every unrelated original config byte remains contiguous and unchanged");
  assert.match(installed, /model_instructions_file = ".*prompts\/system-prompt-neutral\.md"/);
  assert.equal(await readFile(path.join(item.home, "AGENTS.md"), "utf8"), "# user-owned agents file\n");
  assert.equal(await readFile(path.join(item.home, "agents", "custom.toml"), "utf8"), "name = \"custom\"\n");
  for (const name of ["executor", "explore", "frontend", "implement", "research", "reviewer", "think"]) {
    const text = await readFile(path.join(item.home, "agents", `${name}.toml`), "utf8");
    assert.match(text, new RegExp(item.home.replaceAll("\\", "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const relative of [
    "models.json",
    "prompts/subagent-model-instructions.md", "prompts/system-prompt-neutral.md"
  ]) {
    assert.deepEqual(
      await readFile(path.join(item.home, ...relative.split("/"))),
      await readFile(path.join(item.baseDir, ...relative.split("/"))),
      `${relative} must remain an exact repository-owned runtime file`
    );
  }
  await missing(path.join(item.home, "prompts", "system-prompt-nia.md"));
  await missing(path.join(item.home, "policies", "collaboration.md"));
  await missing(path.join(item.home, "skills", "codex-agent-profile"));
  assert.equal((await lstat(path.join(item.home, "skills", "codex-parallel-collab"))).isSymbolicLink(), true);
  assert.match(okay(run(item, ["portable", "doctor"]), "portable doctor"), /portable doctor: ok/);
  assert.match(okay(run(item, ["portable", "status"]), "portable status"), /portable status: ok/);
});

test("legacy commands converge on portable ownership and refuse portable-home mutation", async () => {
  const item = await fixture("legacy-routing");
  await initialize(item);
  await planApply(item);
  assert.equal(
    await readFile(path.join(item.home, "AGENTS.md"), "utf8"),
    await readFile(path.join(item.baseDir, "templates", "AGENTS.md"), "utf8")
  );
  const before = await snapshotTree(item.home);
  const status = run(item, ["status", "--home", item.home]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /portable status clean/);
  for (const command of ["push", "pull"]) {
    const refused = run(item, [command, "--force", "--home", item.home]);
    assert.equal(refused.status, 2);
    assert.match(refused.stdout, new RegExp(`refuse legacy ${command}: this home is owned by the portable-core profile`));
    assert.deepEqual(await snapshotTree(item.home), before, `${command} must not mutate a portable-owned home`);
  }
});

test("whole-plan conflicts require matching replacement authorization and injected failure rolls back", async () => {
  const conflict = await fixture("conflict");
  await writeFile(path.join(conflict.home, "models.json"), "unrelated existing bytes\n");
  await initialize(conflict);
  const refused = run(conflict, ["portable", "plan"]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /--replace-managed/);
  await missing(path.join(conflict.home, "prompts", "system-prompt-neutral.md"));
  okay(run(conflict, ["portable", "plan", "--replace-managed"]), "replacement plan");
  const mismatched = run(conflict, ["portable", "apply"]);
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /same --replace-managed choice/);
  await writeFile(path.join(conflict.home, "models.json"), "changed after plan\n");
  const stale = run(conflict, ["portable", "apply", "--replace-managed"]);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /portable apply requires an exact current plan/);

  const rollback = await fixture("rollback");
  await writeFile(path.join(rollback.home, "models.json"), "prior managed bytes\n");
  await initialize(rollback);
  okay(run(rollback, ["portable", "plan", "--replace-managed"]), "rollback plan");
  const failed = run(rollback, ["portable", "apply", "--replace-managed"], { NB_CODEX_TEST_FAIL_AFTER: "2" });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /rolled back/);
  assert.equal(await readFile(path.join(rollback.home, "models.json"), "utf8"), "prior managed bytes\n");
  const receipt = JSON.parse(await readFile(path.join(rollback.baseDir, ".nb-codex", "install-receipt.json"), "utf8"));
  assert.equal(receipt.status, "rolled-back");
});

test("target drift and rollback drift are refused without overwriting concurrent bytes", async () => {
  const target = await fixture("target-drift");
  await initialize(target);
  okay(run(target, ["portable", "plan"]), "target plan");
  const targetResult = run(target, ["portable", "apply"], { NB_CODEX_TEST_DRIFT_BEFORE_MUTATION: "models.json" });
  assert.notEqual(targetResult.status, 0);
  assert.match(targetResult.stderr, /changed after the approved plan/);
  assert.equal(await readFile(path.join(target.home, "models.json"), "utf8"), "concurrent-target-drift\n");

  const rollback = await fixture("rollback-drift");
  await writeFile(path.join(rollback.home, "models.json"), "prior managed bytes\n");
  await initialize(rollback);
  okay(run(rollback, ["portable", "plan", "--replace-managed"]), "rollback drift plan");
  const rollbackResult = run(rollback, ["portable", "apply", "--replace-managed"], {
    NB_CODEX_TEST_FAIL_AFTER: "1",
    NB_CODEX_TEST_DRIFT_BEFORE_ROLLBACK: "models.json"
  });
  assert.notEqual(rollbackResult.status, 0);
  assert.match(rollbackResult.stderr, /rollback conflicts preserved/);
  assert.equal(await readFile(path.join(rollback.home, "models.json"), "utf8"), "concurrent-rollback-drift\n");
});

test("repository move reports dangling links and the bounded repair sequence restores them", async () => {
  const item = await fixture("repository-move");
  await initialize(item);
  await planApply(item);
  const oldBase = item.baseDir;
  const movedBase = `${oldBase} moved`;
  await rename(oldBase, movedBase);
  item.baseDir = movedBase;
  item.script = path.join(movedBase, "scripts", "sync-codex.mjs");
  const diagnosed = run(item, ["portable", "status"]);
  assert.notEqual(diagnosed.status, 0);
  assert.match(diagnosed.stderr, /managed link is dangling/);
  const repaired = okay(run(item, ["portable", "repair-links"]), "portable repair-links");
  assert.match(repaired, /removed 1 stale core links/);
  okay(run(item, ["portable", "plan"]), "post-move plan");
  okay(run(item, ["portable", "apply"]), "post-move apply");
  assert.match(okay(run(item, ["portable", "doctor"]), "post-move doctor"), /portable doctor: ok/);
  const marker = JSON.parse(await readFile(path.join(item.home, ".nb-codex-managed.json"), "utf8"));
  assert.equal(marker.sourceRepository, movedBase.replaceAll("\\", "/"));
});

test("portable config replace performs a real just-before-rename observation check", async () => {
  const item = await fixture("concurrent-config");
  await initialize(item);
  await planApply(item);
  const configPath = path.join(item.home, "config.toml");
  const driftedManaged = (await readFile(configPath, "utf8")).replace('model = "gpt-5.6-sol"', 'model = "wrong"');
  await writeFile(configPath, driftedManaged);
  okay(run(item, ["portable", "plan", "--replace-managed"]), "concurrent plan");
  const marker = path.join(item.root, "before-rename.marker");
  const child = spawn(process.execPath, [item.script, "portable", "apply", "--replace-managed"], {
    encoding: "utf8",
    env: {
      ...process.env,
      NB_CODEX_TEST_MODE: "1",
      NB_CODEX_TEST_BEFORE_RENAME_RELATIVE: "config.toml",
      NB_CODEX_TEST_BEFORE_RENAME_MARKER: marker,
      NB_CODEX_TEST_BEFORE_RENAME_DELAY_MS: "1500"
    }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  for (let index = 0; index < 100; index += 1) {
    try {
      await lstat(marker);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  await lstat(marker);
  await writeFile(configPath, "concurrent config drift\n");
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.notEqual(exitCode, 0, `stdout:\n${stdout}\nstderr:\n${stderr}`);
  assert.match(stderr, /changed immediately before atomic replace/);
  assert.equal(await readFile(configPath, "utf8"), "concurrent config drift\n");
});

test("doctor detects managed file, config, and link tamper", async () => {
  const fileCase = await fixture("doctor-file");
  await initialize(fileCase);
  await planApply(fileCase);
  await writeFile(path.join(fileCase.home, "models.json"), "tamper\n");
  assert.match(run(fileCase, ["portable", "doctor"]).stderr, /missing or modified/);

  const configCase = await fixture("doctor-config");
  await initialize(configCase);
  await planApply(configCase);
  const config = path.join(configCase.home, "config.toml");
  await writeFile(config, (await readFile(config, "utf8")).replace('model = "gpt-5.6-sol"', 'model = "wrong"'));
  assert.match(run(configCase, ["portable", "doctor"]).stderr, /config overlay drifted/);

  const linkCase = await fixture("doctor-link");
  await initialize(linkCase);
  await planApply(linkCase);
  const link = path.join(linkCase.home, "skills", "codex-parallel-collab");
  await rm(link, { force: true });
  const wrong = path.join(linkCase.root, "wrong skill");
  await mkdir(wrong);
  await symlink(wrong, link, process.platform === "win32" ? "junction" : "dir");
  assert.match(run(linkCase, ["portable", "doctor"]).stderr, /wrong source/);

  const markerCase = await fixture("doctor-marker");
  await initialize(markerCase);
  await planApply(markerCase);
  const markerPath = path.join(markerCase.home, ".nb-codex-managed.json");
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  marker.sourceFingerprint = "0".repeat(64);
  await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  assert.match(run(markerCase, ["portable", "doctor"]).stderr, /ownership marker is stale or modified/);
});

test("portable installer rejects unknown arguments", async () => {
  const item = await fixture("unknown-flag");
  const result = run(item, [
    "portable", "init", "--home", item.home, "--codex-cli", item.codexCli,
    "--not-a-real-flag", item.root
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown argument: --not-a-real-flag/);
});

test("portable plan refuses leftover external adoptions in local config", async () => {
  const item = await fixture("stale-adopt");
  await initialize(item);
  const configPath = path.join(item.baseDir, ".nb-codex.local.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.adoptions = { other: item.root };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const plan = run(item, ["portable", "plan"]);
  assert.notEqual(plan.status, 0);
  assert.match(plan.stderr, /does not adopt external components/);
});
