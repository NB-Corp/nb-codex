import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceScript = path.join(here, "sync-codex.mjs");
const systemRoot = path.resolve(here, "..");
const sourceRuntimeDir = path.join(systemRoot, "src");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-codex-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const fixtureSystem = path.join(root, "system");
  const scriptsDir = path.join(fixtureSystem, "scripts");
  const runtimeDir = path.join(fixtureSystem, "src");
  const home = path.join(root, "home");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.copyFileSync(sourceScript, path.join(scriptsDir, "sync-codex.mjs"));
  fs.copyFileSync(path.join(sourceRuntimeDir, "portable-runtime.mjs"), path.join(runtimeDir, "portable-runtime.mjs"));
  fs.copyFileSync(path.join(sourceRuntimeDir, "toml-overlay.mjs"), path.join(runtimeDir, "toml-overlay.mjs"));
  fs.copyFileSync(path.join(sourceRuntimeDir, "runtime-fs.mjs"), path.join(runtimeDir, "runtime-fs.mjs"));

  const repoForward = options.repoForward ?? "forward\n";
  const homeForward = options.homeForward ?? repoForward;
  fs.writeFileSync(path.join(fixtureSystem, "forward.txt"), repoForward);
  fs.writeFileSync(path.join(home, "forward.txt"), homeForward);

  const manifest = {
    schema: 1,
    name: "sync-codex-test",
    stateFile: ".prompt-sync-state.json",
    files: [
      {
        repo: "forward.txt",
        home: "forward.txt",
        description: "Fixture forward mapping"
      }
    ],
    homeTombstones: [
      {
        home: "skills/codex-parallel-collab/README.md",
        allowedSha256: options.allowedSha256 ?? [sha256("legacy\n")],
        description: "Fixture tombstone"
      }
    ]
  };
  if (options.schema2) {
    manifest.schema = 2;
    fs.mkdirSync(path.join(fixtureSystem, "agents"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureSystem, "models.json"),
      options.catalog ?? `${JSON.stringify({ models: [{ slug: "gpt-test" }] }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(fixtureSystem, "agents", "trellis-frontend.toml"),
      options.profile ?? 'name = "trellis_frontend"\ndescription = "test"\nmodel = "gpt-test"\ndeveloper_instructions = "test"\n'
    );
    manifest.files.unshift(
      { repo: "models.json", home: "models.json", description: "Fixture catalog" },
      { repo: "agents/trellis-frontend.toml", home: "agents/trellis-frontend.toml", description: "Fixture agent" }
    );
    manifest.modelCatalog = { repo: "models.json", home: "models.json" };
    manifest.configPatch = {
      home: "config.toml",
      values: [
        { path: "model", value: "gpt-test" },
        { path: "model_catalog_json", homePath: "models.json" },
        { path: "agents.max_concurrent_threads_per_session", value: 15 },
        {
          path: "features.multi_agent_v2.multi_agent_mode_hint_text",
          value: "Proactive multi-agent delegation is active."
        }
      ],
      featureValues: [
        { path: "suppress_unstable_features_warning", feature: "default_mode_request_user_input", value: true },
        { path: "features.default_mode_request_user_input", feature: "default_mode_request_user_input", value: true }
      ],
      absent: ["model_context_window", "features.js_repl"],
      legacyAgentTables: [
        { role: "trellis_frontend", configFile: "agents/trellis-frontend.toml" }
      ]
    };
    manifest.agentSets = [
      {
        id: "prompt",
        ownership: "full-file",
        roles: [
          { name: "trellis_frontend", repo: "agents/trellis-frontend.toml", home: "agents/trellis-frontend.toml" }
        ]
      }
    ];
  }
  if (options.transformManifest) options.transformManifest(manifest, { root, system: fixtureSystem, home });
  fs.writeFileSync(
    path.join(fixtureSystem, "sync-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const tombstone = path.join(home, "skills", "codex-parallel-collab", "README.md");
  if (options.tombstone !== undefined) {
    fs.mkdirSync(path.dirname(tombstone), { recursive: true });
    fs.writeFileSync(tombstone, options.tombstone);
  }

  return {
    root,
    system: fixtureSystem,
    home,
    script: path.join(scriptsDir, "sync-codex.mjs"),
    tombstone,
    manifest,
    env: options.schema2 ? {
      CODEX_SYNC_TEST_MODE: "1",
      CODEX_SYNC_FEATURES: "default_mode_request_user_input"
    } : {}
  };
}

function runWithEnv(fixture, extraEnv, ...args) {
  const env = { ...process.env, ...fixture.env };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, [fixture.script, ...args, "--home", fixture.home], {
    encoding: "utf8",
    env
  });
}

function run(fixture, ...args) {
  return runWithEnv(fixture, {}, ...args);
}

async function runPaused(fixture, point, subject, onPause, ...args) {
  const marker = path.join(fixture.root, `race-${point.replace(/[^a-z0-9]+/gi, "-")}`);
  const child = spawn(process.execPath, [fixture.script, ...args, "--home", fixture.home], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...fixture.env,
      CODEX_SYNC_TEST_MODE: "1",
      CODEX_SYNC_TEST_RACE_POINT: point,
      CODEX_SYNC_TEST_RACE_SUBJECT: subject || "",
      CODEX_SYNC_TEST_RACE_MARKER: marker,
      CODEX_SYNC_TEST_RACE_DELAY_MS: "2000"
    }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  for (let attempt = 0; attempt < 150 && !fs.existsSync(marker); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(marker), true, `sync did not reach ${point}:${subject}`);
  await onPause();
  const status = await new Promise((resolve) => child.on("close", resolve));
  return { status, stdout, stderr };
}

function stagingFiles(root) {
  return walkFiles(root).filter((file) => path.basename(file).includes(".prompt-sync-") && file.endsWith(".tmp"));
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(target));
    else result.push(target);
  }
  return result;
}

test("repository manifest and sync engine have no persistent backup surface", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  const script = fs.readFileSync(sourceScript, "utf8");
  assert.equal(Object.hasOwn(manifest, "backupDir"), false);
  assert.doesNotMatch(script, /backupDir|backupRoot|backupFile|backups\/prompt-sync/);
});

test("repository manifest has no home tombstones", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  assert.deepEqual(manifest.homeTombstones, []);
});

test("repository manifest does not retire author-home leftovers", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  assert.equal(manifest.homeTombstones.some((entry) => entry.home === "reference.md"), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "reference.md")), false);
});

test("repository manifest does not ship a specialist-dispatch tombstone", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  assert.equal(manifest.homeTombstones.some((entry) => entry.home === "agents/trellis-specialist-dispatch.md"), false);
});

test("repository manifest ships six coding roles, overwrites the neutral prompt, and seeds AGENTS.md only when absent", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  assert.equal("defaultHome" in manifest, false);
  const roles = manifest.agentSets.flatMap((set) => set.roles.map((role) => role.name)).sort();
  assert.deepEqual(roles, [
    "explore",
    "implement",
    "research",
    "reviewer",
    "think",
    "worker_lite"
  ]);
  const codingSet = manifest.agentSets.find((set) => set.id === "prompt-coding");
  assert.ok(codingSet);
  assert.equal(codingSet.ownership, "full-file");
  const flatCodingPaths = new Map([
    ["explore", "agents/explore.toml"],
    ["implement", "agents/implement.toml"],
    ["research", "agents/research.toml"],
    ["reviewer", "agents/reviewer.toml"],
    ["think", "agents/think.toml"],
    ["worker_lite", "agents/worker_lite.toml"]
  ]);
  for (const role of codingSet.roles) {
    assert.equal(role.repo, flatCodingPaths.get(role.name));
    assert.equal(role.repo, role.home);
    assert.equal(manifest.files.filter((entry) => entry.repo === role.repo && entry.home === role.home).length, 1);
  }
  assert.equal(manifest.files.some((entry) => entry.repo === "AGENTS.md" || entry.repo === "templates/AGENTS.md"), false);
  assert.equal(manifest.files.some((entry) => entry.repo.startsWith("policies/")), false);
  assert.equal(manifest.files.some((entry) => entry.repo.startsWith("skills/codex-agent-profile/")), false);
  assert.equal(manifest.files.some((entry) => entry.repo === "prompts/system-prompt-nia.md"), false);
  assert.equal(
    manifest.configPatch.values.find((entry) => entry.path === "model_instructions_file").homePath,
    "prompts/system-prompt-neutral.md"
  );
  assert.deepEqual(manifest.configPatch.values.map((entry) => entry.path).sort(), [
    "agents.default_subagent_reasoning_effort",
    "agents.max_concurrent_threads_per_session",
    "features.multi_agent_v2.multi_agent_mode_hint_text",
    "model_catalog_json",
    "model_instructions_file"
  ]);
  assert.equal(manifest.configPatch.absent.includes("model_context_window"), false);
  assert.equal("externalSkills" in manifest, false);
  assert.deepEqual(manifest.configPatch.legacyAgentTables, []);

  const hint = manifest.configPatch.values.find(
    (entry) => entry.path === "features.multi_agent_v2.multi_agent_mode_hint_text"
  ).value;
  assert.match(hint, /Follow the current global AGENTS\.md as the single authority/);
  assert.doesNotMatch(hint, /Never use the built-in default, explorer, or worker as a fallback/);
  assert.match(hint, /This mode remains active until a later multi-agent mode developer message changes it/);
});

test("model catalog pins Codex windows for Sol, Terra, Luna, and Grok", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(systemRoot, "models.json"), "utf8"));
  const bySlug = new Map(catalog.models.map((model) => [model.slug, model]));
  const sol = bySlug.get("gpt-5.6-sol");
  const astra = bySlug.get("gpt-6-astra");
  const terra = bySlug.get("gpt-5.6-terra");
  const luna = bySlug.get("gpt-5.6-luna");
  const grok = bySlug.get("grok-4.6");
  assert.equal(bySlug.has("deepseek-v4-flash"), false);
  assert.equal(bySlug.has("gpt-5.2"), false);
  assert.ok(sol && terra && luna && grok);
  assert.equal(catalog.models.length, 9);
  for (const [model, window, compact] of [
    [astra, 400000, 320000],
    [sol, 400000, 320000],
    [terra, 750000, 650000],
    [luna, 750000, 650000],
    [grok, 400000, null]
  ]) {
    assert.equal(model.context_window, window, model.slug);
    assert.equal(model.max_context_window, window, model.slug);
    assert.equal(model.auto_compact_token_limit, compact, model.slug);
    // Independent runtime rule: ModelInfo clamps the threshold to 90% of the window.
    if (compact !== null) assert.equal(Math.min(compact, Math.floor(window * 9 / 10)), compact);
  }
  assert.equal(astra.shell_type, "unified_exec");
  assert.equal(astra.tool_mode, "code_mode_only");
  assert.equal(astra.multi_agent_version, "v2");
  assert.equal(astra.use_responses_lite, true);
  assert.deepEqual(astra.supported_reasoning_levels.map((item) => item.effort), ["low", "medium", "high", "xhigh", "max", "ultra"]);
  assert.ok(astra.base_instructions.length > 1000);
  assert.doesNotMatch(grok.base_instructions, /GPT-5/, grok.slug);
  assert.doesNotMatch(grok.model_messages.instructions_template, /GPT-5/, grok.slug);
  assert.deepEqual(grok.input_modalities, ["text", "image"]);
  assert.deepEqual(
    grok.supported_reasoning_levels.map((level) => level.effort),
    ["low", "medium", "high", "xhigh"]
  );
  assert.equal(grok.default_reasoning_level, "high");
});

test("installer source stays a full-file copy of this package", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  const script = fs.readFileSync(sourceScript, "utf8");
  assert.equal("externalSkills" in manifest, false);
  assert.equal(fs.existsSync(path.join(systemRoot, "prompts", "system-prompt-nia.md")), false);
  assert.doesNotMatch(script, /product-feedback|science-agents|external-junction|inventory-only/);
});

test("canonical coding profiles pin GPT models and reject retired ambient task discovery", () => {
  const expected = new Map([
    ["explore.toml", { name: "explore", model: "gpt-5.6-luna", effort: "max", tier: "priority" }],
    ["implement.toml", { name: "implement", model: "gpt-6-astra" }],
    ["research.toml", { name: "research", model: "gpt-6-astra" }],
    ["reviewer.toml", { name: "reviewer", model: "gpt-6-astra", effort: "medium", sandbox: "read-only" }],
    ["think.toml", { name: "think", model: "gpt-6-astra", effort: "xhigh", sandbox: "workspace-write" }],
    ["worker_lite.toml", { name: "worker_lite", model: "gpt-5.6-luna", effort: "max", tier: "priority" }]
  ]);
  function scalar(text, key) {
    const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
    return match ? match[1] : undefined;
  }
  for (const [file, settings] of expected) {
    const text = fs.readFileSync(path.join(systemRoot, "agents", file), "utf8");
    assert.equal(scalar(text, "name"), settings.name, file);
    assert.equal(scalar(text, "model"), settings.model, file);
    assert.equal(scalar(text, "model_reasoning_effort"), settings.effort, file);
    assert.equal(scalar(text, "service_tier"), settings.tier, file);
    assert.equal(scalar(text, "sandbox_mode"), settings.sandbox, file);
    const luna = settings.model === "gpt-5.6-luna";
    assert.match(text, new RegExp(`^model_context_window = ${luna ? 750000 : 400000}$`, "m"), file);
    assert.match(text, new RegExp(`^model_auto_compact_token_limit = ${luna ? 650000 : 320000}$`, "m"), file);
    assert.match(scalar(text, "model_instructions_file"), /\/prompts\/subagent-model-instructions\.md$/, file);
    assert.doesNotMatch(text, /\.trellis|task\.py|<trellis-subagent-context>|SubagentStart|Trellis task/i, file);
    assert.doesNotMatch(text, /assay task context|Active task:/i, file);
    assert.doesNotMatch(text, /\bcritic\b|science role/i, file);
    assert.match(text, /dispatch/is, file);
  }
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "critic.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "check.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "executor.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "review_gpt.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "review_grok.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "worker.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "worker-lite.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "worker_gpt.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "worker_grok.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "frontend.toml")), false);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "implement.toml")), true);
  assert.equal(fs.existsSync(path.join(systemRoot, "agents", "reviewer.toml")), true);
});

test("implement dispatch guidance selects low without disabling per-dispatch upgrades", () => {
  const profile = fs.readFileSync(path.join(systemRoot, "agents", "implement.toml"), "utf8");
  const agents = fs.readFileSync(path.join(systemRoot, "templates", "AGENTS.md"), "utf8");
  const skill = fs.readFileSync(path.join(systemRoot, "skills", "codex-parallel-collab", "SKILL.md"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, "sync-manifest.json"), "utf8"));
  assert.doesNotMatch(profile, /^model_reasoning_effort\s*=/m);
  assert.match(profile, /Dispatch with low reasoning by default/);
  for (const text of [agents, skill]) assert.match(text, /reasoning_effort="low"/);
  assert.equal(manifest.configPatch.values.find((entry) => entry.path === "agents.default_subagent_reasoning_effort").value, "medium");
});

test("a missing tombstone target is clean in status and push dry-run", (t) => {
  const fixture = createFixture(t);
  const status = run(fixture, "status");
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /tombstone-clean\s+skills\/codex-parallel-collab\/README\.md/);

  const dryRun = run(fixture, "push", "--dry-run");
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /clean\s+push tombstone skills\/codex-parallel-collab\/README\.md/);
  assert.equal(fs.existsSync(fixture.tombstone), false);
});

test("each allowed hash deletes the ordinary file", async (t) => {
  for (const content of ["legacy-crlf\r\n", "legacy-lf\n"]) {
    await t.test(JSON.stringify(content), (st) => {
      const fixture = createFixture(st, {
        tombstone: content,
        allowedSha256: [sha256("legacy-crlf\r\n"), sha256("legacy-lf\n")]
      });
      const result = run(fixture, "push");
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /delete tombstone skills\/codex-parallel-collab\/README\.md/);
      assert.equal(fs.existsSync(fixture.tombstone), false);
    });
  }
});

test("pending status and dry-run show deletion without writing or backup", (t) => {
  const content = Buffer.from("legacy\n");
  const fixture = createFixture(t, { tombstone: content, allowedSha256: [sha256(content)] });

  const status = run(fixture, "status");
  assert.equal(status.status, 1, status.stderr || status.stdout);
  assert.match(status.stdout, /tombstone-pending/);

  const dryRun = run(fixture, "push", "--dry-run");
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.doesNotMatch(dryRun.stdout, /backup/i);
  assert.match(dryRun.stdout, /would delete tombstone/);
  assert.deepEqual(fs.readFileSync(fixture.tombstone), content);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
});

test("actual deletion creates no backup and repeated push is clean", (t) => {
  const content = Buffer.from([0, 13, 10, 255, 42]);
  const fixture = createFixture(t, { tombstone: content, allowedSha256: [sha256(content)] });

  const first = run(fixture, "push");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(fs.existsSync(fixture.tombstone), false);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);

  const second = run(fixture, "push");
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.match(second.stdout, /clean\s+push tombstone/);
  assert.doesNotMatch(second.stdout, /delete tombstone/);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
});

test("unknown hash is refused even with force", (t) => {
  const content = Buffer.from("unknown\n");
  const fixture = createFixture(t, {
    tombstone: content,
    allowedSha256: [sha256("allowed\n")]
  });
  const result = run(fixture, "push", "--force");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /tombstone-hash-mismatch/);
  assert.match(result.stdout, /--force cannot bypass/);
  assert.deepEqual(fs.readFileSync(fixture.tombstone), content);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
});

test("directory tombstone targets are refused", (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(fixture.tombstone, { recursive: true });
  const result = run(fixture, "push", "--force");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /tombstone-not-file/);
  assert.equal(fs.statSync(fixture.tombstone).isDirectory(), true);
});

test("symlink tombstone targets are refused", (t) => {
  const fixture = createFixture(t);
  const source = path.join(fixture.root, "symlink-source.md");
  fs.writeFileSync(source, "legacy\n");
  fs.mkdirSync(path.dirname(fixture.tombstone), { recursive: true });
  try {
    fs.symlinkSync(source, fixture.tombstone, "file");
  } catch (error) {
    if (error && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      const sourceDir = path.join(fixture.root, "junction-source");
      fs.mkdirSync(sourceDir);
      fs.writeFileSync(path.join(sourceDir, "marker.txt"), "preserve\n");
      try {
        fs.symlinkSync(sourceDir, fixture.tombstone, "junction");
      } catch (junctionError) {
        if (junctionError && ["EPERM", "EACCES", "ENOTSUP"].includes(junctionError.code)) {
          t.skip(`symlink and junction creation unavailable: ${error.code}/${junctionError.code}`);
          return;
        }
        throw junctionError;
      }
    } else {
      throw error;
    }
  }
  const result = run(fixture, "push", "--force");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /tombstone-symlink/);
  assert.equal(fs.lstatSync(fixture.tombstone).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(source, "utf8"), "legacy\n");
});

test("manifest rejects tombstone path escape", (t) => {
  const fixture = createFixture(t, {
    transformManifest(manifest) {
      manifest.homeTombstones[0].home = "../outside.md";
    }
  });
  const result = run(fixture, "status");
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /home tombstone path must stay inside its root/);
});

test("manifest rejects overlap between a forward home and tombstone", (t) => {
  const fixture = createFixture(t, {
    transformManifest(manifest) {
      manifest.homeTombstones[0].home = "forward.txt";
    }
  });
  const result = run(fixture, "status");
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /home tombstone overlaps a managed file/);
});

test("pull explicitly skips home-only tombstones without copying or deleting them", (t) => {
  const content = Buffer.from("legacy\n");
  const fixture = createFixture(t, { tombstone: content, allowedSha256: [sha256(content)] });
  const result = run(fixture, "pull");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /skip\s+pull tombstone .*home-only cleanup applies only to push/);
  assert.deepEqual(fs.readFileSync(fixture.tombstone), content);
  assert.equal(
    fs.existsSync(path.join(fixture.system, "skills", "codex-parallel-collab", "README.md")),
    false
  );
});

test("pull atomically replaces a managed repo file without creating a backup", (t) => {
  const fixture = createFixture(t, { repoForward: "repo-old\n", homeForward: "home-new\n" });
  const result = run(fixture, "pull", "--force");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /copy\s+pull forward\.txt/);
  assert.equal(fs.readFileSync(path.join(fixture.system, "forward.txt"), "utf8"), "home-new\n");
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);
});

test("a tombstone preflight refusal prevents an otherwise allowed forward copy", (t) => {
  const fixture = createFixture(t, {
    repoForward: "repo-new\n",
    homeForward: "home-old\n",
    tombstone: "unknown\n",
    allowedSha256: [sha256("allowed\n")]
  });
  const result = run(fixture, "push", "--force");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /preflight refused; no files changed/);
  assert.equal(fs.readFileSync(path.join(fixture.home, "forward.txt"), "utf8"), "home-old\n");
  assert.equal(fs.readFileSync(fixture.tombstone, "utf8"), "unknown\n");
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
});

test("schema 2 adopts a disposable home and pull remains full-file only", (t) => {
  const fixture = createFixture(t, { schema2: true });
  const initialStatus = run(fixture, "status");
  assert.equal(initialStatus.status, 1, initialStatus.stderr || initialStatus.stdout);
  assert.match(initialStatus.stdout, /config-drift\s+set model/);
  const initialDiff = run(fixture, "diff");
  assert.equal(initialDiff.status, 1, initialDiff.stderr || initialDiff.stdout);
  assert.match(initialDiff.stdout, /diff config set model/);
  const dryRun = run(fixture, "push", "--dry-run");
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /would patch config config\.toml/);
  assert.equal(fs.existsSync(path.join(fixture.home, "config.toml")), false);

  const push = run(fixture, "push");
  assert.equal(push.status, 0, push.stderr || push.stdout);
  assert.match(push.stdout, /patch  push config config\.toml/);
  assert.equal(fs.existsSync(path.join(fixture.home, "models.json")), true);
  assert.equal(fs.existsSync(path.join(fixture.home, "agents", "trellis-frontend.toml")), true);
  assert.match(
    fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"),
    /\[features\.multi_agent_v2\]\nmulti_agent_mode_hint_text = "Proactive multi-agent delegation is active\."/
  );
  assert.match(
    fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"),
    /\[features\]\ndefault_mode_request_user_input = true\n\n\[features\.multi_agent_v2\]/
  );

  const status = run(fixture, "status");
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /config-clean\s+config\.toml/);

  fs.writeFileSync(path.join(fixture.home, "forward.txt"), "pulled\n");
  const pull = run(fixture, "pull");
  assert.equal(pull.status, 0, pull.stderr || pull.stdout);
  assert.match(pull.stdout, /skip\s+pull config config\.toml/);
  assert.equal(fs.readFileSync(path.join(fixture.system, "forward.txt"), "utf8"), "pulled\n");
});

test("config overlay preserves unmanaged bytes without backups and diff never prints their values", (t) => {
  const fixture = createFixture(t, { schema2: true });
  const unmanaged = '[unmanaged.private]\nopaque = "DO_NOT_PRINT_FIXTURE"\ncustom = { nested = true }\n';
  const originalConfig = `\uFEFF# keep this exact\nmodel    =   "old"  # preserve-inline\n${unmanaged}`;
  fs.writeFileSync(path.join(fixture.home, "config.toml"), originalConfig);

  const diff = run(fixture, "diff");
  assert.equal(diff.status, 1, diff.stderr || diff.stdout);
  assert.match(diff.stdout, /diff config set model/);
  assert.doesNotMatch(diff.stdout + diff.stderr, /DO_NOT_PRINT_FIXTURE|opaque/);

  const push = run(fixture, "push", "--force");
  assert.equal(push.status, 0, push.stderr || push.stdout);
  const updated = fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8");
  assert.ok(updated.startsWith("\uFEFF"));
  assert.match(updated, /model    =   "gpt-test"  # preserve-inline/);
  assert.ok(updated.includes(unmanaged));
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
});

test("catalog drift uses a content-suppressed diff", (t) => {
  const fixture = createFixture(t, {
    schema2: true,
    transformManifest(manifest) {
      manifest.files.find((entry) => entry.repo === "models.json").diffMode = "summary";
    }
  });
  fs.writeFileSync(path.join(fixture.home, "models.json"), '{"fixture":"SUPPRESSED_CATALOG_FIXTURE"}\n');
  const diff = run(fixture, "diff");
  assert.equal(diff.status, 1, diff.stderr || diff.stdout);
  assert.match(diff.stdout, /diff summary models\.json: managed bytes differ \(content suppressed\)/);
  assert.doesNotMatch(diff.stdout + diff.stderr, /SUPPRESSED_CATALOG_FIXTURE/);
});

test("feature-gated config is reported unsupported and not injected", (t) => {
  const fixture = createFixture(t, { schema2: true });
  fs.writeFileSync(
    path.join(fixture.home, "config.toml"),
    "suppress_unstable_features_warning = true\n[features]\ndefault_mode_request_user_input = true\n"
  );
  const push = runWithEnv(fixture, { CODEX_SYNC_FEATURES: "" }, "push", "--force");
  assert.equal(push.status, 0, push.stderr || push.stdout);
  const config = fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8");
  assert.doesNotMatch(config, /default_mode_request_user_input/);
  assert.doesNotMatch(config, /suppress_unstable_features_warning/);
  const status = runWithEnv(fixture, { CODEX_SYNC_FEATURES: "" }, "status");
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /config-unsupported\s+features\.default_mode_request_user_input/);
});

