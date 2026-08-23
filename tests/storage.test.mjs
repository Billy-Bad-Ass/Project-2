import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

process.env.DOWNLOAD_SIGNING_SECRET ??= 'test-only-signing-secret-of-sufficient-length';

let storage;
before(async () => {
  storage = await import('../lib/storage.ts');
});

/**
 * These cover the filesystem fallback only. The R2 path needs a Workers
 * runtime with the DOWNLOADS binding attached — it is verified by hitting
 * /api/health under `wrangler dev`, which reports which backend is live.
 */

test('outside Workers the storage layer falls back to the filesystem', async () => {
  assert.equal(await storage.storageBackend(), 'filesystem');
});

test('a missing file resolves to null rather than throwing', async () => {
  assert.equal(await storage.readProductFile('does-not-exist.pdf'), null);
  assert.equal(await storage.productFileExists('does-not-exist.pdf'), false);
});

test('a built PDF reads back with its real size', async (t) => {
  const name = 'espresso-dial-in-card-A4.pdf';
  if (!existsSync(new URL(`../private/downloads/${name}`, import.meta.url))) {
    t.skip('run `npm run pdf:build` first');
    return;
  }

  assert.equal(await storage.productFileExists(name), true);

  const stored = await storage.readProductFile(name);
  assert.ok(stored, 'expected the file to be readable');
  assert.ok(stored.size > 1000, 'expected a real PDF, not an empty file');
  assert.equal(stored.body.byteLength, stored.size);

  // Confirm it is actually a PDF and not, say, an error page written to disk.
  assert.equal(Buffer.from(stored.body.slice(0, 5)).toString('latin1'), '%PDF-');
});

test('path traversal never reaches the filesystem read', async () => {
  // isSafeFileName is the real gate in the route; this asserts the storage
  // layer is not a second way in if that check were ever bypassed.
  const { isSafeFileName } = await import('../lib/download-token.ts');
  for (const bad of ['../../etc/passwd', '../.env', 'a/b.pdf']) {
    assert.equal(isSafeFileName(bad), false);
    assert.equal(await storage.readProductFile(bad), null);
  }
});
