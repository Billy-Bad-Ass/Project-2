#!/usr/bin/env node
/**
 * Renders product preview images from the same HTML the PDFs are built from.
 *
 *   npm run previews:build
 *
 * Printables sell on previews — nobody buys a guide they cannot see. These are
 * generated rather than hand-made so they can never drift from what is actually
 * delivered: change the note, rebuild, and the shop images follow.
 *
 * Two sizes, on purpose:
 *
 *   cover  — sharp, cropped to its content. It is the poster for the product.
 *   page   — sharp, but only the top of the page. The reference page IS the
 *            product on these guides ("Page 2 is the card. The rest is why it
 *            works"), so a full legible preview would remove any reason to buy.
 *            A top crop shows the real layout and quality and withholds the
 *            payload; the storefront fades the cut edge so it reads as a
 *            deliberate teaser rather than a broken image.
 *
 * Output goes to public/previews/ and is served publicly, unlike the PDFs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'previews');
const debugDir = join(root, 'private', 'downloads');
const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'generated.json'), 'utf8'));

const MM_TO_PX = 96 / 25.4;
const SHEET = { width: (210 - 28) * MM_TO_PX, height: (297 - 30) * MM_TO_PX };

/** Cover big enough to read the title; interiors small enough not to give the
 *  reference tables away. */
const COVER_WIDTH = 900;
const PAGE_WIDTH = 720;
/** Fraction of an interior page included in its preview. */
const PAGE_CROP = 0.46;
/** How many interior pages to show beyond the cover. */
const INTERIOR_COUNT = 3;

function resolveChromium() {
  for (const candidate of [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH && join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
    '/opt/pw-browsers/chromium',
  ].filter(Boolean)) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function main() {
  const products = catalog.items.filter((item) => item.type === 'single');

  const missing = products.filter((p) => !existsSync(join(debugDir, `${p.sku}.debug.html`)));
  if (missing.length) {
    console.error(`No rendered source for: ${missing.map((p) => p.sku).join(', ')}`);
    console.error('Run `npm run pdf:build` first — previews come from the same HTML.');
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const manifest = {};

  try {
    for (const product of products) {
      const html = readFileSync(join(debugDir, `${product.sku}.debug.html`), 'utf8');
      const shots = [];

      for (const [index, spec] of planFor(product).entries()) {
        const page = await browser.newPage({
          viewport: { width: Math.round(SHEET.width), height: Math.round(SHEET.height) },
          // Render at the sheet's own size and scale the output via the clip,
          // so the file really is `spec.width` across. Setting a viewport of
          // one size and a scale factor of another produced images far larger
          // than intended — and therefore readable.
          deviceScaleFactor: spec.width / SHEET.width,
        });
        await page.setContent(html, { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });
        await fitSheets(page);

        const sheets = await page.locator('.sheet').all();
        const sheet = sheets[spec.pageIndex];
        if (!sheet) {
          await page.close();
          continue;
        }

        const clip = await clipFor(page, sheet, spec);
        if (!clip) {
          await page.close();
          continue;
        }

        const name = `${product.sku}-${spec.kind}-${index + 1}.png`;
        // fullPage is required: the sheets stack vertically, so every page
        // after the first sits below the viewport and a clip there would be
        // "outside the resulting image".
        await page.screenshot({ path: join(outDir, name), clip, fullPage: true });
        await page.close();

        shots.push({
          name,
          kind: spec.kind,
          page: spec.pageIndex + 1,
          heading: spec.heading,
          width: Math.round(clip.width * (spec.width / SHEET.width)),
          bytes: statSync(join(outDir, name)).size,
        });
      }

      manifest[product.sku] = shots;
      const kb = shots.reduce((n, s) => n + s.bytes, 0) / 1024;
      console.log(`  ${product.sku.padEnd(36)} ${String(shots.length).padStart(2)} images  ${kb.toFixed(0).padStart(5)} KB`);
    }
  } finally {
    await browser.close();
  }

  // The manifest lives in catalog/ rather than public/ so the storefront can
  // import it as typed data instead of fetching it at runtime.
  writeFileSync(
    join(root, 'catalog', 'previews.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log('\npreviews -> public/previews/, manifest -> catalog/previews.json');
}

/**
 * Cover, then the pages worth showing. Skips the last page of every guide —
 * those are the blank log sheets, which look empty and sell nothing.
 */
function planFor(product) {
  const pages = product.pages ?? [];
  const plan = [{ kind: 'cover', pageIndex: 0, width: COVER_WIDTH, heading: pages[0]?.heading ?? 'Cover' }];

  const interiors = pages
    .map((page, index) => ({ page, index }))
    .slice(1, Math.max(1, pages.length - 1))
    .slice(0, INTERIOR_COUNT);

  for (const { page, index } of interiors) {
    plan.push({ kind: 'page', pageIndex: index, width: PAGE_WIDTH, heading: page.heading });
  }
  return plan;
}

/**
 * The region of the page to capture.
 *
 * Covers are trimmed to where their content actually ends — the printed cover
 * is deliberately airy, which is right on paper and looks unfinished as a
 * thumbnail. Interior pages are cut at PAGE_CROP.
 */
async function clipFor(page, sheet, spec) {
  const box = await sheet.boundingBox();
  if (!box) return null;

  if (spec.kind === 'cover') {
    const contentBottom = await page.evaluate(() => {
      const body = document.querySelector('.cover__body');
      return body ? body.getBoundingClientRect().bottom : null;
    });
    const height = contentBottom ? contentBottom - box.y + 36 : box.height;
    return { x: box.x, y: box.y, width: box.width, height: Math.min(height, box.height) };
  }

  return { x: box.x, y: box.y, width: box.width, height: box.height * PAGE_CROP };
}

/** Same auto-fit the PDF build applies, so previews match the printed pages. */
async function fitSheets(page) {
  await page.evaluate((avail) => {
    const heightOf = (el) => el.getBoundingClientRect().height;
    for (const sheet of document.querySelectorAll('.sheet')) {
      let zoom = 1;
      for (let attempt = 0; attempt < 8; attempt++) {
        const height = heightOf(sheet);
        if (height <= avail - 0.5) break;
        zoom = Math.max(0.74, zoom * (avail / height) * 0.99);
        sheet.style.zoom = String(zoom);
        if (zoom <= 0.74) break;
      }
    }
  }, SHEET.height);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
