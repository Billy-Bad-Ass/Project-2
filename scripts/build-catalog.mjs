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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesDir = join(root, 'content', 'products');
const meta = JSON.parse(readFileSync(join(root, 'catalog', 'products.json'), 'utf8'));

const warnings = [];

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
const filesFor = (slug) => [
  { name: `${slug}-A4.pdf`, size: 'A4', label: 'A4' },
  { name: `${slug}-Letter.pdf`, size: 'Letter', label: 'US Letter' },
];

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
  .filter(Boolean);

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
    files: members.flatMap((m) => filesFor(m.sku)),
  };
});

const catalog = {
  generatedFrom: 'content/products/*.md + catalog/products.json',
  merchant: meta.merchant,
  currency: meta.currency,
  items: [...products, ...bundles].sort((a, b) => a.order - b.order),
  warnings,
};

writeFileSync(join(root, 'catalog', 'generated.json'), `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`catalog: ${catalog.items.length} items -> catalog/generated.json`);
for (const item of catalog.items) {
  const price = (item.priceMinor / 100).toFixed(2);
  console.log(`  ${item.sku.padEnd(36)} £${price.padStart(6)}  ${item.status}`);
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
