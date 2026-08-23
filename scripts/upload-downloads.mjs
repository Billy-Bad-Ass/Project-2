#!/usr/bin/env node
/**
 * Uploads the generated PDFs to the R2 bucket the download route reads from.
 *
 *   npm run pdf:upload              # to the real R2 bucket, for deploys
 *   npm run pdf:upload -- --local   # seed the local bucket `wrangler dev` reads
 *   npm run pdf:upload -- --dry-run
 *
 * Workers has no filesystem, so this step is what actually puts the products in
 * front of buyers. Deploying without it gives a store that takes money and then
 * 500s on the download — run it after every `npm run pdf:build`.
 *
 * Shells out to wrangler rather than using the S3 API so it reuses whatever
 * Cloudflare auth you already have (`wrangler login` or CLOUDFLARE_API_TOKEN),
 * and needs no extra credentials in the repo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const downloads = join(root, 'private', 'downloads');
const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'generated.json'), 'utf8'));

const args = process.argv.slice(2);
/**
 * `wrangler dev` binds DOWNLOADS to `preview_bucket_name` in miniflare's local
 * store, not to `bucket_name` — seeding the wrong one leaves the dev server
 * reporting every file missing while the uploads look like they succeeded.
 */
const local = args.includes('--local');
const dryRun = args.includes('--dry-run');

/** Read the bucket name from wrangler.jsonc so it cannot drift from the binding. */
function bucketName() {
  const raw = readFileSync(join(root, 'wrangler.jsonc'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const config = JSON.parse(raw);
  const bucket = config.r2_buckets?.find((b) => b.binding === 'DOWNLOADS');

  if (!bucket) throw new Error('No DOWNLOADS r2_bucket binding in wrangler.jsonc');
  const name = local ? bucket.preview_bucket_name : bucket.bucket_name;
  if (!name) throw new Error(`No ${local ? 'preview_' : ''}bucket_name on the DOWNLOADS binding`);
  return name;
}

const bucket = bucketName();

// Every file every product entitles a buyer to, deduplicated across bundles.
const files = [...new Set(catalog.items.flatMap((item) => item.files.map((f) => f.name)))].sort();

const missing = files.filter((name) => !existsSync(join(downloads, name)));
if (missing.length) {
  console.error(`${missing.length} file(s) have not been built yet:`);
  for (const name of missing) console.error(`  ${name}`);
  console.error('\nRun `npm run pdf:build` first.');
  process.exit(1);
}

console.log(
  `${dryRun ? 'Would upload' : 'Uploading'} ${files.length} file(s) to ` +
    `r2://${bucket}${local ? ' (local miniflare store)' : ' (remote)'}\n`,
);

let uploaded = 0;
for (const name of files) {
  const path = join(downloads, name);
  const size = readFileSync(path).byteLength;

  if (dryRun) {
    console.log(`  ${name.padEnd(46)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
    continue;
  }

  try {
    execFileSync(
      'npx',
      [
        'wrangler', 'r2', 'object', 'put', `${bucket}/${name}`,
        '--file', path,
        '--content-type', 'application/pdf',
        local ? '--local' : '--remote',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], cwd: root },
    );
    console.log(`  ✓ ${name.padEnd(46)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
    uploaded++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(String(error.stderr ?? error.message).trim().split('\n').slice(-4).join('\n'));
    process.exitCode = 1;
  }
}

if (!dryRun) {
  console.log(`\n${uploaded}/${files.length} uploaded to r2://${bucket}`);
  if (uploaded === files.length) {
    console.log(
      local
        ? 'Restart `wrangler dev` if it was already running, then check /api/health.'
        : 'Verify with /api/health on the deployed Worker — it reports any file still missing.',
    );
  }
}
