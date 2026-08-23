/**
 * Typed access to catalog/generated.json — the artefact produced by
 * `npm run catalog:build` from content/products/*.md + catalog/products.json.
 *
 * Never edit generated.json by hand; edit the note or the metadata and rebuild.
 */
import generated from '@/catalog/generated.json';
import previewManifest from '@/catalog/previews.json';

export type CatalogFile = {
  name: string;
  size: 'A4' | 'Letter' | string;
  label: string;
};

export type Review = {
  rating: number;
  author: string;
  location: string;
  date: string;
  verified: boolean;
  text: string;
};

export type Rating = { count: number; average: number };

export type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] };

export type CatalogItem = {
  type: 'single' | 'bundle';
  sku: string;
  name: string;
  subtitle: string;
  blurb: string;
  listingTitle: string;
  description: string;
  descriptionBlocks: DescriptionBlock[];
  tags: string[];
  priceMinor: number;
  currency: string;
  pageCount: number;
  badge: string | null;
  accent: string;
  icon: string;
  order: number;
  status: 'ready' | 'needs-content' | string;
  contentGap: string | null;
  files: CatalogFile[];
  savingMinor?: number;
  includes?: string[];
  pages?: { number: number; heading: string; markdown: string }[];
  landscapePages?: number[];
  sourceNote?: string;
  reviews: Review[];
  rating: Rating | null;
};

export type Merchant = {
  name: string;
  tagline: string;
  supportEmail: string;
};

const catalog = generated as unknown as {
  merchant: Merchant;
  currency: string;
  items: CatalogItem[];
  warnings: string[];
};

export const merchant = catalog.merchant;
export const currency = catalog.currency;

/** Everything in the catalogue, in display order — sellable or not. */
export const items: CatalogItem[] = [...catalog.items].sort((a, b) => a.order - b.order);

/**
 * A product with a known content gap must not be buyable.
 *
 * Tying this to `status` rather than a separate flag means the gap that the
 * build already reports is the same thing that blocks the sale — and the
 * product becomes sellable again the moment the note is finished, with nothing
 * else to remember. Archiving the Stripe price alone would not do it: checkout
 * falls back to inline price data precisely so a fresh account can still sell.
 */
export const isSellable = (item: CatalogItem) => item.status === 'ready';

export const singles = items.filter((i) => i.type === 'single');
export const bundles = items.filter((i) => i.type === 'bundle');

/** What the shop actually offers. */
export const listed = items.filter(isSellable);

export function getItem(sku: string): CatalogItem | undefined {
  return items.find((i) => i.sku === sku);
}

/** The files a purchase of `sku` entitles the buyer to. */
export function filesFor(sku: string): CatalogFile[] {
  return getItem(sku)?.files ?? [];
}

/** Locale drives the symbol and its placement, so it has to follow the currency
 *  rather than being fixed — 'en-GB' formats USD as "US$9.45", not "$9.45". */
const LOCALES: Record<string, string> = {
  usd: 'en-US',
  gbp: 'en-GB',
  eur: 'en-IE',
  cad: 'en-CA',
  aud: 'en-AU',
};

export type Preview = {
  name: string;
  kind: 'cover' | 'page' | string;
  page: number;
  heading: string;
  width: number;
};

const previews = previewManifest as unknown as Record<string, Preview[]>;

/**
 * Shop images for a product, generated from the same HTML as the PDF so they
 * cannot drift from what the buyer receives. Interior shots are deliberately
 * cropped — see scripts/build-previews.mjs.
 */
export function previewsFor(sku: string): Preview[] {
  return previews[sku] ?? [];
}

export const previewUrl = (preview: Preview) => `/previews/${preview.name}`;

export function formatPrice(minor: number, code: string = currency): string {
  const key = code.toLowerCase();
  return new Intl.NumberFormat(LOCALES[key] ?? 'en-US', {
    style: 'currency',
    currency: code.toUpperCase(),
    // Whole amounts read better without ".00"; anything else keeps its pence.
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
