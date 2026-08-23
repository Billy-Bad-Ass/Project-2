/**
 * The store's public origin.
 *
 * Two readers, because they want different things from an unset value:
 * page metadata needs a URL that always parses, while the delivery paths need
 * to know it is missing so they can warn instead of emailing a broken link.
 *
 * Both trim and strip trailing slashes, and both treat an empty string as
 * unset. That distinction is the whole point of this module: an env var that
 * exists but is blank is the normal state on a first deploy, and
 * `process.env.X ?? fallback` does not catch it — `??` only fires on
 * undefined, so the empty string flows straight through. That is exactly how
 * `new URL('')` reached the metadata and failed the build.
 */

export const FALLBACK_SITE_URL = 'http://localhost:3000';

/** The configured origin, or '' when it is unset or blank. */
export function configuredSiteUrl(): string {
  // Referenced in full so Next can inline it at build time.
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return raw.trim().replace(/\/+$/, '');
}

/** Always a parseable absolute URL. Use where a throw would break the build. */
export function metadataBaseUrl(): string {
  const configured = configuredSiteUrl();
  if (!configured) return FALLBACK_SITE_URL;

  try {
    return new URL(configured).toString().replace(/\/+$/, '');
  } catch {
    // A malformed value should degrade to a working build, not stop it.
    console.warn(`[site] NEXT_PUBLIC_SITE_URL is not a valid URL: ${configured}`);
    return FALLBACK_SITE_URL;
  }
}
