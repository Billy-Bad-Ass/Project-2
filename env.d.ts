/**
 * Cloudflare bindings, typed for `getCloudflareContext().env`.
 *
 * Hand-written rather than generated. `npx wrangler types` produces a 570 KB
 * worker-configuration.d.ts, and because `next build` type-checks, relying on it
 * would mean either a large generated blob in git or a build that fails on a
 * fresh clone until someone runs wrangler. Three bindings is not worth either.
 *
 * The types are imported rather than pulled in with a global
 * `/// <reference types="@cloudflare/workers-types" />`: that form replaces
 * Node's globals across the whole project and breaks Buffer in
 * lib/download-token.ts. `import type` keeps it scoped to this file.
 *
 * Keep in step with the bindings and vars in wrangler.jsonc.
 */
import type { R2Bucket, Fetcher } from '@cloudflare/workers-types';

declare global {
  interface CloudflareEnv {
    /** Private R2 bucket holding the product PDFs. Must never be made public. */
    DOWNLOADS: R2Bucket;
    /** Static assets served by the Worker, wired up by @opennextjs/cloudflare. */
    ASSETS: Fetcher;

    NEXT_PUBLIC_SITE_URL?: string;
    STRIPE_AUTOMATIC_TAX?: string;

    // Set with `wrangler secret put` — never in wrangler.jsonc. See docs/RUNBOOK.md.
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    DOWNLOAD_SIGNING_SECRET?: string;
    RESEND_API_KEY?: string;
    DELIVERY_FROM_EMAIL?: string;
  }
}

export {};
