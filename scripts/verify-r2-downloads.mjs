#!/usr/bin/env node
/**
 * Verifies every PDF a buyer can pay for actually exists in the production R2
 * bucket, before the Worker that lists it goes live.
 *
 * The upload step in deploy.yml can be skipped (`skip_upload`), and nothing
 * else stands between "the storefront lists it" and "the bucket holds it".
 * Workers has no filesystem: a deploy whose bucket is missing a file is a
 * store that takes the money and then 500s on the download — silent to
 * everyone except the buyer, who paid to find it. This check makes that a
 * failed deploy instead.
 *
 * Read-only: lists the bucket through the Cloudflare REST API with the same
 * token the deploy already holds. Nothing here can write.
 *
 *   node scripts/verify-r2-downloads.mjs
 *
 * Fails on any missing or empty file belonging to a sellable (status
 * "ready") item. Files of `needs-content` items are reported but do not
 * fail the deploy — checkout already refuses those SKUs, so a buyer cannot
 * reach their download route.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'generated.json'), 'utf8'));

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.');
  process.exit(1);
}

/** Same source of truth as upload-downloads.mjs: the binding, not a copy. */
function bucketName() {
  const raw = readFileSync(join(root, 'wrangler.jsonc'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const bucket = JSON.parse(raw).r2_buckets?.find((b) => b.binding === 'DOWNLOADS');
  if (!bucket?.bucket_name) throw new Error('No DOWNLOADS r2_bucket binding in wrangler.jsonc');
  return bucket.bucket_name;
}

const bucket = bucketName();

/** Every object in the bucket, keyed to its size. Paginates until done. */
async function listObjects() {
  const sizes = new Map();
  let cursor;
  for (;;) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects`,
    );
    url.searchParams.set('per_page', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok || body.success === false) {
      throw new Error(`Could not list r2://${bucket}: ${JSON.stringify(body.errors ?? body)}`);
    }
    for (const obj of body.result ?? []) sizes.set(obj.key, obj.size ?? 0);

    cursor = body.result_info?.cursor;
    const truncated = body.result_info?.is_truncated ?? Boolean(cursor && (body.result ?? []).length);
    if (!truncated || !cursor) return sizes;
  }
}

const objects = await listObjects();

// A file blocks the deploy only if a buyer can actually pay for it: checkout
// refuses any item whose status is not "ready", so those files cannot strand
// a real purchase yet.
let failures = 0;
for (const item of catalog.items) {
  const sellable = item.status === 'ready';
  for (const file of item.files ?? []) {
    const size = objects.get(file.name);
    const present = size !== undefined && size > 0;
    if (present) {
      console.log(`✓ ${file.name} — ${size} bytes`);
    } else if (sellable) {
      console.log(`✗ ${file.name} — ${size === undefined ? 'MISSING from' : 'EMPTY in'} r2://${bucket} (sold by ${item.sku})`);
      failures++;
    } else {
      console.log(`- ${file.name} — not in r2://${bucket}, but ${item.sku} is ${item.status} and cannot be bought`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} sellable file(s) are not in the production bucket.`);
  console.error('Run `npm run pdf:build && npm run pdf:upload` before deploying.');
  process.exit(1);
}
console.log('\nEvery sellable PDF is in the production bucket.');
