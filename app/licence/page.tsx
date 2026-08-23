import type { Metadata } from 'next';
import { merchant } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Licence & refunds',
  description: 'What you may do with the files, and how refunds work on digital downloads.',
};

export default function LicencePage() {
  return (
    <div className="wrap prose">
      <h1>Licence &amp; refunds</h1>

      <h2>What you may do</h2>
      <ul>
        <li>Print as many copies as you like, for as long as you like, for your own use.</li>
        <li>Photocopy the log sheets and blank templates — several are designed for it.</li>
        <li>Pin them up at home, in a shared workshop, or at your desk at work.</li>
        <li>Write on them, laminate them, mark them up.</li>
      </ul>

      <h2>What you may not do</h2>
      <ul>
        <li>Resell or redistribute the files, free or paid.</li>
        <li>Upload them to a file-sharing site, Discord, or a public drive.</li>
        <li>Sell printed copies.</li>
        <li>Republish the content as your own, in whole or in part.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        These are digital files delivered immediately, so the usual right to cancel does
        not apply once the download has started. That said — if a file is broken, will
        not open, or is plainly not what the listing described, email{' '}
        <a href={`mailto:${merchant.supportEmail}`}>{merchant.supportEmail}</a> and you
        will get a refund. No form to fill in.
      </p>

      <h2>Download links</h2>
      <p>
        Links expire 72 hours after purchase. That is a security measure, not a limit on
        what you bought — email support with your order reference and you will get fresh
        links. Keep the receipt email; it is the proof of purchase.
      </p>

      <h2>Updates</h2>
      <p>
        When a guide is corrected or expanded, buyers get the new version at no cost.
        Email support with your order reference.
      </p>

      <h2>Payment and data</h2>
      <p>
        Payments are processed by Stripe. We never see or store your card details. The
        only thing this store keeps is what Stripe records about the order — your email
        address, so the files can be delivered, and what you bought.
      </p>
    </div>
  );
}