test("managed unstable-feature warning suppression is idempotent", (t) => {
  const fixture = createFixture(t, { schema2: true });
  const first = run(fixture, "push");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.match(
    fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"),
    /^suppress_unstable_features_warning = true$/m
  );
  const second = run(fixture, "push");
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.match(second.stdout, /clean\s+push config config\.toml/);
  const status = run(fixture, "status");
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /config-clean\s+config\.toml/);
});

test("failed feature probe blocks status, dry-run, and push without changing config", (t) => {
  const fixture = createFixture(t, { schema2: true });
  const configPath = path.join(fixture.home, "config.toml");
  const original = "suppress_unstable_features_warning = true\n[features]\ndefault_mode_request_user_input = true\n";
  fs.writeFileSync(configPath, original);
  const probeEnv = {
    CODEX_SYNC_FEATURES: null,
    CODEX_SYNC_CLI: path.join(fixture.root, "missing-codex-executable")
  };
  const status = runWithEnv(fixture, probeEnv, "status");
  assert.equal(status.status, 1, status.stderr || status.stdout);
  assert.match(status.stdout, /config-refused\s+config\.toml: Codex feature probe failed/);
  const dryRun = runWithEnv(fixture, probeEnv, "push", "--dry-run", "--force");
  assert.equal(dryRun.status, 2, dryRun.stderr || dryRun.stdout);
  const push = runWithEnv(fixture, probeEnv, "push", "--force");
  assert.equal(push.status, 2, push.stderr || push.stdout);
  assert.equal(fs.readFileSync(configPath, "utf8"), original);
  assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
});

