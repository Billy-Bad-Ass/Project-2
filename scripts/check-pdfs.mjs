#!/usr/bin/env node
/**
 * Verifies every generated PDF has exactly the page count its listing promises,
 * in both paper sizes. The listings say "6-page PDF" and buyers count, so this
 * is a contract with the customer rather than a cosmetic check.
 *
 * Run after `npm run pdf:build`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'generated.json'), 'utf8'));
const downloads = join(root, 'private', 'downloads');

/** Counts page objects in the PDF without pulling in a parser dependency. */
function countPages(buffer) {
  const text = buffer.toString('latin1');
  const direct = text.match(/\/Type\s*\/Page[^s]/g);
  if (direct) return direct.length;

  // Fall back to the page tree /Count when the file uses object streams.
  const counts = [...text.matchAll(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/g)];
  return counts.length ? Math.max(...counts.map((m) => Number(m[1]))) : 0;
}

let failures = 0;

for (const item of catalog.items.filter((i) => i.type === 'single')) {
  for (const file of item.files) {
    const path = join(downloads, file.name);

    if (!existsSync(path)) {
      console.log(`✗ ${file.name} — not built`);
      failures++;
      continue;
    }

    const pages = countPages(readFileSync(path));
    if (pages !== item.pageCount) {
      console.log(`✗ ${file.name} — ${pages} pages, listing promises ${item.pageCount}`);
      failures++;
    } else {
      console.log(`✓ ${file.name} — ${pages} pages`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} PDF check(s) failed.`);
  console.error('Trim the source note until the page fits — do not lower MIN_ZOOM.');
  process.exit(1);
}
console.log('\nEvery PDF matches the page count its listing promises.');
