/**
 * A content fingerprint for one product PDF.
 *
 * `verify-r2-downloads.mjs` can tell that a file exists in the bucket, but not
 * that it is the *current* file. Editing a note, rebuilding the catalogue and
 * then deploying with `skip_upload` (or simply forgetting `npm run pdf:upload`)
 * leaves the old PDF in R2: every existing check still passes, /api/health
 * still reports healthy, and the buyer pays $9.45 for a guide with the wrong
 * temperature on it. CLAUDE.md calls that the worst failure this product line
 * has, so it should not be reachable by forgetting a command.
 *
 * The digest closes that hole. It hashes exactly the inputs that decide the
 * bytes on the page, so it changes when — and only when — a rebuilt PDF would
 * differ. `upload-downloads.mjs` publishes the digests it uploaded alongside
 * the files; `verify-r2-downloads.mjs` fails the deploy when the bucket's
 * digests do not match the catalogue's.
 *
 * The PDFs themselves cannot be hashed: Chromium stamps a creation date into
 * every file, so two builds of identical content differ. Hence the source.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { printCss } from './print-styles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The layout inputs shared by every product. Read once — a change to either
 * re-renders all of them, so both belong in every digest.
 */
const shared = createHash('sha256')
  .update(printCss)
  .update(readFileSync(join(root, 'brand', 'logo.svg')))
  .digest('hex');

/**
 * Bump when the *renderer* changes in a way that alters output but leaves the
 * catalogue untouched — a new footer, different margins, a fix to the auto-fit
 * loop. Without this, a build-script change ships silently on top of PDFs
 * rendered by the old one.
 */
export const RENDERER_VERSION = 1;

/**
 * Everything `build-pdfs.mjs` reads off a catalogue item, in a fixed order.
 * Fields it never reads (accent, badge, price, tags) are deliberately absent:
 * re-pricing a guide must not invalidate a PDF that is byte-for-byte correct.
 */
export function sourceDigest(item, paperSize, merchantName) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        v: RENDERER_VERSION,
        shared,
        sku: item.sku,
        name: item.name,
        paperSize,
        merchantName,
        pageCount: item.pageCount,
        pages: item.pages ?? [],
        landscapePages: item.landscapePages ?? [],
      }),
    )
    .digest('hex');
}

/** The bucket object that records which digests were last uploaded. */
export const MANIFEST_KEY = 'downloads-manifest.json';
