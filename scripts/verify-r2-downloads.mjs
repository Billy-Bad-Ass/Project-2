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
 *
 * Presence is not freshness. A file uploaded before its note was edited is
 * still present, still the right page count, and still wrong — so this also
 * compares the digest of each sellable file against the manifest the last
 * upload wrote. That is the check that catches a `skip_upload` deploy shipping
 * yesterday's content. See lib/source-digest.mjs.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_KEY } from './lib/source-digest.mjs';
import { auditBucket } from './lib/download-audit.mjs';

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

/**
 * The digests recorded by the last successful `npm run pdf:upload`. Absent
 * means the bucket was filled by a tool that did not record them, so nothing
 * here can vouch for what is in it.
 */
async function readManifest() {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/${MANIFEST_KEY}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read r2://${bucket}/${MANIFEST_KEY}: HTTP ${res.status}`);

  try {
    return JSON.parse(await res.text());
  } catch {
    throw new Error(`r2://${bucket}/${MANIFEST_KEY} is not valid JSON.`);
  }
}

const objects = await listObjects();
const manifest = await readManifest();

const audit = auditBucket({ items: catalog.items, objects, manifest });

for (const r of audit.results) {
  switch (r.state) {
    case 'current':
      console.log(`✓ ${r.file} — ${r.size} bytes, matches its note`);
      break;
    case 'present':
      console.log(`✓ ${r.file} — ${r.size} bytes`);
      break;
    case 'stale':
      console.log(
        `✗ ${r.file} — STALE in r2://${bucket}: built from older content ` +
          `(bucket ${r.shipped.slice(0, 12)}…, catalogue ${r.expected.slice(0, 12)}…)`,
      );
      break;
    case 'unrecorded':
      console.log(`✗ ${r.file} — in r2://${bucket} but absent from ${MANIFEST_KEY}`);
      break;
    case 'absent-not-sellable':
      console.log(`- ${r.file} — not in r2://${bucket}, but ${r.sku} cannot be bought`);
      break;
    default:
      console.log(`✗ ${r.file} — ${r.state.toUpperCase()} in r2://${bucket} (sold by ${r.sku})`);
  }
}

if (audit.failures) {
  if (audit.missing) {
    console.error(`\n${audit.missing} sellable file(s) are not in the production bucket.`);
  }
  if (audit.stale) {
    console.error(
      `\n${audit.stale} sellable file(s) in the bucket were built from older content.` +
        '\nA buyer paying today would download the previous version.',
    );
  }
  console.error('Run `npm run pdf:build && npm run pdf:upload` before deploying.');
  process.exit(1);
}

if (audit.unverified) {
  console.error(
    `\nNo ${MANIFEST_KEY} in r2://${bucket}, so freshness could not be checked —` +
      '\nevery file is present, but nothing proves it matches the current notes.' +
      '\nRun `npm run pdf:build && npm run pdf:upload` once to record it.',
  );
  process.exit(1);
}

console.log('\nEvery sellable PDF is in the production bucket, and matches its note.');
