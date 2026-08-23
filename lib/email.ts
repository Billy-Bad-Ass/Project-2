import type { SignedEntitlement } from '@/lib/entitlements';
import { merchant } from '@/lib/catalog';

/**
 * Delivery email. Uses Resend when RESEND_API_KEY is set and otherwise logs
 * what it would have sent — the store is fully functional without it, because
 * Stripe's own receipt links back to the success page where the same download
 * links are shown.
 */

export type SendResult = { sent: boolean; reason?: string };

export async function sendDownloadEmail(
  to: string,
  entitlements: SignedEntitlement[],
  orderRef: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DELIVERY_FROM_EMAIL;

  if (!apiKey || !from) {
    console.info(
      `[email] skipped (RESEND_API_KEY/DELIVERY_FROM_EMAIL unset) — would deliver ` +
        `${entitlements.length} product(s) to ${to} for ${orderRef}`,
    );
    return { sent: false, reason: 'not-configured' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Your download${entitlements.length > 1 ? 's' : ''} from ${merchant.name}`,
      html: renderHtml(entitlements, orderRef),
      text: renderText(entitlements, orderRef),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[email] resend rejected the send (${response.status}): ${detail}`);
    return { sent: false, reason: `resend-${response.status}` };
  }

  return { sent: true };
}

function renderText(entitlements: SignedEntitlement[], orderRef: string): string {
  const lines = [`Thanks for your order.`, ''];
  for (const item of entitlements) {
    lines.push(item.name);
    for (const file of item.files) lines.push(`  ${file.label}: ${file.url}`);
    lines.push('');
  }
  lines.push(
    'These links are valid for 72 hours. If one expires, reply to this email and we will send fresh ones.',
    '',
    `Order reference: ${orderRef}`,
    `${merchant.name} — ${merchant.supportEmail}`,
  );
  return lines.join('\n');
}

function renderHtml(entitlements: SignedEntitlement[], orderRef: string): string {
  const blocks = entitlements
    .map(
      (item) => `
        <tr><td style="padding:16px 0;border-bottom:1px solid #E5DFD5;">
          <p style="margin:0 0 8px;font:700 16px/1.3 Helvetica,Arial,sans-serif;color:#14110F;">
            ${escape(item.name)}
          </p>
          ${item.files
            .map(
              (file) => `<a href="${escape(file.url)}"
                 style="display:inline-block;margin:0 8px 4px 0;padding:8px 14px;
                        background:#C2410C;color:#fff;border-radius:6px;
                        font:600 13px Helvetica,Arial,sans-serif;text-decoration:none;">
                 Download ${escape(file.label)}</a>`,
            )
            .join('')}
        </td></tr>`,
    )
    .join('');

  return `<!doctype html><html><body style="margin:0;background:#FBF7F0;padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;
           background:#fff;border-radius:12px;padding:28px;">
      <tr><td>
        <p style="margin:0 0 4px;font:700 20px Helvetica,Arial,sans-serif;color:#14110F;">
          Thanks for your order</p>
        <p style="margin:0 0 8px;font:400 14px/1.5 Helvetica,Arial,sans-serif;color:#6B6259;">
          Every guide ships as two PDFs — A4 and US Letter, same content.</p>
      </td></tr>
      ${blocks}
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 6px;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:#6B6259;">
          These links are valid for 72 hours. If one expires, reply to this email
          and we will send fresh ones.</p>
        <p style="margin:0;font:400 12px Helvetica,Arial,sans-serif;color:#A79C90;">
          Order ${escape(orderRef)} · ${escape(merchant.name)}</p>
      </td></tr>
    </table></body></html>`;
}

const escape = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
