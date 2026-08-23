import Link from 'next/link';
import type { Metadata } from 'next';
import { stripe } from '@/lib/stripe';
import { signEntitlements, isPaid } from '@/lib/entitlements';
import { merchant } from '@/lib/catalog';
import { configuredSiteUrl } from '@/lib/site';
import { Icon } from '@/app/components/Icon';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your download', robots: { index: false } };

type Params = { searchParams: Promise<{ session_id?: string }> };

/**
 * The receipt page. Verifies the session with Stripe and mints signed,
 * 72-hour download links — the same links the delivery email carries.
 */
export default async function SuccessPage({ searchParams }: Params) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <Problem title="No order to show">
        <p>This page needs a checkout session. If you have just paid, use the link in your receipt email.</p>
      </Problem>
    );
  }

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price.product'],
    });
  } catch {
    return (
      <Problem title="We could not find that order">
        <p>
          The reference may be wrong or the order may belong to a different store.
          Email <a href={`mailto:${merchant.supportEmail}`}>{merchant.supportEmail}</a> and
          we will sort it out.
        </p>
      </Problem>
    );
  }

  if (!isPaid(session)) {
    return (
      <Problem title="This payment has not completed">
        <p>
          Stripe reports this order as <strong>{session.payment_status}</strong>. Some
          payment methods take a few minutes. Refresh shortly, or check your email —
          we send the links the moment it clears.
        </p>
      </Problem>
    );
  }

  const baseUrl = configuredSiteUrl();
  const entitlements = signEntitlements(session, baseUrl);
  const email = session.customer_details?.email;

  return (
    <div className="wrap receipt">
      <div className="notice notice--ok">
        <Icon name="check" size={16} />
        <p>
          <strong>Payment received.</strong>
          {email ? ` A copy of these links is on its way to ${email}.` : ''}
        </p>
      </div>

      <h1>Your download{entitlements.length > 1 ? 's' : ''}</h1>
      <p style={{ color: 'var(--muted)' }}>
        Each guide comes as two PDFs — A4 and US Letter, same content. Grab whichever
        your printer uses, or both.
      </p>

      <ul className="receipt__files">
        {entitlements.map((entitlement) => (
          <li key={entitlement.sku}>
            <h3>{entitlement.name}</h3>
            <div className="receipt__links">
              {entitlement.files.map((file) => (
                <a key={file.name} className="btn btn--primary" href={file.url}>
                  <Icon name="download" size={14} />
                  {file.label}
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="notice">
        <Icon name="circle-exclamation" size={16} />
        <p>
          These links expire in 72 hours. Save the files somewhere you will find them
          again — and if a link does expire, email{' '}
          <a href={`mailto:${merchant.supportEmail}`}>{merchant.supportEmail}</a> with
          your order reference <code>{session.id}</code> and we will send fresh ones.
        </p>
      </div>

      <p style={{ marginTop: 28 }}>
        <Link href="/#guides">Back to the guides</Link>
      </p>
    </div>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="wrap receipt">
      <h1>{title}</h1>
      <div className="notice">
        <Icon name="circle-exclamation" size={16} />
        <div>{children}</div>
      </div>
      <p><Link href="/#guides">Back to the guides</Link></p>
    </div>
  );
}
