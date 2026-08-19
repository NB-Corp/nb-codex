import path from 'node:path';
import process from 'node:process';

function fail(message) {
  throw new Error(message);
}

function portable(value) {
  return path.resolve(value).replaceAll('\\', '/');
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function formatScalar(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  fail(`unsupported managed config value: ${JSON.stringify(value)}`);
}

function isEscaped(value, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function lexLine(raw, activeMultiline) {
  if (activeMultiline) {
    const closeAt = raw.indexOf(activeMultiline);
    return { code: '', depthDelta: 0, multiline: closeAt >= 0 ? null : activeMultiline, wasMultiline: true };
  }
  let quote = null;
  let code = '';
  let depthDelta = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const triple = raw.slice(index, index + 3);
    if (!quote && (triple === '\"\"\"' || triple === "'''")) {
      const closeAt = raw.indexOf(triple, index + 3);
      if (closeAt < 0) return { code, depthDelta, multiline: triple, wasMultiline: false };
      code += raw.slice(index, closeAt + 3);
      index = closeAt + 2;
      continue;
    }
    if (!quote && char === '#') break;
    if (!quote && (char === '"' || char === "'")) quote = char;
    else if (quote === char && (quote === "'" || !isEscaped(raw, index))) quote = null;
    if (!quote) {
      if (char === '[' || char === '{') depthDelta += 1;
      if (char === ']' || char === '}') depthDelta -= 1;
    }
    code += char;
  }
  return { code, depthDelta, multiline: null, wasMultiline: false };
}

function findEquals(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!quote && (char === '"' || char === "'")) quote = char;
    else if (quote === char && (quote === "'" || !isEscaped(value, index))) quote = null;
    else if (!quote && char === '=') return index;
  }
  return -1;
}

function tokenRange(raw, equals) {
  let start = equals + 1;
  while (start < raw.length && /\s/.test(raw[start])) start += 1;
  if (start >= raw.length) return { start, end: start };
  const quote = raw[start];
  if (quote === '"' || quote === "'") {
    for (let index = start + 1; index < raw.length; index += 1) {
      if (raw[index] === quote && (quote === "'" || !isEscaped(raw, index))) return { start, end: index + 1 };
    }
    return { start, end: raw.length };
  }
  let end = start;
  while (end < raw.length && !/\s|#/.test(raw[end])) end += 1;
  return { start, end };
}

function tableRoot(code, arrayTable) {
  const openLength = arrayTable ? 2 : 1;
  const close = arrayTable ? ']]' : ']';
  if (!code.startsWith(arrayTable ? '[[' : '[') || !code.endsWith(close)) return null;
  const inner = code.slice(openLength, -close.length);
  let index = 0;
  while (index < inner.length && /\s/.test(inner[index])) index += 1;
  if (index >= inner.length) return null;
  let root;
  if (inner[index] === '"' || inner[index] === "'") {
    const quote = inner[index];
    const start = index;
    index += 1;
    while (index < inner.length) {
      if (inner[index] === quote && (quote === "'" || !isEscaped(inner, index))) break;
      index += 1;
    }
    if (index >= inner.length) return null;
    const token = inner.slice(start, index + 1);
    try {
      root = quote === '"' ? JSON.parse(token) : token.slice(1, -1);
    } catch {
      return null;
    }
    index += 1;
  } else {
    const match = inner.slice(index).match(/^([A-Za-z0-9_-]+)/);
    if (!match) return null;
    root = match[1];
    index += match[1].length;
  }
  while (index < inner.length && /\s/.test(inner[index])) index += 1;
  if (index < inner.length && inner[index] !== '.') return null;
  return root;
}

export function scanToml(text) {
  if (text.includes('\0')) fail('config.toml contains a NUL byte');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const hasBom = Boolean(lines.length && lines[0].startsWith('\uFEFF'));
  if (hasBom) lines[0] = lines[0].slice(1);
  const assignments = [];
  const headers = [];
  const errors = [];
  let section = [];
  let multiline = null;
  let continuationDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].replace(/\r?\n$/, '');
    const lexical = lexLine(raw, multiline);
    multiline = lexical.multiline;
    if (lexical.wasMultiline) continue;
    const code = lexical.code.trim();
    if (!code) continue;
    if (continuationDepth > 0) {
      continuationDepth += lexical.depthDelta;
      if (continuationDepth < 0) errors.push(`unbalanced TOML delimiter at line ${index + 1}`);
      continue;
    }
    if (code.startsWith('[[')) {
      if (['agents', 'features'].includes(tableRoot(code, true))) errors.push(`ambiguous managed array table at line ${index + 1}`);
      headers.push({ path: null, index });
      section = null;
      continue;
    }
    if (code.startsWith('[')) {
      const match = code.match(/^\[([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\]$/);
      if (!match) {
        if (['agents', 'features'].includes(tableRoot(code, false))) errors.push(`ambiguous managed table at line ${index + 1}`);
        headers.push({ path: null, index });
        section = null;
      } else {
        section = match[1].split('.');
        headers.push({ path: section.join('.'), index });
      }
      continue;
    }
    const equals = findEquals(lexical.code);
    if (equals < 0) {
      errors.push(`unsupported TOML statement at line ${index + 1}`);
      continue;
    }
    const keyText = lexical.code.slice(0, equals).trim();
    if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(keyText)) {
      if (/agents|features|model|service_tier/.test(keyText)) errors.push(`ambiguous managed key at line ${index + 1}`);
      continue;
    }
    const parts = keyText.split('.');
    const fullPath = section === null ? null : [...section, ...parts].join('.');
    const token = tokenRange(raw, equals);
    assignments.push({
      path: fullPath,
      index,
      raw,
      valueText: lexical.code.slice(equals + 1).trim(),
      valueStart: token.start,
      valueEnd: token.end,
    });
    if (fullPath === 'agents' || fullPath === 'features') errors.push(`inline managed table is ambiguous at line ${index + 1}`);
    continuationDepth = Math.max(0, lexical.depthDelta);
  }
  if (multiline) errors.push('unterminated multiline TOML string');
  if (continuationDepth !== 0) errors.push('unterminated TOML array or inline table');
  for (let index = 0; index < headers.length; index += 1) {
    headers[index].end = index + 1 < headers.length ? headers[index + 1].index : lines.length;
  }
  if (errors.length) fail(`config.toml cannot be patched safely: ${errors.join('; ')}`);
  return { lines, newline, hasBom, assignments, headers, errors: [] };
}

