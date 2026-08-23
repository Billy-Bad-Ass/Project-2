import { NextRequest, NextResponse } from 'next/server';
import { getItem, isSellable, merchant } from '@/lib/catalog';
import { stripe } from '@/lib/stripe';
import { configuredSiteUrl } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates a Stripe Checkout Session for one catalog item.
 *
 * Prices are looked up by `lookup_key` (the sku) so the Stripe dashboard stays
 * the source of truth for what a buyer is charged. If the catalog has not been
 * synced yet the session falls back to inline price_data, so the store still
 * sells on a fresh account.
 */
export async function POST(request: NextRequest) {
  let sku: unknown;
  try {
    const body = (await request.json()) as { sku?: unknown };
    sku = body?.sku;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (typeof sku !== 'string') {
    return NextResponse.json({ error: 'A `sku` is required.' }, { status: 400 });
  }

  const item = getItem(sku);
  if (!item) {
    return NextResponse.json({ error: `Unknown product: ${sku}` }, { status: 404 });
  }

  // The storefront hides these, but hiding a card is not a guard — the sku is
  // public and this route is the only thing between it and a charge.
  if (!isSellable(item)) {
    console.warn(`[checkout] refused ${item.sku}: status is "${item.status}"`);
    return NextResponse.json(
      { error: 'This guide is not on sale yet. It is being finished.' },
      { status: 409 },
    );
  }

  const origin = request.headers.get('origin')?.trim() || configuredSiteUrl();
  if (!origin) {
    return NextResponse.json(
      { error: 'Cannot determine the site origin. Set NEXT_PUBLIC_SITE_URL.' },
      { status: 500 },
    );
  }

  try {
    const client = stripe();
    const synced = await client.prices.list({ lookup_keys: [item.sku], active: true, limit: 1 });
    const price = synced.data[0];

    const session = await client.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        price
          ? { price: price.id, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: item.currency,
                unit_amount: item.priceMinor,
                product_data: {
                  name: item.name,
                  description: item.blurb.slice(0, 500),
                  metadata: { sku: item.sku },
                },
              },
            },
      ],
      // Digital goods: no shipping, but we need an email to deliver to.
      customer_creation: 'always',
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
      automatic_tax: { enabled: String(process.env.STRIPE_AUTOMATIC_TAX) === 'true' },
      metadata: { sku: item.sku, files: item.files.map((f) => f.name).join(',') },
      payment_intent_data: {
        description: `${item.name} — ${merchant.name}`,
        metadata: { sku: item.sku },
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/products/${item.sku}?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, usedSyncedPrice: Boolean(price) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[checkout] failed', message);
    return NextResponse.json({ error: `Could not start checkout: ${message}` }, { status: 500 });
  }
}
