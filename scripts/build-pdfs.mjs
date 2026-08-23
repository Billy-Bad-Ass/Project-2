#!/usr/bin/env node
/**
 * Renders every catalog item to print-ready PDFs — one A4 and one US Letter
 * per product, same content — into private/downloads/.
 *
 * That directory is deliberately outside public/: the only way a buyer reaches
 * a file is through the signed-link route in app/api/download, which verifies
 * the purchase against Stripe first.
 *
 * Uses the Chromium that ships with this image (PLAYWRIGHT_BROWSERS_PATH).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { printCss } from './lib/print-styles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'private', 'downloads');
const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'generated.json'), 'utf8'));
const logo = readFileSync(join(root, 'brand', 'logo.svg'), 'utf8');

/** Printable box in mm, after margins, for each paper size we ship. */
const MARGIN = { top: 14, bottom: 16, side: 14 };
const LANDSCAPE_MARGIN = 12;
const PAPER = [
  { size: 'A4', widthMm: 210, heightMm: 297 },
  { size: 'Letter', widthMm: 215.9, heightMm: 279.4 },
];
const MM_TO_PX = 96 / 25.4;
/** Never shrink a page below this — past it the tables stop being readable
 *  at arm's length, which is the whole point of these sheets. */
const MIN_ZOOM = 0.74;

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

marked.setOptions({ gfm: true, breaks: false });

/** Wraps ⚠-prefixed paragraphs in a callout so warnings survive the print. */
function renderMarkdown(md) {
  const html = marked.parse(md);
  return html.replace(
    /<p>(\s*(?:<strong>)?\s*⚠[\s\S]*?)<\/p>/g,
    '<div class="callout"><p>$1</p></div>',
  );
}

/** The note's own cover page opens by restating the title in bold; the cover
 *  template already sets it as the <h1>, so drop the duplicate. */
function stripDuplicateTitle(markdown, title) {
  const normalise = (v) => v.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const lines = markdown.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first === -1) return markdown;

  const candidate = lines[first].trim().replace(/^\*\*|\*\*$/g, '').trim();
  if (normalise(candidate) && normalise(candidate) === normalise(title)) {
    return lines.slice(first + 1).join('\n').trim();
  }
  return markdown;
}

function coverHtml(item, page) {
  const source = page ? stripDuplicateTitle(page.markdown, item.name) : `**${item.name}**`;
  const body = renderMarkdown(source);
  return `
    <section class="sheet">
      <div class="cover">
        <div>
          <div class="cover__logo">${logo}</div>
          <h1 class="cover__title">${escapeHtml(item.name)}</h1>
          <div class="cover__rule"></div>
          <div class="cover__body">${body}</div>
        </div>
        <div class="cover__meta">
          <span>${catalog.merchant.name}</span>
          <span>${item.pageCount} pages</span>
        </div>
      </div>
    </section>`;
}

function interiorHtml(item, page, landscapePages) {
  const landscape = landscapePages.includes(page.number);
  return `
    <section class="sheet${landscape ? ' sheet--landscape' : ''}">
      <p class="page__eyebrow">${escapeHtml(item.name)}</p>
      <h1 class="page__heading">${escapeHtml(page.heading)}</h1>
      <div class="page__body">${renderMarkdown(page.markdown)}</div>
    </section>`;
}

function pageRules(paper) {
  const { widthMm: w, heightMm: h } = paper;
  const portraitH = h - MARGIN.top - MARGIN.bottom;
  return {
    css: `
      @page { size: ${w}mm ${h}mm; margin: ${MARGIN.top}mm ${MARGIN.side}mm ${MARGIN.bottom}mm; }
      @page landscape { size: ${h}mm ${w}mm; margin: ${LANDSCAPE_MARGIN}mm; }
      :root { --sheet-h: ${portraitH}mm; }
    `,
    portrait: {
      width: (w - MARGIN.side * 2) * MM_TO_PX,
      height: portraitH * MM_TO_PX,
    },
    landscape: {
      width: (h - LANDSCAPE_MARGIN * 2) * MM_TO_PX,
      height: (w - LANDSCAPE_MARGIN * 2) * MM_TO_PX,
    },
  };
}