export function parseScalar(valueText) {
  const value = valueText.trim();
  const sign = value.startsWith('-') ? -1 : 1;
  const unsigned = /^[+-]/.test(value) ? value.slice(1) : value;
  const integerForms = [
    { pattern: /^(?:0|[1-9](?:_?[0-9])*)$/, radix: 10, digits: unsigned },
    { pattern: /^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/, radix: 16, digits: unsigned.slice(2) },
    { pattern: /^0o[0-7](?:_?[0-7])*$/, radix: 8, digits: unsigned.slice(2) },
    { pattern: /^0b[01](?:_?[01])*$/, radix: 2, digits: unsigned.slice(2) },
  ];
  for (const form of integerForms) {
    if (form.pattern.test(unsigned)) return sign * Number.parseInt(form.digits.replaceAll('_', ''), form.radix);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      fail('invalid basic string');
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  fail('managed value is not a supported scalar');
}

function lineEnding(line, fallback) {
  if (line.endsWith('\r\n')) return '\r\n';
  if (line.endsWith('\n')) return '\n';
  return fallback;
}

function appendInsertion(insertions, index, value) {
  const list = insertions.get(index) ?? [];
  list.push(value);
  insertions.set(index, list);
}

export function buildOverlaySpecFromFeatures(syncManifest, home, featureNames) {
  const patch = syncManifest?.configPatch;
  if (!patch || !Array.isArray(patch.values) || !Array.isArray(patch.featureValues) || !Array.isArray(patch.absent)) {
    fail('bundled sync-manifest configPatch is invalid');
  }
  if (!(featureNames instanceof Set)) fail('featureNames must be a Set');
  const values = new Map();
  for (const item of patch.values) {
    if (typeof item.path !== 'string') fail('configPatch value path is invalid');
    values.set(item.path, Object.hasOwn(item, 'homePath') ? portable(path.join(home, item.homePath)) : item.value);
  }
  const exposed = [];
  const absent = new Set(patch.absent);
  for (const item of patch.featureValues) {
    if (featureNames.has(item.feature)) {
      values.set(item.path, item.value);
      if (!exposed.includes(item.feature)) exposed.push(item.feature);
    } else absent.add(item.path);
  }
  const legacyTables = new Map((patch.legacyAgentTables ?? []).map((item) => [
    `agents.${item.role}`,
    portable(path.join(home, item.configFile)),
  ]));
  return { values, absent, legacyTables, exposed };
}

export function buildOverlaySpec(syncManifest, home, featureOutput) {
  const featureNames = new Set();
  for (const line of featureOutput.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)\s+/);
    if (match) featureNames.add(match[1]);
  }
  return buildOverlaySpecFromFeatures(syncManifest, home, featureNames);
}