test("duplicate and ambiguous managed config keys fail closed", async (t) => {
  await t.test("duplicate scalar", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const original = 'model = "one"\nmodel = "two"\n';
    fs.writeFileSync(path.join(fixture.home, "config.toml"), original);
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /duplicate managed key: model/);
    assert.equal(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), original);
  });

  await t.test("malformed integer separators", (st) => {
    for (const malformed of ["345_", "1__2", "_12", "12_"]) {
      const fixture = createFixture(st, { schema2: true });
      const original = `agents.max_concurrent_threads_per_session = ${malformed}\n`;
      fs.writeFileSync(path.join(fixture.home, "config.toml"), original);
      const status = run(fixture, "status");
      assert.equal(status.status, 1, status.stderr || status.stdout);
      assert.match(status.stdout, /config-refused.*managed value is not a supported scalar/);
      const push = run(fixture, "push", "--force");
      assert.equal(push.status, 2, push.stderr || push.stdout);
      assert.match(push.stdout, /managed value is not a supported scalar/);
      assert.equal(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), original);
    }
  });

  await t.test("quoted managed table", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const original = '[agents."trellis_frontend"]\nconfig_file = "elsewhere.toml"\n';
    fs.writeFileSync(path.join(fixture.home, "config.toml"), original);
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /ambiguous managed table/);
    assert.equal(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), original);
  });

  await t.test("quoted features table", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const original = '[features."nested"]\ndefault_mode_request_user_input = true\n';
    fs.writeFileSync(path.join(fixture.home, "config.toml"), original);
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /ambiguous managed table/);
    assert.equal(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), original);
  });

  await t.test("duplicate nested managed table", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const original = "[features.multi_agent_v2]\nother = true\n[features.multi_agent_v2]\nmore = true\n";
    fs.writeFileSync(path.join(fixture.home, "config.toml"), original);
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /duplicate managed table: features\.multi_agent_v2/);
    assert.equal(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), original);
  });

  await t.test("quoted managed roots and whitespace variants refuse byte-identically", (st) => {
    const cases = [
      '["agents"]\nmax_concurrent_threads_per_session = 2\n',
      "['features']\njs_repl = true\n",
      '[  "agents"  .  "nested"  ]\nconfig_file = "elsewhere.toml"\n',
      "[ 'features' . nested ]\ndefault_mode_request_user_input = false\n",
      '[[  "agents"  ]]\nname = "shadow"\n'
    ];
    for (const original of cases) {
      const fixture = createFixture(st, { schema2: true });
      const configPath = path.join(fixture.home, "config.toml");
      fs.writeFileSync(configPath, original);
      const result = run(fixture, "push", "--force");
      assert.equal(result.status, 2, result.stderr || result.stdout);
      assert.match(result.stdout, /ambiguous managed (?:array )?table/);
      assert.equal(fs.readFileSync(configPath, "utf8"), original);
      assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
    }
  });

  await t.test("quoted unknown table retains opaque scope", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const opaqueBlock = '["private.scope"]\nmodel    =   "nested"  # byte-stable\n';
    fs.writeFileSync(path.join(fixture.home, "config.toml"), opaqueBlock);
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const updated = fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8");
    assert.ok(updated.includes(opaqueBlock));
    assert.match(updated, /^model = "gpt-test"/);
  });
});

