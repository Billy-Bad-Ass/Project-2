import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext adapter config.
 *
 * Deliberately minimal: the store has no ISR pages and no server-side cache to
 * speak of — product pages are prerendered at build time from a committed
 * catalogue, and the only dynamic routes (checkout, webhook, download) must
 * never be cached. Adding an incremental cache here would be a change in
 * behaviour, not a free win.
 */
export default defineCloudflareConfig();
