#!/usr/bin/env node
/**
 * Merges content/products/*.md with catalog/products.json into
 * catalog/generated.json — the single artefact the storefront, the PDF build
 * and the Stripe sync all read.
 *
 * Committed to the repo so `next build` never has to parse markdown.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFrontmatter,
  extractPrintableBody,
  extractListing,
  splitPages,
  stripEmptyTableRows,
} from './lib/note-parser.mjs';
import { readReviews, summarise } from './lib/reviews.mjs';
import { sourceDigest } from './lib/source-digest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesDir = join(root, 'content', 'products');
const meta = JSON.parse(readFileSync(join(root, 'catalog', 'products.json'), 'utf8'));

const warnings = [];

/**
 * The listing description is authored inside a fenced block, hard-wrapped to
 * about 76 characters. Rendering that verbatim leaves mid-sentence line breaks
 * wherever the column is narrower. Reflow paragraphs while keeping the bullets
 * and the ALL-CAPS section headings the copy relies on.
 */
const BULLET = /^\s*[•\-*]\s+/;
/** A short all-caps line is a section heading in this house style. */
const isHeading = (line) =>
  /^[A-Z0-9 ,'"—–-]{4,60}$/.test(line) && line === line.toUpperCase();

function describeBlocks(description) {
  const blocks = [];

  for (const chunk of description.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    let index = 0;

    // Headings are written immediately above their list with no blank line, so
    // peel them off the front before classifying what follows.
    while (index < lines.length && isHeading(lines[index].trim())) {
      blocks.push({ type: 'heading', text: lines[index].trim() });
      index++;
    }

    const rest = lines.slice(index);
    if (rest.length === 0) continue;

    if (rest.some((line) => BULLET.test(line))) {
      const items = [];
      let lead = [];

      for (const line of rest) {
        if (BULLET.test(line)) {
          items.push(line.replace(BULLET, '').trim());
        } else if (items.length) {
          // Indented continuation of the previous bullet.
          items[items.length - 1] += ` ${line.trim()}`;
        } else {
          lead.push(line.trim());
        }
      }

      if (lead.length) blocks.push({ type: 'text', text: lead.join(' ') });
      if (items.length) blocks.push({ type: 'list', items });
      continue;
    }

    blocks.push({ type: 'text', text: rest.join(' ').replace(/\s+/g, ' ').trim() });
  }

  return blocks;
}

const notes = new Map();
for (const file of readdirSync(notesDir).filter((f) => f.endsWith('.md'))) {
  const raw = readFileSync(join(notesDir, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  if (!data.slug) {
    warnings.push(`${file}: missing \`slug\` in frontmatter — skipped`);
    continue;
  }

  const printable = extractPrintableBody(body);
  const { markdown: cleaned, removed, droppedTables } = stripEmptyTableRows(printable);
  const listing = extractListing(body);
  const pages = splitPages(cleaned);

  if (removed > 0 || droppedTables > 0) {
    warnings.push(
      `${file}: dropped ${removed} empty table row(s) and ${droppedTables} empty table(s)` +
        (data.contentGap ? ' — known content gap, see frontmatter' : ' — check the source export'),
    );
  }
  if (!listing.title) warnings.push(`${file}: no listing title found`);
  if (!listing.description) warnings.push(`${file}: no listing description found`);
  if (listing.tags.length === 0) warnings.push(`${file}: no listing tags found`);

  notes.set(data.slug, {
    ...data,
    file,
    listing,
    pageCount: pages.length,
    pages,
    printableMarkdown: cleaned,
  });
}

/** Both paper sizes ship for every product. */
const PAPER_SIZES = [
  { size: 'A4', label: 'A4' },
  { size: 'Letter', label: 'US Letter' },
];
const filesFor = (slug) =>
  PAPER_SIZES.map(({ size, label }) => ({ name: `${slug}-${size}.pdf`, size, label }));

/**
 * Stamp every file with a fingerprint of the note it renders from, so a deploy
 * can tell a current PDF in the bucket from a stale one. Bundles ship their
 * members' files, so they inherit those digests rather than computing their own.
 * See lib/source-digest.mjs.
 */
const withDigests = (item) => ({
  ...item,
  files: item.files.map((file) => ({
    ...file,
    sourceDigest: sourceDigest(item, file.size, meta.merchant.name),
  })),
});

const products = (meta.products ?? [])
  .map((entry) => {
    const note = notes.get(entry.sku);
    if (!note) {
      warnings.push(`catalog/products.json: no note found for sku "${entry.sku}"`);
      return null;
    }
    return {
      type: 'single',
      sku: entry.sku,
      name: note.title,
      subtitle: note.subtitle ?? '',
      blurb: entry.blurb,
      listingTitle: note.listing.title,
      description: note.listing.description,
      descriptionBlocks: describeBlocks(note.listing.description),
      tags: note.listing.tags,
      priceMinor: entry.priceMinor,
      currency: meta.currency,
      pageCount: note.pageCount,
      pages: note.pages,
      badge: entry.badge ?? null,
      accent: entry.accent,
      icon: entry.icon,
      order: entry.order,
      status: note.status ?? 'ready',
      contentGap: note.contentGap ?? null,
      landscapePages: Array.isArray(note.landscapePages) ? note.landscapePages : [],
      sourceNote: note.file,
      files: filesFor(entry.sku),
    };
  })
  .filter(Boolean)
  .map(withDigests);

const bundles = (meta.bundles ?? []).map((entry) => {
  const members = entry.includes.map((sku) => products.find((p) => p.sku === sku)).filter(Boolean);
  const fullPrice = members.reduce((sum, p) => sum + p.priceMinor, 0);
  if (members.length !== entry.includes.length) {
    warnings.push(`bundle "${entry.sku}": one or more member skus are missing`);
  }
  return {
    type: 'bundle',
    sku: entry.sku,
    name: entry.title,
    subtitle: `${members.length} guides · ${members.reduce((n, p) => n + p.pageCount, 0)} pages · both paper sizes`,
    blurb: entry.blurb,
    listingTitle: entry.title,
    description: [
      entry.blurb,
      '',
      'INCLUDED',
      ...members.map((m) => `• ${m.name} — ${m.pageCount} pages`),
      '',
      'Every guide ships as two PDFs, A4 and US Letter, same content.',
      'Instant download. No physical item is shipped.',
    ].join('\n'),
    tags: [...new Set(members.flatMap((m) => m.tags))].slice(0, 13),
    priceMinor: entry.priceMinor,
    savingMinor: Math.max(0, fullPrice - entry.priceMinor),
    currency: meta.currency,
    pageCount: members.reduce((n, p) => n + p.pageCount, 0),
    badge: entry.badge ?? null,
    accent: entry.accent,
    icon: entry.icon,
    order: entry.order,
    status: members.every((m) => m.status === 'ready') ? 'ready' : 'needs-content',
    contentGap: null,
    includes: entry.includes,
    files: members.flatMap((m) => m.files),
  };
});

const { reviews, problems: reviewProblems } = readReviews(join(root, 'content', 'reviews'));
warnings.push(...reviewProblems);

const knownSkus = new Set([...products, ...bundles].map((i) => i.sku));
for (const review of reviews) {
  if (review.sku && !knownSkus.has(review.sku)) {
    warnings.push(`reviews/${review.file}: sku "${review.sku}" is not in the catalogue`);
  }
}

const reviewsBySku = {};
for (const review of reviews) {
  if (!knownSkus.has(review.sku)) continue;
  (reviewsBySku[review.sku] ??= []).push({
    rating: review.rating,
    author: review.author,
    location: review.location,
    date: review.date,
    verified: review.verified,
    text: review.text,
  });
}

const catalog = {
  generatedFrom: 'content/products/*.md + catalog/products.json + content/reviews/*.md',
  merchant: meta.merchant,
  currency: meta.currency,
  items: [...products, ...bundles]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      ...item,
      reviews: reviewsBySku[item.sku] ?? [],
      rating: summarise(reviewsBySku[item.sku] ?? []),
    })),
  warnings,
};

writeFileSync(join(root, 'catalog', 'generated.json'), `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`catalog: ${catalog.items.length} items -> catalog/generated.json`);
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: (catalog.currency ?? 'usd').toUpperCase(),
});
for (const item of catalog.items) {
  console.log(`  ${item.sku.padEnd(36)} ${money.format(item.priceMinor / 100).padStart(9)}  ${item.status}`);
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
