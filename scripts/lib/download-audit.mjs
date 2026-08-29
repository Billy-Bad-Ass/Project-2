/**
 * Decides whether the production bucket is safe to sell from.
 *
 * Kept separate from verify-r2-downloads.mjs so the rules can be tested without
 * Cloudflare credentials — the script is then just "fetch the bucket state, ask
 * this, print the answer".
 */

/**
 * @param items     catalogue items, each with `status` and `files[]`
 * @param objects   Map of object key -> byte size, as listed from the bucket
 * @param manifest  the parsed downloads manifest, or null when the bucket has none
 * @returns {{results: Array, failures: number, missing: number, stale: number, unverified: boolean}}
 */
export function auditBucket({ items, objects, manifest }) {
  const results = [];

  for (const item of items) {
    // Only a sellable item can strand a real purchase: checkout refuses every
    // other status, so its files cannot be reached by someone who has paid.
    const sellable = item.status === 'ready';

    for (const file of item.files ?? []) {
      const size = objects.get(file.name);
      const present = size !== undefined && size > 0;

      if (!present) {
        results.push({
          file: file.name,
          sku: item.sku,
          state: sellable ? (size === undefined ? 'missing' : 'empty') : 'absent-not-sellable',
          blocking: sellable,
          size,
        });
        continue;
      }

      const shipped = manifest?.digests?.[file.name];

      // Without a manifest there is nothing to compare against; that is reported
      // once for the whole bucket rather than as a fault of each file.
      if (!sellable || !manifest) {
        results.push({ file: file.name, sku: item.sku, state: 'present', blocking: false, size });
        continue;
      }

      if (shipped !== file.sourceDigest) {
        results.push({
          file: file.name,
          sku: item.sku,
          state: shipped ? 'stale' : 'unrecorded',
          blocking: true,
          size,
          shipped: shipped ?? null,
          expected: file.sourceDigest,
        });
        continue;
      }

      results.push({ file: file.name, sku: item.sku, state: 'current', blocking: false, size });
    }
  }

  const count = (...states) => results.filter((r) => states.includes(r.state)).length;

  return {
    results,
    failures: results.filter((r) => r.blocking).length,
    missing: count('missing', 'empty'),
    stale: count('stale', 'unrecorded'),
    // Every file is there, but nothing proves any of it is current.
    unverified: !manifest && items.some((i) => i.status === 'ready'),
  };
}