function documentHtml(item, pages, landscapePages, paper) {
  const [first, ...rest] = pages;
  const sections = [
    coverHtml(item, first),
    ...rest.map((page) => interiorHtml(item, page, landscapePages)),
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(item.name)}</title>
<style>${printCss}</style>
<style>${pageRules(paper).css}</style>
</head><body>${sections.join('\n')}</body></html>`;
}

/**
 * Shrinks any sheet taller than its printable box until it fits, so a "6 page
 * PDF" is exactly six pages on both paper sizes. Runs in the page because it
 * needs to re-measure after each reflow.
 */
async function fitSheets(page, box) {
  return page.evaluate(
    ({ portrait, landscape, minZoom }) => {
      // `zoom` reflows content, and scrollHeight is reported in the element's
      // own (already zoomed) coordinate space — so it never shows the shrink.
      // getBoundingClientRect is in parent coordinates and does.
      const heightOf = (el) => el.getBoundingClientRect().height;
      const results = [];

      for (const [index, sheet] of [...document.querySelectorAll('.sheet')].entries()) {
        const avail = sheet.classList.contains('sheet--landscape')
          ? landscape.height
          : portrait.height;

        let zoom = 1;
        for (let attempt = 0; attempt < 8; attempt++) {
          const height = heightOf(sheet);
          if (height <= avail - 0.5) break;
          zoom = Math.max(minZoom, zoom * (avail / height) * 0.99);
          sheet.style.zoom = String(zoom);
          if (zoom <= minZoom) break;
        }

        results.push({
          page: index + 1,
          zoom: Number(zoom.toFixed(3)),
          fits: heightOf(sheet) <= avail + 0.5,
        });
      }
      return results;
    },
    { portrait: box.portrait, landscape: box.landscape, minZoom: MIN_ZOOM },
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const footerTemplate = (item) => `
  <div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#6B6259;
              padding:0 14mm;display:flex;justify-content:space-between;">
    <span>${escapeHtml(item.name)} · ${escapeHtml(catalog.merchant.name)}</span>
    <span class="pageNumber"></span>
  </div>`;

/**
 * Prefer the Chromium already in the image. Playwright pins a build number and
 * will refuse a mismatch, so point it at the binary explicitly when one is
 * there; fall back to Playwright's own download everywhere else (CI, laptops).
 */
function resolveChromium() {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH && join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
    '/opt/pw-browsers/chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const singles = catalog.items.filter((i) => i.type === 'single');
  const targets = only.length ? singles.filter((i) => only.includes(i.sku)) : singles;

  if (targets.length === 0) {
    console.error(only.length ? `no products matched: ${only.join(', ')}` : 'no products in catalog');
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const built = [];
  const fitReport = [];
  const fitWarnings = [];

  try {
    for (const item of targets) {
      const landscapePages = Array.isArray(item.landscapePages) ? item.landscapePages : [];

      for (const paper of PAPER) {
        const box = pageRules(paper);
        const html = documentHtml(item, item.pages, landscapePages, paper);
        if (paper.size === 'A4') writeFileSync(join(outDir, `${item.sku}.debug.html`), html);

        const page = await browser.newPage({
          viewport: { width: Math.round(box.portrait.width), height: Math.round(box.portrait.height) },
        });
        await page.setContent(html, { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });

        const fitted = await fitSheets(page, box);
        for (const sheet of fitted) {
          if (!sheet.fits) {
            fitWarnings.push(`${item.sku} ${paper.size}: page ${sheet.page} still overflows at min zoom`);
          } else if (sheet.zoom < 1) {
            fitReport.push(`${item.sku} ${paper.size} p${sheet.page} @ ${(sheet.zoom * 100).toFixed(0)}%`);
          }
        }

        const file = join(outDir, `${item.sku}-${paper.size}.pdf`);
        await page.pdf({
          path: file,
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: footerTemplate(item),
        });
        await page.close();

        built.push({
          sku: item.sku,
          size: paper.size,
          file,
          bytes: statSync(file).size,
          expectedPages: item.pageCount,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    builtAt: new Date().toISOString(),
    files: built.map(({ sku, size, file, bytes, expectedPages }) => ({
      sku,
      size,
      name: file.split('/').pop(),
      bytes,
      pages: expectedPages,
    })),
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const b of built) {
    console.log(`  ${b.sku.padEnd(36)} ${b.size.padEnd(7)} ${(b.bytes / 1024).toFixed(0).padStart(5)} KB`);
  }
  console.log(`\n${built.length} PDF(s) -> private/downloads/`);

  if (fitReport.length) {
    console.log(`\nauto-fit applied to ${fitReport.length} page(s):`);
    for (const line of fitReport) console.log(`  ${line}`);
  }
  if (fitWarnings.length) {
    console.log('\n⚠ pages that could not be fitted — trim the source note:');
    for (const line of fitWarnings) console.log(`  ${line}`);
  }

  const gaps = targets.filter((i) => i.status !== 'ready');
  if (gaps.length) {
    console.log('\n⚠ built with known content gaps:');
    for (const g of gaps) console.log(`  ${g.sku}: ${g.contentGap ?? 'status is ' + g.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
