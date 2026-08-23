import { NextResponse } from 'next/server';
import { items, listed } from '@/lib/catalog';
import { productFileExists, storageBackend } from '@/lib/storage';
import { configuredSiteUrl } from '@/lib/site';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Operational health check.
 *
 * The failures this exists to catch are the silent ones — the store looks
 * perfect, takes money, and then cannot deliver:
 *
 *   - the PDFs were never uploaded to R2
 *   - a secret is missing from the Worker
 *   - the Stripe key is present but does not authenticate, or belongs to a
 *     different account than the one holding the products
 *
 * Reports only booleans, counts and names already public in the catalogue.
 * It never returns file contents, secret values, or the account identifier.
 */
export async function GET() {
  const expected = [...new Set(items.flatMap((item) => item.files.map((f) => f.name)))].sort();

  const backend = await storageBackend();
  const present = await Promise.all(expected.map((name) => productFileExists(name)));
  const missing = expected.filter((_, index) => !present[index]);

  const config = {
    siteUrl: Boolean(configuredSiteUrl()),
    stripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    signingSecret: (process.env.DOWNLOAD_SIGNING_SECRET ?? '').length >= 32,
  };

  const stripeStatus = await checkStripe();

  const warnings: string[] = [];
  if (stripeStatus.reachable && stripeStatus.pricesResolved === 0 && stripeStatus.pricesExpected > 0) {
    warnings.push(
      'The Stripe key authenticates but none of the catalogue prices exist on that ' +
        'account. It most likely belongs to a different account (a sandbox?) than the ' +
        'one the products were created in. Checkout would fall back to inline prices ' +
        'and the webhook would never fire.',
    );
  } else if (
    stripeStatus.reachable &&
    stripeStatus.pricesResolved < stripeStatus.pricesExpected
  ) {
    warnings.push(
      `Only ${stripeStatus.pricesResolved} of ${stripeStatus.pricesExpected} catalogue ` +
        'prices exist in Stripe. Run `npm run stripe:sync` to reconcile.',
    );
  }
  if (backend === 'filesystem') {
    warnings.push('Serving files from disk, not R2 — the R2 binding is not attached.');
  }

  const ok =
    missing.length === 0 && Object.values(config).every(Boolean) && stripeStatus.reachable;

  return NextResponse.json(
    {
      ok,
      storage: { backend, expected: expected.length, missing },
      config,
      stripe: stripeStatus,
      warnings,
      catalogue: items.map((item) => ({
        sku: item.sku,
        status: item.status,
        onSale: listed.some((l) => l.sku === item.sku),
      })),
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}

type StripeStatus = {
  reachable: boolean;
  mode?: 'test' | 'live';
  pricesResolved: number;
  pricesExpected: number;
  error?: string;
};

/**
 * Proves the key works and points at the right account, without revealing which
 * account that is. Resolving the catalogue's lookup_keys is the real test: a
 * valid key for the wrong account authenticates fine and finds nothing.
 */
async function checkStripe(): Promise<StripeStatus> {
  // Only what is actually on sale. A product held back for a content gap has
  // its Stripe price archived on purpose, and counting it here would report a
  // deliberate state as a fault.
  const skus = listed.map((item) => item.sku);

  if (!process.env.STRIPE_SECRET_KEY) {
    return { reachable: false, pricesResolved: 0, pricesExpected: skus.length, error: 'no key set' };
  }

  try {
    const client = stripe();
    const prices = await client.prices.list({ lookup_keys: skus, active: true, limit: 100 });

    return {
      reachable: true,
      mode: process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test',
      pricesResolved: prices.data.length,
      pricesExpected: skus.length,
    };
  } catch (error) {
    // Surface the failure type, never the key or the raw request.
    const message = error instanceof Error ? error.message : 'unknown error';
    return {
      reachable: false,
      pricesResolved: 0,
      pricesExpected: skus.length,
      error: message.slice(0, 200),
    };
  }
}
