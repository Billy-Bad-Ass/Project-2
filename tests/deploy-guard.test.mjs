import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The deploy must never go live listing a PDF the production bucket does not
 * hold — that store takes the money and then 500s on the download. The upload
 * step is skippable on purpose (unchanged PDFs); the verification is not.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');

test('deploy verifies the production bucket before the Worker goes live', () => {
  const verify = workflow.indexOf('scripts/verify-r2-downloads.mjs');
  const deploy = workflow.indexOf('npm run cf:deploy');
  assert.ok(verify !== -1, 'the R2 verification step is missing from deploy.yml');
  assert.ok(deploy !== -1, 'the deploy step is missing from deploy.yml');
  assert.ok(verify < deploy, 'the R2 verification must run before the deploy, not after');
});

test('the bucket verification cannot be skipped', () => {
  // Grab the verification step's block and make sure no `if:` guards it. The
  // upload step above it is conditional; this one is the backstop.
  const step = workflow.split(/\n(?=      - name: )/).find((s) => s.includes('verify-r2-downloads'));
  assert.ok(step, 'verification step not found');
  assert.ok(!/^\s*if:/m.test(step), 'the verification step must not carry an if: condition');
});
