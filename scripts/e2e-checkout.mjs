/**
 * End-to-end proof that a customer can pay and receive the file.
 *
 * The unit tests cover each gate in isolation against fabricated Stripe
 * objects. This covers the one thing they cannot: that a real payment, on a
 * real Stripe account, through the real hosted Checkout page, ends with the
 * buyer holding the PDF they paid for — and stops working when refunded.
 *
 * It runs against a store started on localhost, so nothing here touches the
 * deployed Worker.
 *
 * Test mode only. See assertTestMode(): a live key aborts the run before any
 * network call, because everything below creates real charges and a real
 * refund on whatever account the key belongs to.
 *
 *   node scripts/e2e-checkout.mjs --origin http://127.0.0.1:3000 --sku espresso-dial-in-card
 */
import Stripe from 'stripe';
import { chromium } from 'playwright';

// Parsed one token at a time rather than in pairs: `--keep-paid` carries no
// value, and a pairwise loop would swallow whatever followed it as its value
// and then misread the rest of the line.
const argv = process.argv.slice(2);
const args = new Map();
const flags = new Set();
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const name = argv[i].slice(2);
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(name, next);
    i++;
  } else {
    flags.add(name);
  }
}
const ORIGIN = args.get('origin') ?? 'http://127.0.0.1:3000';
const SKU = args.get('sku') ?? 'espresso-dial-in-card';
const KEEP = flags.has('keep-paid');

const steps = [];
let failed = false;

function step(name, detail = '') {
  steps.push({ name, detail, ok: true });
  console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail) {
  steps.push({ name, detail, ok: false });
  failed = true;
  console.error(`  FAIL  ${name} — ${detail}`);
}

/**
 * The one guard that matters. A live key here would charge a real card and
 * then refund it, on a production account, from CI.
 *
 * Checks the prefix rather than calling the API so it fails before the first
 * request, and never prints the value.
 */
function assertTestMode(key) {
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) {
    throw new Error('refusing to run: STRIPE_SECRET_KEY is a LIVE key. This test creates real charges.');
  }
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    throw new Error('refusing to run: STRIPE_SECRET_KEY is not recognisably a test key.');
  }
}

const key = process.env.STRIPE_SECRET_KEY;
assertTestMode(key);
const stripe = new Stripe(key, { apiVersion: '2025-09-30.clover' });

console.log(`\ne2e checkout — ${ORIGIN} — sku ${SKU}\n`);

// -- 1. the store creates a Checkout Session -------------------------------
const checkoutRes = await fetch(`${ORIGIN}/api/checkout`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sku: SKU }),
});
if (!checkoutRes.ok) {
  throw new Error(`POST /api/checkout returned ${checkoutRes.status}: ${(await checkoutRes.text()).slice(0, 300)}`);
}
const { url: checkoutUrl, usedSyncedPrice } = await checkoutRes.json();
if (!checkoutUrl) throw new Error('/api/checkout returned no url');
step('store created a Checkout Session', usedSyncedPrice ? 'using the synced Stripe price' : 'using inline price_data (price not synced)');

if (!usedSyncedPrice) {
  bad(
    'checkout used inline price_data',
    'the catalogue lookup_key did not resolve on this account, so the dashboard price is not what buyers pay. Run `npm run stripe:sync -- --apply`.',
  );
}

// -- 2. pay it on Stripe's hosted page -------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });

await page.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
await page.getByPlaceholder('MM / YY').fill('12 / 34');
await page.getByPlaceholder('CVC').fill('123');
const name = page.getByPlaceholder('Full name on card');
if (await name.count()) await name.fill('BBA Test Buyer');
const postal = page.getByPlaceholder('12345');
if (await postal.count()) await postal.fill('12345');

await page.getByTestId('hosted-payment-submit-button').click();
await page.waitForURL(/\/success\?session_id=/, { timeout: 90_000 });

const successUrl = new URL(page.url());
const sessionId = successUrl.searchParams.get('session_id');
step('paid with 4242 on the hosted Checkout page', `session ${sessionId}`);

// -- 3. Stripe agrees it is paid -------------------------------------------
const session = await stripe.checkout.sessions.retrieve(sessionId);
if (session.payment_status !== 'paid') {
  bad('Stripe payment_status', `expected "paid", got "${session.payment_status}"`);
} else {
  step('Stripe reports payment_status=paid', `${session.amount_total} ${session.currency}`);
}

// -- 4. the success page hands over real download links --------------------
const successHtml = await page.content();
const tokens = [...successHtml.matchAll(/\/api\/download\?token=([^"&]+)&(?:amp;)?file=([^"&]+)/g)];
if (tokens.length === 0) {
  bad('success page download links', 'no /api/download links rendered — the buyer has paid and has nothing');
} else {
  step('success page rendered download links', `${tokens.length} file(s)`);
}
await browser.close();

// -- 5. a link actually streams a PDF --------------------------------------
let firstLink = null;
if (tokens.length) {
  const [, token, file] = tokens[0];
  firstLink = `${ORIGIN}/api/download?token=${token}&file=${file}`;
  const dl = await fetch(firstLink);
  const buf = Buffer.from(await dl.arrayBuffer());
  const magic = buf.subarray(0, 4).toString('latin1');
  if (dl.status !== 200) {
    bad('download returned non-200', `${dl.status}: ${buf.subarray(0, 200).toString('utf8')}`);
  } else if (magic !== '%PDF') {
    bad('download is not a PDF', `first bytes were ${JSON.stringify(magic)}`);
  } else if (buf.length < 20_000) {
    bad('download is suspiciously small', `${buf.length} bytes`);
  } else {
    step('download streamed a real PDF', `${decodeURIComponent(file)}, ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

// -- 6. a refund closes it again -------------------------------------------
// Gate 3 in app/api/download/route.ts. It is checked live against Stripe on
// every request rather than stored, so a refund must revoke a link that
// worked a moment ago.
if (firstLink && !KEEP && session.payment_intent) {
  await stripe.refunds.create({ payment_intent: String(session.payment_intent) });
  // The refund has to be visible on the charge the download route expands.
  let revoked = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(firstLink);
    if (res.status === 403) { revoked = true; break; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (revoked) step('refunding the order revoked the download', '403 as expected');
  else bad('refund did not revoke the download', 'the link still served the file after a full refund');
}

console.log('');
const passed = steps.filter((s) => s.ok).length;
console.log(`${passed}/${steps.length} checks passed`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  const rows = steps.map((s) => `| ${s.ok ? '✅' : '❌'} | ${s.name} | ${s.detail} |`).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Checkout end-to-end\n\n\`${SKU}\` on test mode.\n\n| | Check | Detail |\n| --- | --- | --- |\n${rows}\n\n**${passed}/${steps.length} passed**\n\n`,
  );
}

process.exit(failed ? 1 : 0);
