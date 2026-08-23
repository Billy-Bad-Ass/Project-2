import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DOWNLOAD_SIGNING_SECRET ??= 'test-only-signing-secret-of-sufficient-length';

const meta = JSON.parse(readFileSync(new URL('../catalog/products.json', import.meta.url), 'utf8'));

let catalog;
before(async () => {
  catalog = await import('../lib/catalog.ts');
});

test('every sku in products.json made it into the generated catalog', () => {
  const declared = [...meta.products, ...meta.bundles].map((p) => p.sku);
  const generated = catalog.items.map((i) => i.sku);
  assert.deepEqual(generated.slice().sort(), declared.slice().sort());
});

test('generated prices match the commercial metadata exactly', () => {
  for (const entry of [...meta.products, ...meta.bundles]) {
    const item = catalog.getItem(entry.sku);
    assert.equal(item.priceMinor, entry.priceMinor, `price drift on ${entry.sku}`);
    assert.equal(item.currency, meta.currency);
  }
});

test('every item carries listing copy pulled from its note', () => {
  for (const item of catalog.items) {
    assert.ok(item.name.length > 0, `${item.sku} has no name`);
    assert.ok(item.description.length > 50, `${item.sku} has a suspiciously short description`);
    assert.ok(item.tags.length > 0, `${item.sku} has no tags`);
    assert.ok(item.tags.length <= 13, `${item.sku} has more than 13 tags`);
  }
});

test('marketplace tags stay within the 20-character limit', () => {
  for (const item of catalog.items) {
    for (const tag of item.tags) {
      assert.ok(tag.length <= 20, `${item.sku}: tag "${tag}" is ${tag.length} characters`);
    }
  }
});

test('every item ships an A4 and a US Letter file, uniquely named', () => {
  const seen = new Set();
  for (const item of catalog.items) {
    const sizes = item.files.map((f) => f.size);
    assert.ok(sizes.includes('A4'), `${item.sku} is missing an A4 file`);
    assert.ok(sizes.includes('Letter'), `${item.sku} is missing a US Letter file`);

    if (item.type === 'single') {
      for (const file of item.files) {
        assert.equal(seen.has(file.name), false, `duplicate file name ${file.name}`);
        seen.add(file.name);
      }
    }
  }
});

// There are deliberately no bundles right now — espresso, keyboards and
// miniatures do not share a buyer. This guards the rule for when one returns.
test('any bundle costs less than its parts and states the saving correctly', () => {
  for (const bundle of catalog.bundles) {
    const parts = bundle.includes.map((sku) => catalog.getItem(sku));
    const full = parts.reduce((sum, p) => sum + p.priceMinor, 0);

    assert.ok(bundle.priceMinor < full, `${bundle.sku} is not cheaper than its parts`);
    assert.equal(bundle.savingMinor, full - bundle.priceMinor);
    assert.equal(
      bundle.pageCount,
      parts.reduce((n, p) => n + p.pageCount, 0),
    );
  }
});

test('formatPrice renders each currency in its own locale', () => {
  // 'en-GB' would render USD as "US$9.45", which is why the locale follows the
  // currency rather than being fixed.
  assert.equal(catalog.formatPrice(945, 'usd'), '$9.45');
  assert.equal(catalog.formatPrice(900, 'usd'), '$9');
  assert.equal(catalog.formatPrice(500, 'gbp'), '£5');
  assert.equal(catalog.formatPrice(650, 'gbp'), '£6.50');
});

test('every product carries the catalogue currency', () => {
  for (const item of catalog.items) {
    assert.equal(item.currency, catalog.currency);
  }
});

/**
 * A documented content gap must block the sale, not just warn about it. The
 * miniature guide's listing promises eight recipes its file does not contain.
 */
test('a product with a content gap is not sellable and not listed', () => {
  const gapped = catalog.items.filter((item) => item.status !== 'ready');

  for (const item of gapped) {
    assert.equal(catalog.isSellable(item), false, `${item.sku} should not be sellable`);
    assert.equal(
      catalog.listed.some((listed) => listed.sku === item.sku),
      false,
      `${item.sku} should not appear in the shop`,
    );
  }
});

test('everything listed is sellable and has its files', () => {
  assert.ok(catalog.listed.length > 0, 'the shop has nothing to sell');

  for (const item of catalog.listed) {
    assert.equal(item.status, 'ready');
    assert.equal(item.contentGap, null, `${item.sku} is listed but has a content gap`);
    assert.ok(item.files.length >= 2, `${item.sku} is missing a paper size`);
  }
});

test('page counts are positive and match the parsed page list', () => {
  for (const item of catalog.singles) {
    assert.ok(item.pageCount > 0, `${item.sku} has no pages`);
    assert.equal(item.pages.length, item.pageCount);
  }
});
