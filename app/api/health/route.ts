import { NextResponse } from 'next/server';
import { items } from '@/lib/catalog';
import { productFileExists, storageBackend } from '@/lib/storage';
import { configuredSiteUrl } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Operational health check.
 *
 * The failure this exists to catch: the Worker deploys fine, the storefront
 * looks fine, checkout takes money — and then every download 500s because the
 * PDFs were never uploaded to R2. That is invisible until a buyer complains,
 * so it gets an endpoint.
 *
 * Reports only names and counts already public in the catalogue. It never
 * serves file contents and never reports secret values.
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

  const ok = missing.length === 0 && Object.values(config).every(Boolean);

  return NextResponse.json(
    {
      ok,
      storage: { backend, expected: expected.length, missing },
      config,
      catalogue: items.map((item) => ({ sku: item.sku, status: item.status })),
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