test("exact legacy agent tables are removed and conflicting tables are refused", async (t) => {
  await t.test("exact table", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const expected = path.resolve(fixture.home, "agents", "trellis-frontend.toml");
    fs.writeFileSync(
      path.join(fixture.home, "config.toml"),
      `# before legacy\n[agents.trellis_frontend]\n# between legacy lines\nconfig_file = ${JSON.stringify(expected)}\n# after legacy\n\n[unmanaged]\nkeep = "yes"\n`
    );
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const updated = fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8");
    assert.doesNotMatch(updated, /\[agents\.trellis_frontend\]/);
    assert.ok(updated.includes("# before legacy\n"));
    assert.ok(updated.includes("# between legacy lines\n# after legacy\n\n"));
    assert.ok(updated.indexOf("# before legacy") < updated.indexOf("# between legacy lines"));
    assert.match(updated, /\[unmanaged\]\nkeep = "yes"/);
  });

  await t.test("extra key", (st) => {
    const fixture = createFixture(st, { schema2: true });
    const expected = path.resolve(fixture.home, "agents", "trellis-frontend.toml");
    const original = `[agents.trellis_frontend]\nconfig_file = ${JSON.stringify(expected)}\ndescription = "user-owned"\n`;
    fs.writeFileSync(path.join(fixture.home, "config.toml"), original);
    const result = run(fixture, "push", "--force");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /legacy agent table has extra or missing keys/);
    assert.equal(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), original);
  });
});

