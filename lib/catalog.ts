/**
 * Typed access to catalog/generated.json — the artefact produced by
 * `npm run catalog:build` from content/products/*.md + catalog/products.json.
 *
 * Never edit generated.json by hand; edit the note or the metadata and rebuild.
 */
import generated from '@/catalog/generated.json';

export type CatalogFile = {
  name: string;
  size: 'A4' | 'Letter' | string;
  label: string;
};

export type CatalogItem = {
  type: 'single' | 'bundle';
  sku: string;
  name: string;
  subtitle: string;
  blurb: string;
  listingTitle: string;
  description: string;
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

/** Everything on sale, in display order. */
export const items: CatalogItem[] = [...catalog.items].sort((a, b) => a.order - b.order);

export const singles = items.filter((i) => i.type === 'single');
export const bundles = items.filter((i) => i.type === 'bundle');

export function getItem(sku: string): CatalogItem | undefined {
  return items.find((i) => i.sku === sku);
}

/** The files a purchase of `sku` entitles the buyer to. */
export function filesFor(sku: string): CatalogFile[] {
  return getItem(sku)?.files ?? [];
}

export function formatPrice(minor: number, code: string = currency): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: code.toUpperCase(),
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
