#!/usr/bin/env node
/**
 * Validates .claude/workflows/*.mjs.
 *
 * Workflow scripts run as the body of an async function with `agent`, `parallel`,
 * `pipeline`, `phase`, `log`, `args`, `budget` and `workflow` injected as globals —
 * so a top-level `return` is legal and `node --check` cannot be used on them.
 * This wraps each script in that shape before parsing, and enforces the runtime
 * restrictions that would otherwise only surface mid-run.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.claude', 'workflows');

/** Not available inside a workflow — they would break deterministic resume. */
const BANNED = [
  { pattern: /\bfrom\s+['"]node:/, message: "imports a node: builtin (no filesystem or Node API access)" },
  { pattern: /\brequire\s*\(/, message: 'uses require() (scripts are ESM)' },
  { pattern: /\bDate\.now\s*\(/, message: 'calls Date.now() (throws at runtime)' },
  { pattern: /\bMath\.random\s*\(/, message: 'calls Math.random() (throws at runtime)' },
  { pattern: /new Date\s*\(\s*\)/, message: 'calls argless new Date() (throws at runtime)' },
  { pattern: /:\s*(string|number|boolean)\b(?![^\n]*['"])/, message: 'looks like a TypeScript annotation (scripts are plain JS)' },
];

let failures = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
  const source = readFileSync(join(dir, file), 'utf8');
  const problems = [];

  // meta must be a leading, literal export the runner can read without executing.
  if (!/^export const meta = \{/m.test(source)) {
    problems.push('missing `export const meta = { ... }`');
  }
  for (const key of ['name', 'description']) {
    if (!new RegExp(`\\b${key}:`).test(source.slice(0, source.indexOf('};') + 2))) {
      problems.push(`meta is missing \`${key}\``);
    }
  }

  for (const { pattern, message } of BANNED) {
    if (pattern.test(source)) problems.push(message);
  }

  // Phase titles declared in meta should match the phase() calls.
  const declared = [...source.matchAll(/\{\s*title:\s*'([^']+)'/g)].map((m) => m[1]);
  const called = [...source.matchAll(/\bphase\('([^']+)'\)/g)].map((m) => m[1]);
  for (const title of called) {
    if (!declared.includes(title)) problems.push(`phase('${title}') is not declared in meta.phases`);
  }

  // Parse as the async function body the runtime actually evaluates.
  const stripped = source.replace(/^export const meta = /m, 'const meta = ');
  try {
    new Function(
      'agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow',
      `return (async () => {\n${stripped}\n})`,
    );
  } catch (error) {
    problems.push(`does not parse: ${error.message}`);
  }

  if (problems.length) {
    failures++;
    console.log(`✗ ${file}`);
    for (const problem of problems) console.log(`    ${problem}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

if (failures) {
  console.error(`\n${failures} workflow(s) failed validation`);
  process.exit(1);
}
console.log('\nall workflows valid');
