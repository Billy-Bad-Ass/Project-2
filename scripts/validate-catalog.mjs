#!/usr/bin/env node
/**
 * Validates the catalogue SOURCE before anything is generated from it.
 *
 * `build-catalog.mjs` merges the notes with the commercial metadata and, until
 * now, recorded every problem it met as a warning, wrote it into
 * `catalog/generated.json` and exited 0. CI then checked only that the
 * generated file was not stale — and a baked-in warning is perfectly stable,
 * so the check passed every time. A guide could drop out of the shop, or ship
 * with no price, and every light stayed green.
 *
 * This runs first and exits non-zero, so a broken catalogue stops the build
 * instead of reaching the storefront. It reads the same sources the build
 * reads and never writes anything.
 *
 *   npm run catalog:check
 *
 * Errors block. Warnings are printed and do not: a dropped empty table row is
 * a content-quality note for a human, not a reason to fail a deploy.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, extractPrintableBody, extractListing, splitPages, stripEmptyTableRows } from './lib/note-parser.mjs';
import { readReviews } from './lib/reviews.mjs';
import { PRODUCTS_JSON, NOTE_FRONTMATTER } from './lib/catalog-schema.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Marketplace limits the listings are written against. Duplicated from the
 * catalogue tests on purpose: the test asserts the built artefact obeys them,
 * this names the note that broke them, and a rule worth enforcing is worth
 * enforcing at both ends.
 */
const MAX_TAGS = 13;
const MAX_TAG_LENGTH = 20;
const MIN_DESCRIPTION = 50;

/**
 * Collects problems without throwing on the first one. A catalogue with four
 * things wrong should report four things, not make someone run the check four
 * times.
 */
