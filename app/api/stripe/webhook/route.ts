import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { signEntitlements, isPaid } from '@/lib/entitlements';
import { sendDownloadEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook. The success page already shows the buyer their links, so this
 * exists to deliver them by email too and to give the business a durable log of
 * what was sold.
 *
 * Local testing:  npm run stripe:listen
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  // Signature verification needs the exact bytes Stripe signed.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    // Async variant is required on Cloudflare Workers: signature verification
    // goes through SubtleCrypto, which has no synchronous form. It works
    // identically on Node, so there is no reason to branch on the runtime.
    event = await stripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`[webhook] signature verification failed: ${message}`);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCompletedSession(event.data.object);
        break;

      case 'checkout.session.async_payment_failed':
        console.warn(`[webhook] delayed payment failed for ${event.data.object.id}`);
        break;

      case 'charge.refunded':
        // Links stay signed but the download route re-checks Stripe, so a
        // refunded session stops working on its own. Logged for the record.
        console.info(`[webhook] refund recorded for ${event.data.object.id}`);
        break;

      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`[webhook] handler for ${event.type} failed: ${message}`);
    // 500 tells Stripe to retry, which is what we want for a transient failure.
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCompletedSession(partial: Stripe.Checkout.Session) {
  const session = await stripe().checkout.sessions.retrieve(partial.id, {
    expand: ['line_items.data.price.product'],
  });

  if (!isPaid(session)) {
    console.info(`[webhook] ${session.id} is not paid yet (${session.payment_status})`);
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const entitlements = signEntitlements(session, baseUrl);
  const email = session.customer_details?.email ?? session.customer_email;

  console.info(
    `[webhook] paid ${session.id} · ${(session.amount_total ?? 0) / 100} ` +
      `${(session.currency ?? '').toUpperCase()} · ${entitlements.map((e) => e.sku).join(', ')}`,
  );

  if (!email) {
    console.warn(`[webhook] ${session.id} has no email address; skipping delivery email`);
    return;
  }
  if (!baseUrl) {
    console.warn('[webhook] NEXT_PUBLIC_SITE_URL is unset; download links would be relative');
    return;
  }

  await sendDownloadEmail(email, entitlements, session.id);
}
