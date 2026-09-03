import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCatalogue, readNotes } from '../scripts/validate-catalog.mjs';
import { readReviews } from '../scripts/lib/reviews.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The real metadata, so a fixture only has to say what it changes. */
const realMeta = () => JSON.parse(readFileSync(join(root, 'catalog', 'products.json'), 'utf8'));

/**
 * A note as `readNotes` produces one. Frontmatter scalars are strings because
 * that is what the notes' minimal YAML reader returns.
 */
const note = (overrides = {}) => ({
  file: 'espresso-dial-in-card.md',
  data: {
    slug: 'espresso-dial-in-card',
    title: 'Espresso Dial-In Troubleshooting Card',
    pages: '6',
    status: 'ready',
    ...overrides.data,
  },
  listing: {
    title: 'Espresso Dial-In Card',
    description: 'x'.repeat(120),
    tags: ['espresso', 'coffee'],
    ...overrides.listing,
  },
  pageCount: 6,
  droppedRows: 0,
  droppedTables: 0,
  ...(({ data, listing, ...rest }) => rest)(overrides),
});

const run = ({ meta, notes = [note()], reviews = [] }) =>
  validateCatalogue({ metaRaw: JSON.stringify(meta), notes, reviews });

/** Only the products the fixture notes actually cover, so unrelated skus don't noise up a case. */
const metaFor = (products, extra = {}) => ({ ...realMeta(), products, bundles: [], ...extra });

const single = (overrides = {}) => ({
  sku: 'espresso-dial-in-card',
  priceMinor: 945,
  order: 1,
  badge: null,
  accent: '#7C3E12',
  icon: 'mug-hot',
  blurb: 'A troubleshooting card for home espresso, in one printable page.',
  ...overrides,
});

const failsWith = (result, fragment) => {
  assert.ok(
    result.errors.some((e) => e.includes(fragment)),
    `expected an error mentioning ${JSON.stringify(fragment)}, got:\n  ${result.errors.join('\n  ') || '(none)'}`,
  );
};

test('the catalogue as it actually ships is valid', () => {
  const { reviews } = readReviews(join(root, 'content', 'reviews'));
  const { errors } = validateCatalogue({
    metaRaw: readFileSync(join(root, 'catalog', 'products.json'), 'utf8'),
    notes: readNotes(join(root, 'content', 'products')),
    reviews,
  });

  assert.deepEqual(errors, [], 'the committed catalogue must pass its own validator');
});

/**
 * The case this validator was built for.
 *
 * A product with no `priceMinor` produced `undefined`, which `JSON.stringify`
 * drops, so the key vanished from generated.json entirely. The catalogue test
 * that compares generated prices against the metadata then compared undefined
 * with undefined and passed. The shop rendered a guide with no price and every
 * check stayed green.
 */
test('a product with no price is rejected', () => {
  const { priceMinor, ...priceless } = single();
  failsWith(run({ meta: metaFor([priceless]) }), 'priceMinor is missing');
});

test('a misspelt field is caught rather than ignored', () => {
  const { priceMinor, ...rest } = single();
  const result = run({ meta: metaFor([{ ...rest, priceMiner: 945 }]) });

  failsWith(result, 'priceMinor is missing');
  failsWith(result, 'priceMiner is not a field');
});

test('a sku with no note behind it is rejected', () => {
  failsWith(
    run({ meta: metaFor([single(), single({ sku: 'ghost-guide', order: 2 })]) }),
    'has no note',
  );
});

test('two products claiming the same running order are rejected', () => {
  const notes = [note(), note({ file: 'other.md', data: { slug: 'other-guide' } })];
  failsWith(
    run({ meta: metaFor([single(), single({ sku: 'other-guide' })]), notes }),
    'both have order 1',
  );
});

test('the same sku declared twice is rejected', () => {
  failsWith(run({ meta: metaFor([single(), single({ order: 2 })]) }), 'declared twice');
});

