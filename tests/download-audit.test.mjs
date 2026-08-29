import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { auditBucket } from '../scripts/lib/download-audit.mjs';
import { sourceDigest } from '../scripts/lib/source-digest.mjs';

const catalogPath = new URL('../catalog/generated.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

/** A bucket holding exactly what the catalogue currently expects. */
const currentBucket = () => ({
  objects: new Map(catalog.items.flatMap((i) => i.files.map((f) => [f.name, 20_000]))),
  manifest: {
    digests: Object.fromEntries(
      catalog.items.flatMap((i) => i.files.map((f) => [f.name, f.sourceDigest])),
    ),
  },
});

test('every catalogue file carries a source digest', () => {
  for (const item of catalog.items) {
    for (const file of item.files) {
      assert.match(file.sourceDigest ?? '', /^[0-9a-f]{64}$/, `${file.name} has no usable digest`);
    }
  }
});

test('a bucket matching the catalogue passes', () => {
  const audit = auditBucket({ items: catalog.items, ...currentBucket() });
  assert.equal(audit.failures, 0);
  assert.equal(audit.unverified, false);
  assert.ok(audit.results.some((r) => r.state === 'current'));
});

/**
 * The failure this whole check exists for: a note is corrected, the catalogue
 * is rebuilt and committed, but `npm run pdf:upload` never runs. Every earlier
 * check still passes — the file is present, the right size, and the page count
 * was verified against the *local* build, not the bucket's copy.
 */
test('a bucket left holding the previous build fails the deploy', () => {
  const { objects, manifest } = currentBucket();
  const sold = catalog.items.find((i) => i.status === 'ready');
  const stalePath = sold.files[0].name;
  manifest.digests[stalePath] = 'a'.repeat(64);

  const audit = auditBucket({ items: catalog.items, objects, manifest });
  assert.equal(audit.stale, 1);
  assert.equal(audit.failures, 1);
  assert.equal(audit.results.find((r) => r.file === stalePath).state, 'stale');
});

test('a present file that no upload recorded fails too', () => {
  const { objects, manifest } = currentBucket();
  const sold = catalog.items.find((i) => i.status === 'ready');
  delete manifest.digests[sold.files[0].name];

  const audit = auditBucket({ items: catalog.items, objects, manifest });
  assert.equal(audit.stale, 1);
  assert.equal(audit.failures, 1);
});

test('a bucket with no manifest is reported unverified, not silently accepted', () => {
  const { objects } = currentBucket();
  const audit = auditBucket({ items: catalog.items, objects, manifest: null });
  assert.equal(audit.failures, 0);
  assert.equal(audit.unverified, true);
});

test('a missing file still fails, manifest or not', () => {
  const { objects, manifest } = currentBucket();
  const sold = catalog.items.find((i) => i.status === 'ready');
  objects.delete(sold.files[0].name);

  const audit = auditBucket({ items: catalog.items, objects, manifest });
  assert.equal(audit.missing, 1);
  assert.equal(audit.failures, 1);
});

/** Unchanged from before: an unsellable SKU cannot strand a purchase. */
test('a stale file belonging to an unsellable item does not block the deploy', () => {
  const gapped = catalog.items.find((i) => i.status !== 'ready');
  if (!gapped) return;

  const { objects, manifest } = currentBucket();
  manifest.digests[gapped.files[0].name] = 'b'.repeat(64);

  const audit = auditBucket({ items: catalog.items, objects, manifest });
  assert.equal(audit.failures, 0);
});

test('digests separate the two paper sizes', () => {
  const item = catalog.items[0];
  const a4 = item.files.find((f) => f.size === 'A4');
  const letter = item.files.find((f) => f.size === 'Letter');
  assert.notEqual(a4.sourceDigest, letter.sourceDigest);
});

/**
 * Re-pricing a guide must not invalidate a PDF whose pages are unchanged —
 * otherwise every price experiment would demand a re-upload of the whole shop.
 */
test('commercial metadata is outside the digest, page content is inside', () => {
  const item = catalog.items[0];
  const merchant = catalog.merchant.name;
  const base = sourceDigest(item, 'A4', merchant);

  assert.equal(sourceDigest({ ...item, priceMinor: 1_995, badge: 'Sale' }, 'A4', merchant), base);
  assert.notEqual(sourceDigest({ ...item, pages: [...item.pages, 'extra'] }, 'A4', merchant), base);
  assert.notEqual(sourceDigest({ ...item, name: 'Renamed' }, 'A4', merchant), base);
  assert.notEqual(sourceDigest(item, 'Letter', merchant), base);
});

/**
 * The end-to-end version of the stale test: edit a note, rebuild, and confirm
 * the digest the deploy compares actually moved. Restores the note afterwards.
 */
test('editing a product note changes the digest the deploy compares', () => {
  const sold = catalog.items.find((i) => i.status === 'ready');
  const notePath = new URL(`../content/products/${sold.sourceNote}`, import.meta.url);
  const original = readFileSync(notePath, 'utf8');
  const before = sold.files[0].sourceDigest;
  const catalogBefore = readFileSync(catalogPath, 'utf8');

  try {
    writeFileSync(notePath, original.replace(/^\| /m, '| 93°C — '));
    execFileSync('node', ['scripts/build-catalog.mjs'], {
      cwd: new URL('..', import.meta.url).pathname,
      stdio: 'ignore',
    });

    const rebuilt = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const after = rebuilt.items.find((i) => i.sku === sold.sku).files[0].sourceDigest;
    assert.notEqual(after, before, 'an edited note produced an identical digest');
  } finally {
    writeFileSync(notePath, original);
    writeFileSync(catalogPath, catalogBefore);
  }
});
