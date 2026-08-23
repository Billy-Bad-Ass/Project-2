import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DOWNLOAD_SIGNING_SECRET ??= 'test-only-signing-secret-of-sufficient-length';

let ent;
let catalog;
before(async () => {
  ent = await import('../lib/entitlements.ts');
  catalog = await import('../lib/catalog.ts');
});

const session = (overrides = {}) => ({
  id: 'cs_test_abc',
  payment_status: 'paid',
  status: 'complete',
  metadata: {},
  ...overrides,
});

test('isPaid accepts a paid session and rejects an unpaid one', () => {
  assert.equal(ent.isPaid(session()), true);
  assert.equal(ent.isPaid(session({ payment_status: 'unpaid', status: 'open' })), false);
});

test('skusFor prefers session metadata', () => {
  const skus = ent.skusFor(session({ metadata: { sku: 'espresso-dial-in-card' } }));
  assert.deepEqual(skus, ['espresso-dial-in-card']);
});

test('skusFor falls back to the price lookup_key on line items', () => {
  const skus = ent.skusFor(
    session({
      line_items: { data: [{ price: { lookup_key: 'keyboard-sound-mod-chart', product: 'prod_x' } }] },
    }),
  );
  assert.deepEqual(skus, ['keyboard-sound-mod-chart']);
});

test('skusFor reads the sku from expanded product metadata', () => {
  const skus = ent.skusFor(
    session({
      line_items: {
        data: [{ price: { product: { id: 'prod_x', metadata: { sku: 'espresso-dial-in-card' } } } }],
      },
    }),
  );
  assert.deepEqual(skus, ['espresso-dial-in-card']);
});

test('a single purchase entitles exactly that guide, both paper sizes', () => {
  const result = ent.entitlementsFor(session({ metadata: { sku: 'espresso-dial-in-card' } }));

  assert.equal(result.length, 1);
  assert.equal(result[0].sku, 'espresso-dial-in-card');
  assert.deepEqual(
    result[0].files.map((f) => f.name).sort(),
    ['espresso-dial-in-card-A4.pdf', 'espresso-dial-in-card-Letter.pdf'],
  );
});

test('a bundle expands into every guide it contains', (t) => {
  const bundle = catalog.bundles[0];
  if (!bundle) {
    t.skip('no bundles in the catalogue — expansion logic kept for when one returns');
    return;
  }

  const result = ent.entitlementsFor(session({ metadata: { sku: bundle.sku } }));

  assert.equal(result.length, bundle.includes.length);
  assert.deepEqual(result.map((r) => r.sku).sort(), [...bundle.includes].sort());
  // two files per guide, none repeated
  const names = result.flatMap((r) => r.files.map((f) => f.name));
  assert.equal(names.length, bundle.includes.length * 2);
  assert.equal(new Set(names).size, names.length);
});

test('an unknown sku entitles nothing', () => {
  assert.deepEqual(ent.entitlementsFor(session({ metadata: { sku: 'not-a-product' } })), []);
});

test('signEntitlements mints one verifiable link per file', async () => {
  const { verifyDownloadToken } = await import('../lib/download-token.ts');
  const signed = ent.signEntitlements(
    session({ metadata: { sku: 'keyboard-sound-mod-chart' } }),
    'https://store.example',
  );

  const files = signed.flatMap((s) => s.files);
  assert.equal(files.length, 2);

  for (const file of files) {
    assert.ok(file.url.startsWith('https://store.example/api/download?token='));
    const token = decodeURIComponent(new URL(file.url).searchParams.get('token'));
    const verified = verifyDownloadToken(token);
    assert.equal(verified.ok, true);
    assert.equal(verified.claim.sessionId, 'cs_test_abc');
    assert.equal(verified.claim.file, file.name);
  }
});
