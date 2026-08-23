'use client';

import { useState } from 'react';
import { Icon } from './Icon';

/**
 * Kicks off Stripe Checkout. Deliberately the only client component in the
 * storefront — everything else renders on the server.
 */
export function BuyButton({
  sku,
  label,
  variant = 'primary',
  block = false,
}: {
  sku: string;
  label: string;
  variant?: 'primary' | 'ghost';
  block?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku }),
      });
      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Checkout is unavailable right now.');
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={checkout}
        disabled={pending}
        className={`btn btn--${variant}${block ? ' btn--block' : ''}`}
      >
        {pending ? 'Opening checkout…' : label}
        {!pending && <Icon name="arrow-right" size={14} />}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--accent)', fontSize: '0.85rem', marginTop: 10 }}>
          {error}
        </p>
      )}
    </>
  );
}