test('an accent that is not a hex colour is rejected', () => {
  failsWith(run({ meta: metaFor([single({ accent: 'brown' })]) }), 'six-digit hex colour');
});

test('a price below a penny floor or wildly high is rejected', () => {
  failsWith(run({ meta: metaFor([single({ priceMinor: 9.45 })]) }), 'must be a whole number');
  failsWith(run({ meta: metaFor([single({ priceMinor: 5 })]) }), 'at least 100');
});

/**
 * `release-check.mjs` asks an agent to compare the built PDF against this
 * frontmatter number, and the listing promises it to the buyer — but a human
 * types it by hand. A number another check trusts is worth verifying.
 */
test('a hand-written page count that no longer matches the note is rejected', () => {
  failsWith(
    run({ meta: metaFor([single()]), notes: [note({ data: { pages: '7' } })] }),
    'frontmatter says 7 pages, the note parses into 6',
  );
});

test('a guide with a known content gap cannot be marked ready', () => {
  failsWith(
    run({
      meta: metaFor([single()]),
      notes: [note({ data: { status: 'ready', contentGap: 'only four of the eight recipes' } })],
    }),
    'it would go on sale incomplete',
  );
});

test('listing copy the storefront renders must exist', () => {
  failsWith(run({ meta: metaFor([single()]), notes: [note({ listing: { title: '' } })] }), 'no title');
  failsWith(
    run({ meta: metaFor([single()]), notes: [note({ listing: { description: 'too short' } })] }),
    'under the 50',
  );
  failsWith(run({ meta: metaFor([single()]), notes: [note({ listing: { tags: [] } })] }), 'no tags');
});

test('a tag over the marketplace limit is rejected', () => {
  failsWith(
    run({ meta: metaFor([single()]), notes: [note({ listing: { tags: ['a'.repeat(21)] } })] }),
    'over the 20 limit',
  );
});

test('a review pointing at a guide that does not exist is rejected', () => {
  failsWith(
    run({
      meta: metaFor([single()]),
      reviews: [{ file: 'stray.md', sku: 'no-such-guide' }],
    }),
    'not in the catalogue',
  );
});

test('a bundle must be cheaper than its parts and hold only real guides', () => {
  const notes = [note(), note({ file: 'other.md', data: { slug: 'other-guide' } })];
  const products = [single(), single({ sku: 'other-guide', order: 2 })];
  const bundle = {
    sku: 'starter-pack',
    title: 'Starter Pack',
    priceMinor: 1890,
    order: 3,
    badge: null,
    accent: '#1F4E5F',
    icon: 'stack',
    blurb: 'Both guides, one download, for less than buying them separately.',
    includes: ['espresso-dial-in-card', 'other-guide'],
  };

  failsWith(run({ meta: metaFor(products, { bundles: [bundle] }), notes }), 'must be cheaper');
  failsWith(
    run({ meta: metaFor(products, { bundles: [{ ...bundle, priceMinor: 1500, includes: ['espresso-dial-in-card', 'ghost'] }] }), notes }),
    'which is not a product',
  );
});

/**
 * Writing a note before pricing it is a normal working state, not a mistake.
 * It must not fail the build — but it must be visible, because an unlisted
 * note looks identical to a guide that has quietly fallen out of the shop.
 */
test('a note that is written but not yet for sale warns without failing', () => {
  const result = run({
    meta: metaFor([single()]),
    notes: [note(), note({ file: 'draft.md', data: { slug: 'draft-guide' } })],
  });

  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.includes('not listed in catalog/products.json')));
});

test('every problem is reported in one pass, not one per run', () => {
  const { priceMinor, ...priceless } = single({ accent: 'brown' });
  const { errors } = run({ meta: metaFor([priceless, single({ sku: 'ghost', order: 1 })]) });

  assert.ok(errors.length >= 4, `expected several errors at once, got ${errors.length}:\n  ${errors.join('\n  ')}`);
});
