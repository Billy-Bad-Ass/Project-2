import type Stripe from 'stripe';
import { getItem, type CatalogFile } from '@/lib/catalog';
import { createDownloadToken } from '@/lib/download-token';

/**
 * Works out what a completed Checkout Session entitles the buyer to.
 *
 * Stripe is the only order record this store keeps, so entitlement is derived
 * from the session every time rather than stored anywhere.
 */

export type Entitlement = {
  sku: string;
  name: string;
  files: CatalogFile[];
};

/**
 * Whether Stripe has the money.
 *
 * `status: 'complete'` is NOT that question, and must not be part of it. A
 * delayed-notification method — Klarna, Cash App and Amazon Pay are all enabled
 * on this account — completes the Checkout Session immediately and settles
 * later, so the session is `complete` while `payment_status` is still `unpaid`.
 * Treating complete as paid handed the file over before the money arrived, and
 * `checkout.session.async_payment_failed` then had nothing to take back.
 *
 * `no_payment_required` is a 100%-off promotion code, which the merchant issued
 * deliberately, so it counts.
 */
export function isPaid(session: Stripe.Checkout.Session): boolean {
  return (
    session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
  );
}

/**
 * Whether the money went back.
 *
 * Stripe leaves `payment_status: 'paid'` and `status: 'complete'` untouched by a
 * refund or a dispute, so isPaid() cannot see either. Without this a refunded
 * buyer keeps every link that still has time on it, and can mint fresh ones from
 * the receipt page indefinitely.
 *
 * Reading it needs `expand: ['payment_intent.latest_charge']` on the session.
 * Unexpanded, this returns false — callers that care must expand, and the
 * download route does.
 */
export function isRevoked(session: Stripe.Checkout.Session): boolean {
  const intent = session.payment_intent;
  if (!intent || typeof intent === 'string') return false;

  const charge = intent.latest_charge;
  if (!charge || typeof charge === 'string') return false;

  if (charge.refunded) return true;
  if (charge.disputed) return true;

  // A partial refund still leaves the buyer holding most of their money, and a
  // single guide is not divisible, so any refund at all revokes it.
  return charge.amount_refunded > 0;
}

/** The skus a session paid for — from metadata first, line items as a fallback. */
export function skusFor(session: Stripe.Checkout.Session): string[] {
  const fromMetadata = session.metadata?.sku;
  if (fromMetadata) return [fromMetadata];

  const lineItems = session.line_items?.data ?? [];
  const skus = lineItems
    .map((line) => {
      const product = line.price?.product;
      if (product && typeof product !== 'string' && !('deleted' in product)) {
        return product.metadata?.sku ?? null;
      }
      return line.price?.lookup_key ?? null;
    })
    .filter((s): s is string => Boolean(s));

  return [...new Set(skus)];
}

/** Expands bundles into the individual guides they contain. */
export function entitlementsFor(session: Stripe.Checkout.Session): Entitlement[] {
  const out: Entitlement[] = [];

  for (const sku of skusFor(session)) {
    const item = getItem(sku);
    if (!item) continue;

    if (item.type === 'bundle' && item.includes?.length) {
      for (const memberSku of item.includes) {
        const member = getItem(memberSku);
        if (member) out.push({ sku: member.sku, name: member.name, files: member.files });
      }
    } else {
      out.push({ sku: item.sku, name: item.name, files: item.files });
    }
  }

  // A bundle plus one of its members should not hand out the same file twice.
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.sku) ? false : (seen.add(e.sku), true)));
}

export type SignedFile = CatalogFile & { url: string };
export type SignedEntitlement = Omit<Entitlement, 'files'> & { files: SignedFile[] };

export function signEntitlements(
  session: Stripe.Checkout.Session,
  baseUrl: string,
  ttlSeconds?: number,
): SignedEntitlement[] {
  return entitlementsFor(session).map((entitlement) => ({
    ...entitlement,
    files: entitlement.files.map((file) => ({
      ...file,
      url: `${baseUrl}/api/download?token=${encodeURIComponent(
        createDownloadToken({ sessionId: session.id, file: file.name }, ttlSeconds),
      )}`,
    })),
  }));
}