export function analyzeConfigOverlay(current, spec) {
  const document = scanToml(current);
  const changes = [];
  const managed = new Set([...spec.values.keys(), ...spec.absent]);
  const byPath = new Map();
  for (const assignment of document.assignments) {
    if (typeof assignment.path !== 'string' || !managed.has(assignment.path)) continue;
    const list = byPath.get(assignment.path) ?? [];
    list.push(assignment);
    byPath.set(assignment.path, list);
  }
  for (const managedPath of managed) {
    if ((byPath.get(managedPath) ?? []).length > 1) fail(`duplicate managed key: ${managedPath}`);
  }
  const managedSections = new Set(['agents', 'features']);
  for (const managedPath of managed) {
    const parts = managedPath.split('.');
    if (parts.length > 1) managedSections.add(parts.slice(0, -1).join('.'));
  }
  for (const section of managedSections) {
    if (document.headers.filter((header) => header.path === section).length > 1) {
      fail(`duplicate managed table: ${section}`);
    }
  }
  const replacements = new Map();
  const removals = new Set();
  const missing = [];
  for (const [managedPath, desired] of spec.values) {
    const matches = byPath.get(managedPath) ?? [];
    if (!matches.length) {
      missing.push({ path: managedPath, value: desired });
      changes.push({ action: 'set', path: managedPath });
      continue;
    }
    const assignment = matches[0];
    let actual;
    try {
      actual = parseScalar(assignment.valueText);
    } catch (error) {
      fail(`invalid managed scalar ${managedPath}: ${error.message}`);
    }
    if (!Object.is(actual, desired)) {
      changes.push({ action: 'set', path: managedPath });
      replacements.set(
        assignment.index,
        `${assignment.raw.slice(0, assignment.valueStart)}${formatScalar(desired)}${assignment.raw.slice(assignment.valueEnd)}${lineEnding(document.lines[assignment.index], document.newline)}`,
      );
    }
  }
  for (const managedPath of spec.absent) {
    const matches = byPath.get(managedPath) ?? [];
    if (matches.length === 1) {
      changes.push({ action: 'remove', path: managedPath });
      removals.add(matches[0].index);
    }
  }
  for (const [tablePath, expectedConfig] of spec.legacyTables) {
    const exactHeaders = document.headers.filter((header) => header.path === tablePath);
    const nestedHeaders = document.headers.filter((header) => typeof header.path === 'string' && header.path.startsWith(`${tablePath}.`));
    const dotted = document.assignments.filter((assignment) =>
      typeof assignment.path === 'string' && assignment.path.startsWith(`${tablePath}.`) &&
      !exactHeaders.some((header) => assignment.index > header.index && assignment.index < header.end));
    if (exactHeaders.length > 1 || nestedHeaders.length || dotted.length) fail(`ambiguous legacy agent table: ${tablePath}`);
    if (!exactHeaders.length) continue;
    const header = exactHeaders[0];
    const assignments = document.assignments.filter((assignment) => assignment.index > header.index && assignment.index < header.end);
    if (assignments.length !== 1 || assignments[0].path !== `${tablePath}.config_file`) {
      fail(`legacy agent table has extra or missing keys: ${tablePath}`);
    }
    const actual = parseScalar(assignments[0].valueText);
    if (typeof actual !== 'string' || !samePath(actual, expectedConfig)) fail(`legacy agent table config_file conflicts: ${tablePath}`);
    changes.push({ action: 'remove-table', path: tablePath });
    removals.add(header.index);
    removals.add(assignments[0].index);
  }
  const insertions = new Map();
  for (const entry of [...missing].sort((a, b) => a.path.split('.').length - b.path.split('.').length)) {
    const parts = entry.path.split('.');
    const section = parts.length === 1 ? '' : parts.slice(0, -1).join('.');
    const line = `${parts.at(-1)} = ${formatScalar(entry.value)}${document.newline}`;
    if (!section) {
      const firstHeader = document.headers[0]?.index ?? document.lines.length;
      const prefix = firstHeader === document.lines.length && document.lines.length && !document.lines.at(-1).endsWith('\n') ? document.newline : '';
      appendInsertion(insertions, firstHeader, `${prefix}${line}`);
      continue;
    }
    const header = document.headers.find((candidate) => candidate.path === section);
    if (header) appendInsertion(insertions, header.end, line);
    else {
      const descendant = document.headers.find((candidate) => typeof candidate.path === 'string' && candidate.path.startsWith(`${section}.`));
      if (descendant) appendInsertion(insertions, descendant.index, `[${section}]${document.newline}${line}${document.newline}`);
      else {
        const prefix = document.lines.length && !document.lines.at(-1).endsWith('\n') ? document.newline : '';
        appendInsertion(insertions, document.lines.length, `${prefix}${document.newline}[${section}]${document.newline}${line}`);
      }
    }
  }
  let patched = document.hasBom ? '\uFEFF' : '';
  for (let index = 0; index <= document.lines.length; index += 1) {
    if (insertions.has(index)) patched += insertions.get(index).join('');
    if (index === document.lines.length || removals.has(index)) continue;
    patched += replacements.get(index) ?? document.lines[index];
  }
  return { text: patched, changes };
}

export function renderConfig(current, spec) {
  return analyzeConfigOverlay(current, spec).text;
}

export function managedConfigConflict(current, spec) {
  const document = scanToml(current);
  for (const [managedPath, desired] of spec.values) {
    const matches = document.assignments.filter((item) => item.path === managedPath);
    if (matches.length > 1) fail(`duplicate managed key: ${managedPath}`);
    if (matches.length === 1 && !Object.is(parseScalar(matches[0].valueText), desired)) return true;
  }
  if (document.assignments.some((item) => spec.absent.has(item.path))) return true;
  return document.headers.some((header) => spec.legacyTables.has(header.path));
}

export function configOverlayValid(current, spec) {
  return renderConfig(current, spec) === current;
}