export function validateCatalogue({
  metaRaw,
  notes,
  reviews = [],
} = {}) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);

  /* ---- 1. the commercial metadata matches its schema ---- */
  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch (error) {
    return { errors: [`catalog/products.json is not valid JSON: ${error.message}`], warnings };
  }

  for (const problem of PRODUCTS_JSON(meta, 'catalog/products.json')) fail(problem);

  const products = Array.isArray(meta.products) ? meta.products : [];
  const bundles = Array.isArray(meta.bundles) ? meta.bundles : [];
  const entries = [...products, ...bundles];

  /* ---- 2. skus and sort order are unambiguous ---- */
  const seenSku = new Map();
  for (const entry of entries) {
    if (typeof entry?.sku !== 'string') continue;
    if (seenSku.has(entry.sku)) {
      fail(`catalog/products.json: sku "${entry.sku}" is declared twice`);
    }
    seenSku.set(entry.sku, entry);
  }

  // `build-catalog.mjs` sorts by `order`. Ties sort unpredictably, so the shop
  // can reorder itself between builds and churn the generated file.
  const byOrder = new Map();
  for (const entry of entries) {
    if (!Number.isInteger(entry?.order)) continue;
    const clash = byOrder.get(entry.order);
    if (clash) {
      fail(`catalog/products.json: "${entry.sku}" and "${clash}" both have order ${entry.order} — the shop's running order is then undefined`);
    }
    byOrder.set(entry.order, entry.sku);
  }

  /* ---- 3. every note is well formed ---- */
  const bySlug = new Map();
  for (const note of notes) {
    for (const problem of NOTE_FRONTMATTER(note.data, `content/products/${note.file}`)) fail(problem);

    const slug = note.data.slug;
    if (typeof slug !== 'string' || !slug) continue;

    if (bySlug.has(slug)) {
      fail(`content/products/${note.file}: slug "${slug}" is also used by ${bySlug.get(slug).file}`);
      continue;
    }
    bySlug.set(slug, note);

    if (note.file !== `${slug}.md`) {
      warn(`content/products/${note.file}: filename does not match its slug "${slug}"`);
    }

    // The hand-written page count is what release-check.mjs measures the built
    // PDF against, and what the listing promises the buyer. Nothing verified it
    // until now.
    const declared = Number(note.data.pages);
    if (Number.isInteger(declared) && declared !== note.pageCount) {
      fail(`content/products/${note.file}: frontmatter says ${declared} pages, the note parses into ${note.pageCount}`);
    }

    /* ---- 4. the listing copy the shop renders actually exists ---- */
    const { title, description, tags } = note.listing;
    if (!title) fail(`content/products/${note.file}: the LISTING section has no title`);
    if (!description) {
      fail(`content/products/${note.file}: the LISTING section has no description`);
    } else if (description.length < MIN_DESCRIPTION) {
      fail(`content/products/${note.file}: listing description is ${description.length} characters, under the ${MIN_DESCRIPTION} the storefront expects`);
    }

    if (!tags?.length) {
      fail(`content/products/${note.file}: the LISTING section has no tags`);
    } else {
      if (tags.length > MAX_TAGS) {
        fail(`content/products/${note.file}: ${tags.length} tags, the marketplace allows ${MAX_TAGS}`);
      }
      for (const tag of tags) {
        if (tag.length > MAX_TAG_LENGTH) {
          fail(`content/products/${note.file}: tag "${tag}" is ${tag.length} characters, over the ${MAX_TAG_LENGTH} limit`);
        }
      }
    }

    if (note.droppedRows > 0 || note.droppedTables > 0) {
      warn(
        `content/products/${note.file}: dropped ${note.droppedRows} empty table row(s) and ${note.droppedTables} empty table(s)` +
          (note.data.contentGap ? ' — known content gap, see frontmatter' : ' — check the source export'),
      );
    }

    // A gap is a promise the file cannot keep, so it must be declared where the
    // storefront can see it and refuse to sell.
    if (note.data.contentGap && note.data.status !== 'needs-content') {
      fail(`content/products/${note.file}: has a contentGap but status is "${note.data.status}" — it would go on sale incomplete`);
    }
  }

  /* ---- 5. notes and metadata agree on what the shop sells ---- */
  for (const entry of products) {
    if (typeof entry?.sku !== 'string') continue;
    if (!bySlug.has(entry.sku)) {
      fail(`catalog/products.json: sku "${entry.sku}" has no note at content/products/${entry.sku}.md — it would silently vanish from the shop`);
    }
  }

  const declaredSkus = new Set(products.map((p) => p?.sku));
  for (const [slug, note] of bySlug) {
    if (!declaredSkus.has(slug)) {
      warn(`content/products/${note.file}: written but not listed in catalog/products.json — it has no price, so it is not for sale`);
    }
  }

  /* ---- 6. bundles hold together ---- */
  for (const bundle of bundles) {
    if (!Array.isArray(bundle?.includes)) continue;

    const members = bundle.includes.map((sku) => products.find((p) => p?.sku === sku));
    const absent = bundle.includes.filter((sku, i) => !members[i]);
    for (const sku of absent) {
      fail(`catalog/products.json: bundle "${bundle.sku}" includes "${sku}", which is not a product`);
    }
    if (new Set(bundle.includes).size !== bundle.includes.length) {
      fail(`catalog/products.json: bundle "${bundle.sku}" lists the same guide more than once`);
    }
    if (absent.length) continue;

    const full = members.reduce((sum, p) => sum + p.priceMinor, 0);
    if (bundle.priceMinor >= full) {
      fail(`catalog/products.json: bundle "${bundle.sku}" costs ${bundle.priceMinor} but its parts total ${full} — a bundle must be cheaper than buying separately`);
    }
  }

  /* ---- 7. reviews point at something real ---- */
  const knownSkus = new Set(entries.map((e) => e?.sku));
  for (const review of reviews) {
    if (review.sku && !knownSkus.has(review.sku)) {
      fail(`content/reviews/${review.file}: reviews sku "${review.sku}", which is not in the catalogue`);
    }
  }

  return { errors, warnings };
}

/** Reads the notes the same way `build-catalog.mjs` does, so both see one truth. */
export function readNotes(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
      const { markdown, removed, droppedTables } = stripEmptyTableRows(extractPrintableBody(body));

      return {
        file,
        data,
        listing: extractListing(body),
        pageCount: splitPages(markdown).length,
        droppedRows: removed,
        droppedTables,
      };
    });
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { reviews } = readReviews(join(root, 'content', 'reviews'));

  const { errors, warnings } = validateCatalogue({
    metaRaw: readFileSync(join(root, 'catalog', 'products.json'), 'utf8'),
    notes: readNotes(join(root, 'content', 'products')),
    reviews,
  });

  for (const warning of warnings) console.log(`  ! ${warning}`);

  if (errors.length) {
    console.error(`\n${errors.length} catalogue error(s):`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    console.error('\nFix the note or catalog/products.json — do not edit catalog/generated.json.');
    process.exit(1);
  }

  const counted = warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : '';
  console.log(`\ncatalogue source is valid${counted}.`);
}