test("a tombstoned retired role may retain exact legacy config-table cleanup", (t) => {
  const fixture = createFixture(t, {
    schema2: true,
    transformManifest(manifest) {
      manifest.files = manifest.files.filter(
        (entry) => entry.home !== "agents/trellis-frontend.toml"
      );
      manifest.agentSets = [];
      manifest.homeTombstones.push({
        home: "agents/trellis-frontend.toml",
        allowedSha256: [sha256("retired\n")],
        description: "Retired fixture profile"
      });
    }
  });
  const expected = path.resolve(fixture.home, "agents", "trellis-frontend.toml");
  fs.writeFileSync(
    path.join(fixture.home, "config.toml"),
    `[agents.trellis_frontend]\nconfig_file = ${JSON.stringify(expected)}\n`
  );
  const result = run(fixture, "push", "--force");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(fs.readFileSync(path.join(fixture.home, "config.toml"), "utf8"), /trellis_frontend/);
  assert.match(result.stdout, /clean\s+push tombstone agents\/trellis-frontend\.toml/);
});

test("config immediate revalidation refuses a mutation observed before replacement", async (t) => {
  const fixture = createFixture(t, { schema2: true });
  const configPath = path.join(fixture.home, "config.toml");
  fs.writeFileSync(configPath, 'model = "old"\n');
  const marker = path.join(fixture.root, "config-marker");
  const child = spawn(process.execPath, [fixture.script, "push", "--force", "--home", fixture.home], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...fixture.env,
      CODEX_SYNC_TEST_CONFIG_MARKER: marker,
      CODEX_SYNC_TEST_CONFIG_DELAY_MS: "2000"
    }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  for (let attempt = 0; attempt < 100 && !fs.existsSync(marker); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(marker), true, "sync did not reach the pre-replacement revalidation window");
  fs.writeFileSync(configPath, 'model = "concurrent"\n');
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 2, stderr || stdout);
  assert.match(stdout, /config target changed after preflight/);
  assert.match(stdout, /partial apply boundary: 2 managed mutation\(s\) completed/);
  assert.equal(fs.readFileSync(configPath, "utf8"), 'model = "concurrent"\n');
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);
});

