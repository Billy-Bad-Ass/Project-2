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

test('isPaid rejects a completed session whose money has not arrived', () => {
  // Klarna, Cash App and Amazon Pay are enabled on this account. They complete
  // the session first and settle afterwards, so this pairing is the normal
  // state of a real order for a few minutes — and it was reading as paid.
  assert.equal(
    ent.isPaid(session({ payment_status: 'unpaid', status: 'complete' })),
    false,
    'complete is not paid',
  );
});

test('isPaid accepts a fully discounted order', () => {
  assert.equal(ent.isPaid(session({ payment_status: 'no_payment_required' })), true);
});

const charged = (charge) =>
  session({ payment_intent: { latest_charge: { amount_refunded: 0, ...charge } } });

test('isRevoked is false for a clean charge', () => {
  assert.equal(ent.isRevoked(charged({ refunded: false, disputed: false })), false);
});

test('isRevoked catches refunds, partial refunds and disputes', () => {
  assert.equal(ent.isRevoked(charged({ refunded: true })), true, 'refunded');
  assert.equal(ent.isRevoked(charged({ amount_refunded: 200 })), true, 'partial refund');
  assert.equal(ent.isRevoked(charged({ disputed: true })), true, 'disputed');
});

test('isRevoked stays false when the charge was not expanded', () => {
  // Callers that do not expand get no opinion rather than a false accusation.
  assert.equal(ent.isRevoked(session()), false, 'no payment_intent');
  assert.equal(ent.isRevoked(session({ payment_intent: 'pi_123' })), false, 'unexpanded intent');
  assert.equal(
    ent.isRevoked(session({ payment_intent: { latest_charge: 'ch_123' } })),
    false,
    'unexpanded charge',
  );
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

/**
 * One Stripe account can serve several businesses — this one also sells a
 * Website Health Check — and the webhook endpoint receives every checkout on
 * the account. A paid session for something else must resolve to nothing, so
 * the delivery paths can recognise it and stay out of the way.
 */
test('a paid session for another product on the same account entitles nothing', () => {
  const foreign = session({
    metadata: {},
    line_items: {
      data: [
        {
          price: {
            lookup_key: null,
            product: { id: 'prod_websiteaudit', metadata: {} },
          },
        },
      ],
    },
  });

  assert.equal(ent.isPaid(foreign), true, 'the payment itself is genuine');
  assert.deepEqual(ent.skusFor(foreign), []);
  assert.deepEqual(ent.entitlementsFor(foreign), []);
  assert.deepEqual(ent.signEntitlements(foreign, 'https://store.example'), []);
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
