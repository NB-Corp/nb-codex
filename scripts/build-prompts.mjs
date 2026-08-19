#!/usr/bin/env node
// Builds the single deployable root prompt from the source file.
//
//   node scripts/build-prompts.mjs           # write the projection
//   node scripts/build-prompts.mjs --check   # verify committed artifact matches the source
//
// Source:    prompts/src/system-prompt.src.md
// Artifact:  prompts/system-prompt-neutral.md
//
// This package has no persona variant. The source is the nia-derived
// engineering prompt with the persona layer removed.

import fs from "node:fs";
import path from "node:path";

const scriptPath = new URL(import.meta.url).pathname;
const scriptDir = path.dirname(process.platform === "win32" && scriptPath.startsWith("/")
  ? scriptPath.slice(1)
  : scriptPath);
const systemRoot = path.resolve(scriptDir, "..");
const srcPath = path.join(systemRoot, "prompts", "src", "system-prompt.src.md");
const targetPath = path.join(systemRoot, "prompts", "system-prompt-neutral.md");

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(srcPath)) fail(`source file not found: ${srcPath}`);
const source = fs.readFileSync(srcPath, "utf8");
if (/<!-- @(?:nia|neutral|shared) -->/.test(source)) {
  fail("nb-codex prompt source must not contain dual-build variant markers");
}
if (/\bNia\b|妮娅|本宝宝|杂鱼大叔/.test(source)) {
  fail("nb-codex prompt source still contains Nia persona residue");
}

const checkMode = process.argv.includes("--check");
const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null;
if (checkMode) {
  if (existing === source) {
    console.log(`clean    ${path.relative(systemRoot, targetPath)}`);
    process.exit(0);
  }
  console.log(`stale    ${path.relative(systemRoot, targetPath)} (rebuild with: node scripts/build-prompts.mjs)`);
  process.exit(1);
}
if (existing === source) {
  console.log(`clean    ${path.relative(systemRoot, targetPath)}`);
  process.exit(0);
}
fs.writeFileSync(targetPath, source, "utf8");
console.log(`written  ${path.relative(systemRoot, targetPath)} (${source.length} chars)`);
