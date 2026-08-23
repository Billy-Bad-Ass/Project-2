import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  extractPrintableBody,
  extractListing,
  splitPages,
  stripEmptyTableRows,
} from '../scripts/lib/note-parser.mjs';

test('parseFrontmatter reads scalars, inline arrays and folded blocks', () => {
  const { data, body } = parseFrontmatter(
    [
      '---',
      'slug: a-guide',
      'pages: 6',
      'landscapePages: [2, 4]',
      'contentGap: >-',
      '  first line',
      '  second line',
      '---',
      '',
      '# Body',
    ].join('\n'),
  );

  assert.equal(data.slug, 'a-guide');
  assert.equal(data.pages, '6');
  assert.deepEqual(data.landscapePages, [2, 4]);
  assert.equal(data.contentGap, 'first line second line');
  assert.match(body, /^\s*# Body/);
});

test('parseFrontmatter leaves a note without frontmatter untouched', () => {
  const raw = '# Just a heading\n\ntext';
  const { data, body } = parseFrontmatter(raw);
  assert.deepEqual(data, {});
  assert.equal(body, raw);
});

test('extractPrintableBody keeps the printable part and drops the listing', () => {
  const body = [
    'preamble that should go',
    '## FULL CONTENT',
    '## PAGE 1 — Cover',
    'the cover',
    '## ETSY LISTING',
    '## Title',
    'A Searchable Title',
  ].join('\n');

  const printable = extractPrintableBody(body);
  assert.match(printable, /PAGE 1 — Cover/);
  assert.doesNotMatch(printable, /preamble/);
  assert.doesNotMatch(printable, /Searchable Title/);
});

test('extractListing pulls title, fenced description and numbered tags', () => {
  const body = [
    '## (Any website) LISTING',
    '## Title',
    'Espresso Dial In Cheat Sheet Printable',
    '**Why it is phrased this way:** because search.',
    '## Description',
    '```',
    'Sour? Bitter? Both?',
    '',
    'Fix it in one page.',
    '```',
    '## Tags (3)',
    '1. espresso guide',
    '2. coffee cheat sheet',
    '3. home barista',
    'All 20 characters or fewer.',
  ].join('\n');

  const listing = extractListing(body);
  assert.equal(listing.title, 'Espresso Dial In Cheat Sheet Printable');
  assert.match(listing.description, /^Sour\? Bitter\? Both\?/);
  assert.match(listing.description, /Fix it in one page\.$/);
  assert.deepEqual(listing.tags, ['espresso guide', 'coffee cheat sheet', 'home barista']);
});

test('splitPages splits on PAGE markers and keeps headings', () => {
  const pages = splitPages(
    ['## PAGE 1 — Cover', 'cover body', '## PAGE 2 — THE CARD', 'card body'].join('\n'),
  );

  assert.equal(pages.length, 2);
  assert.deepEqual(
    pages.map((p) => [p.number, p.heading]),
    [
      [1, 'Cover'],
      [2, 'THE CARD'],
    ],
  );
  assert.equal(pages[1].markdown, 'card body');
});

test('splitPages returns a single page when there are no markers', () => {
  const pages = splitPages('just some text');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].number, 1);
});

test('stripEmptyTableRows removes blank rows and rebuilds the header', () => {
  const { markdown, removed, droppedTables } = stripEmptyTableRows(
    [
      '|  |  |  |',
      '| - | - | - |',
      '|  |  |  |',
      '| Mod | Effect | Cost |',
      '| Foam | Deeper | Low |',
    ].join('\n'),
  );

  assert.equal(removed, 2);
  assert.equal(droppedTables, 0);
  assert.deepEqual(markdown.split('\n'), [
    '| Mod | Effect | Cost |',
    '| --- | --- | --- |',
    '| Foam | Deeper | Low |',
  ]);
});

test('stripEmptyTableRows drops a table that has no content at all', () => {
  const { markdown, droppedTables } = stripEmptyTableRows(
    ['before', '|  |  |', '| - | - |', '|  |  |', 'after'].join('\n'),
  );

  assert.equal(droppedTables, 1);
  assert.deepEqual(markdown.split('\n'), ['before', 'after']);
});

test('stripEmptyTableRows leaves a well-formed table alone', () => {
  const source = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');
  const { markdown, removed, droppedTables } = stripEmptyTableRows(source);

  assert.equal(removed, 0);
  assert.equal(droppedTables, 0);
  assert.equal(markdown, source);
});

test('stripEmptyTableRows pads ragged rows to a consistent width', () => {
  const { markdown } = stripEmptyTableRows(['| A | B | C |', '| --- |', '| 1 |'].join('\n'));
  assert.deepEqual(markdown.split('\n'), ['| A | B | C |', '| --- | --- | --- |', '| 1 |  |  |']);
});
