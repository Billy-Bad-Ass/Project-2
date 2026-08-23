import Stripe from 'stripe';

let client: Stripe | null = null;

/**
 * Lazily constructed so a missing key surfaces as a clear runtime error on the
 * one route that needs it, rather than crashing the whole build.
 */
export function stripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Copy .env.example to .env.local and fill it in.',
    );
  }

  client = new Stripe(key, {
    appInfo: { name: 'BBA Network Store', url: 'https://github.com/Billy-Bad-Ass/Project-2' },
    maxNetworkRetries: 2,
    // Cloudflare Workers has no Node http stack. The fetch client works on both
    // runtimes, so it is used unconditionally rather than sniffing the platform.
    httpClient: Stripe.createFetchHttpClient(),
  });
  return client;
}

export const isLiveMode = () => (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_');