test("managed staging failure leaves every target, config, and state unchanged", (t) => {
  const fixture = createFixture(t, { schema2: true, repoForward: "repo-new\n", homeForward: "home-old\n" });
  const configPath = path.join(fixture.home, "config.toml");
  const original = 'model = "old"\n';
  fs.writeFileSync(configPath, original);
  const result = runWithEnv(
    fixture,
    { CODEX_SYNC_TEST_STAGE_FAIL_REPO: "forward.txt" },
    "push",
    "--force"
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /staging failed .*forward\.txt.*no managed targets changed/);
  assert.equal(fs.readFileSync(configPath, "utf8"), original);
  assert.equal(fs.existsSync(path.join(fixture.home, "models.json")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, "agents", "trellis-frontend.toml")), false);
  assert.equal(fs.readFileSync(path.join(fixture.home, "forward.txt"), "utf8"), "home-old\n");
  assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);
});

test("a source race after staging fails global revalidation without target mutation", async (t) => {
  const fixture = createFixture(t, { repoForward: "repo-staged\n", homeForward: "home-original\n" });
  const homePath = path.join(fixture.home, "forward.txt");
  const repoPath = path.join(fixture.system, "forward.txt");
  const result = await runPaused(
    fixture,
    "before-global-revalidation",
    "",
    () => fs.writeFileSync(repoPath, "repo-concurrent\n"),
    "push",
    "--force"
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /global revalidation failed .*source changed after staging forward\.txt/);
  assert.match(result.stdout, /no managed targets changed/);
  assert.equal(fs.readFileSync(homePath, "utf8"), "home-original\n");
  assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);

  const converge = run(fixture, "push", "--force");
  assert.equal(converge.status, 0, converge.stderr || converge.stdout);
  assert.equal(fs.readFileSync(homePath, "utf8"), "repo-concurrent\n");
});

test("a target mutation observed before immediate revalidation reports a partial boundary and reconverges", async (t) => {
  const fixture = createFixture(t, { schema2: true });
  const modelTarget = path.join(fixture.home, "models.json");
  const profileTarget = path.join(fixture.home, "agents", "trellis-frontend.toml");
  const result = await runPaused(
    fixture,
    "before-copy-replace",
    "agents/trellis-frontend.toml",
    () => {
      assert.equal(fs.existsSync(modelTarget), true, "first managed replacement should already be visible");
      fs.mkdirSync(path.dirname(profileTarget), { recursive: true });
      fs.writeFileSync(profileTarget, "concurrent profile\n");
    },
    "push",
    "--force"
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /target changed after preflight agents\/trellis-frontend\.toml/);
  assert.match(result.stdout, /partial apply boundary: 1 managed mutation\(s\) completed/);
  assert.equal(fs.readFileSync(profileTarget, "utf8"), "concurrent profile\n");
  assert.equal(fs.existsSync(path.join(fixture.home, "config.toml")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);

  const converge = run(fixture, "push", "--force");
  assert.equal(converge.status, 0, converge.stderr || converge.stdout);
  assert.equal(run(fixture, "status").status, 0);
});

test("atomic replacement visibility does not claim a linearizable post-revalidation compare-and-swap", async (t) => {
  const fixture = createFixture(t, { repoForward: "repo-new\n", homeForward: "home-old\n" });
  const target = path.join(fixture.home, "forward.txt");
  const result = await runPaused(
    fixture,
    "after-copy-revalidation",
    "forward.txt",
    () => {
      assert.equal(fs.readFileSync(target, "utf8"), "home-old\n");
      fs.writeFileSync(target, "non-cooperating-post-check-writer\n");
    },
    "push",
    "--force"
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(target, "utf8"), "repo-new\n");
  assert.match(result.stdout, /copy\s+push forward\.txt/);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);
});

test("a state race preserves the concurrent state and rerun records the applied file", async (t) => {
  const fixture = createFixture(t, { repoForward: "repo-new\n", homeForward: "home-old\n" });
  const stateTarget = path.join(fixture.home, ".prompt-sync-state.json");
  const result = await runPaused(
    fixture,
    "before-state-replace",
    ".prompt-sync-state.json",
    () => fs.writeFileSync(stateTarget, '{"schema":1,"files":{}}\n'),
    "push",
    "--force"
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /state target changed after preflight/);
  assert.match(result.stdout, /partial apply boundary: 1 managed mutation\(s\) completed/);
  assert.equal(fs.readFileSync(path.join(fixture.home, "forward.txt"), "utf8"), "repo-new\n");
  assert.equal(fs.readFileSync(stateTarget, "utf8"), '{"schema":1,"files":{}}\n');
  assert.deepEqual(stagingFiles(fixture.root), []);

  const converge = run(fixture, "push");
  assert.equal(converge.status, 0, converge.stderr || converge.stdout);
  assert.equal(run(fixture, "status").status, 0);
});

test("tombstones run last, recheck exact bytes, and never create recovery copies", async (t) => {
  const allowed = "legacy-allowed\n";
  const fixture = createFixture(t, {
    repoForward: "repo-new\n",
    homeForward: "home-old\n",
    tombstone: allowed,
    allowedSha256: [sha256(allowed)]
  });
  const result = await runPaused(
    fixture,
    "before-tombstones",
    "",
    () => {
      assert.equal(fs.readFileSync(path.join(fixture.home, "forward.txt"), "utf8"), "repo-new\n");
      assert.equal(fs.existsSync(path.join(fixture.home, ".prompt-sync-state.json")), true);
      fs.writeFileSync(fixture.tombstone, "concurrent-unknown\n");
    },
    "push",
    "--force"
  );
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /tombstone changed immediately before delete/);
  assert.match(result.stdout, /partial apply boundary: 2 managed mutation\(s\) completed/);
  assert.equal(fs.readFileSync(fixture.tombstone, "utf8"), "concurrent-unknown\n");
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);

  const refused = run(fixture, "push", "--force");
  assert.equal(refused.status, 2, refused.stderr || refused.stdout);
  assert.match(refused.stdout, /tombstone-hash-mismatch/);
  fs.writeFileSync(fixture.tombstone, allowed);
  const converge = run(fixture, "push", "--force");
  assert.equal(converge.status, 0, converge.stderr || converge.stdout);
  assert.equal(fs.existsSync(fixture.tombstone), false);
  assert.equal(run(fixture, "status").status, 0);
});

test("tombstone revalidation and unlink expose the documented non-linearizable post-check boundary", async (t) => {
  const allowed = "legacy-allowed\n";
  const fixture = createFixture(t, {
    tombstone: allowed,
    allowedSha256: [sha256(allowed)]
  });
  const result = await runPaused(
    fixture,
    "after-tombstone-revalidation",
    "skills/codex-parallel-collab/README.md",
    () => fs.writeFileSync(fixture.tombstone, "non-cooperating-post-check-writer\n"),
    "push"
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(fixture.tombstone), false);
  assert.match(result.stdout, /delete tombstone skills\/codex-parallel-collab\/README\.md/);
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.deepEqual(stagingFiles(fixture.root), []);
});

test("Prompt-owned agent drift remains a full-file sync concern", (t) => {
  const fixture = createFixture(t, { schema2: true });
  assert.equal(run(fixture, "push").status, 0);
  const homeProfile = path.join(fixture.home, "agents", "trellis-frontend.toml");
  fs.appendFileSync(homeProfile, "# drift\n");
  const status = run(fixture, "status");
  assert.equal(status.status, 1, status.stderr || status.stdout);
  assert.match(status.stdout, /home-ahead\s+agents\/trellis-frontend\.toml/);
  const repair = run(fixture, "push", "--force");
  assert.equal(repair.status, 0, repair.stderr || repair.stdout);
  assert.match(repair.stdout, /copy\s+push agents\/trellis-frontend\.toml/);
  assert.equal(
    fs.readFileSync(homeProfile, "utf8"),
    fs.readFileSync(path.join(fixture.system, "agents", "trellis-frontend.toml"), "utf8")
  );
  assert.equal(fs.existsSync(path.join(fixture.home, "backups")), false);
  assert.equal(run(fixture, "status").status, 0);
});

test("Prompt-owned agent names and catalog models are validated", async (t) => {
  await t.test("name mismatch", (st) => {
    const fixture = createFixture(st, {
      schema2: true,
      profile: 'name = "wrong_name"\ndescription = "test"\nmodel = "gpt-test"\ndeveloper_instructions = "test"\n'
    });
    const result = run(fixture, "status");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Prompt-owned agent name mismatch/);
  });
  await t.test("model absent from catalog", (st) => {
    const fixture = createFixture(st, {
      schema2: true,
      profile: 'name = "trellis_frontend"\ndescription = "test"\nmodel = "missing-model"\ndeveloper_instructions = "test"\n'
    });
    const result = run(fixture, "status");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Prompt-owned agent model is absent from models\.json/);
  });
});

test("full-file push refuses a reparse target even with force", (t) => {
  const fixture = createFixture(t, {
    repoForward: "new\n",
    homeForward: "old\n",
    transformManifest(manifest) {
      manifest.files[0].home = "linked/forward.txt";
    }
  });
  const outsideDir = path.join(fixture.root, "outside");
  fs.mkdirSync(outsideDir);
  const outside = path.join(outsideDir, "forward.txt");
  fs.writeFileSync(outside, "outside\n");
  try {
    fs.symlinkSync(outsideDir, path.join(fixture.home, "linked"), "junction");
  } catch (error) {
    if (error && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`junction creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const push = run(fixture, "push", "--force");
  assert.equal(push.status, 2, push.stderr || push.stdout);
  assert.match(push.stdout, /unsafe path or reparse point/);
  assert.equal(fs.readFileSync(outside, "utf8"), "outside\n");
});

test("legacy external-manifest agent ownership is rejected", (t) => {
  const fixture = createFixture(t, {
    schema2: true,
    transformManifest(manifest) {
      manifest.agentSets.push({
        id: "trellis",
        ownership: "external-manifest",
        sourceRoot: "C:/legacy/trellis/agents",
        ownerManifest: "trellis/agents-manifest.json",
        roles: [{ name: "trellis_check", ownerName: "trellis-check", file: "trellis-check.toml", home: "agents/trellis-check.toml" }]
      });
    }
  });
  const status = run(fixture, "status");
  assert.equal(status.status, 1, status.stderr || status.stdout);
  assert.match(status.stderr, /unsupported agent set ownership: external-manifest/);
});

test("unknown runtime agents are reported without deletion", (t) => {
  const fixture = createFixture(t, { schema2: true });
  const unknown = path.join(fixture.home, "agents", "custom", "unknown.toml");
  fs.mkdirSync(path.dirname(unknown), { recursive: true });
  fs.writeFileSync(unknown, 'name = "unknown_role"\nmodel = "gpt-test"\n');
  const status = run(fixture, "status");
  assert.equal(status.status, 1, status.stderr || status.stdout);
  assert.match(status.stdout, /unclaimed-agent\s+agents\/custom\/unknown\.toml/);
  const push = run(fixture, "push");
  assert.equal(push.status, 0, push.stderr || push.stdout);
  assert.equal(fs.existsSync(unknown), true);
});

test("catalog validation rejects invalid structure and duplicate slugs", async (t) => {
  await t.test("invalid structure", (st) => {
    const fixture = createFixture(st, { schema2: true, catalog: '{"models":{}}\n' });
    const result = run(fixture, "status");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /models\.json must contain a models array/);
  });
  await t.test("duplicate slug", (st) => {
    const fixture = createFixture(st, {
      schema2: true,
      catalog: '{"models":[{"slug":"gpt-test"},{"slug":"gpt-test"}]}\n'
    });
    const result = run(fixture, "status");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /duplicate slug: gpt-test/);
  });
});

test("agent inventory rejects duplicate declared ownership and reports duplicate runtime names", async (t) => {
  await t.test("duplicate declared role", (st) => {
    const fixture = createFixture(st, {
      schema2: true,
      transformManifest(manifest, paths) {
        fs.writeFileSync(
          path.join(paths.system, "agents", "other.toml"),
          'name = "other_role"\nmodel = "gpt-test"\n'
        );
        manifest.files.push({
          repo: "agents/other.toml",
          home: "agents/other.toml",
          description: "Duplicate-role fixture mapping"
        });
        manifest.agentSets.push({
          id: "duplicate",
          ownership: "full-file",
          roles: [{
            name: "trellis_frontend",
            repo: "agents/other.toml",
            home: "agents/other.toml"
          }]
        });
      }
    });
    const result = run(fixture, "status");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /duplicate role ownership: trellis_frontend/);
  });

  await t.test("duplicate declared runtime path", (st) => {
    const fixture = createFixture(st, {
      schema2: true,
      transformManifest(manifest) {
        manifest.agentSets.push({
          id: "duplicate-path",
          ownership: "full-file",
          roles: [{
            name: "different_role",
            repo: "agents/trellis-frontend.toml",
            home: "agents/trellis-frontend.toml"
          }]
        });
      }
    });
    const result = run(fixture, "status");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /duplicate runtime agent ownership/);
  });

  await t.test("duplicate runtime name", (st) => {
    const fixture = createFixture(st, { schema2: true });
    assert.equal(run(fixture, "push").status, 0);
    fs.writeFileSync(
      path.join(fixture.home, "agents", "shadow.toml"),
      'name = "trellis_frontend"\nmodel = "gpt-test"\n'
    );
    const status = run(fixture, "status");
    assert.equal(status.status, 1, status.stderr || status.stdout);
    assert.match(status.stdout, /duplicate-runtime-role\s+trellis_frontend:/);
  });
});
