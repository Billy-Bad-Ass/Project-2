#!/usr/bin/env node
/**
 * Pushes catalog/generated.json into Stripe — idempotently.
 *
 *   node scripts/stripe-sync.mjs            # dry run, prints the plan
 *   node scripts/stripe-sync.mjs --apply    # make the changes
 *
 * Products are matched on metadata.sku, prices on lookup_key. Stripe prices are
 * immutable, so a price change creates a new price, moves the lookup_key onto
 * it (`transfer_lookup_key`) and archives the old one. Nothing is ever deleted,
 * so historical orders keep resolving.
 *
 * Reads STRIPE_SECRET_KEY — whichever mode that key belongs to is the mode this
 * writes to. Run it with the test key first.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'generated.json'), 'utf8'));

const apply = process.argv.includes('--apply');
const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.error('STRIPE_SECRET_KEY is not set. Copy .env.example to .env.local and source it.');
  process.exit(1);
}

const live = key.startsWith('sk_live_');
const stripe = new Stripe(key, { maxNetworkRetries: 2 });

/** Digital goods / e-book tax code. Change if your accountant says otherwise. */
const TAX_CODE = process.env.STRIPE_TAX_CODE ?? 'txcd_10502000';

function describe(item) {
  const lines = [item.blurb, '', `${item.pageCount} pages · A4 and US Letter · instant download.`];
  return lines.join('\n').slice(0, 500);
}

function metadataFor(item) {
  const meta = {
    sku: item.sku,
    type: item.type === 'bundle' ? 'digital-download-bundle' : 'digital-download',
    pages: String(item.pageCount),
  };
  if (item.includes?.length) meta.includes = item.includes.join(',');
  else meta.files = item.files.map((f) => f.name).join(',');
  return meta;
}

async function findProduct(sku) {
  const found = await stripe.products.search({ query: `metadata['sku']:'${sku}'`, limit: 1 });
  return found.data[0] ?? null;
}

async function findPrice(sku) {
  const found = await stripe.prices.list({ lookup_keys: [sku], active: true, limit: 1 });
  return found.data[0] ?? null;
}

const plan = [];
const note = (action, detail) => plan.push({ action, detail });

async function syncItem(item) {
  let product = await findProduct(item.sku);

  if (!product) {
    note('create product', `${item.sku} — ${item.name}`);
    if (apply) {
      product = await stripe.products.create({
        name: item.name,
        description: describe(item),
        metadata: metadataFor(item),
        tax_code: TAX_CODE,
      });
    }
  } else {
    const stale =
      product.name !== item.name ||
      product.description !== describe(item) ||
      product.metadata?.pages !== String(item.pageCount);

    if (stale) {
      note('update product', `${item.sku} — name/description/metadata drifted`);
      if (apply) {
        product = await stripe.products.update(product.id, {
          name: item.name,
          description: describe(item),
          metadata: metadataFor(item),
        });
      }
    } else {
      note('product ok', `${item.sku} (${product.id})`);
    }
  }

  const existing = await findPrice(item.sku);

  if (!existing) {
    note('create price', `${item.sku} — ${item.priceMinor / 100} ${item.currency.toUpperCase()}`);
    if (apply && product) {
      await stripe.prices.create({
        product: product.id,
        currency: item.currency,
        unit_amount: item.priceMinor,
        lookup_key: item.sku,
        tax_behavior: 'inclusive',
        metadata: { sku: item.sku },
      });
    }
    return;
  }

  const changed = existing.unit_amount !== item.priceMinor || existing.currency !== item.currency;
  if (!changed) {
    note('price ok', `${item.sku} (${existing.id}) — ${item.priceMinor / 100}`);
    return;
  }

  note(
    'reprice',
    `${item.sku} — ${(existing.unit_amount ?? 0) / 100} -> ${item.priceMinor / 100} ` +
      `(new price, lookup_key moved, old one archived)`,
  );
  if (apply && product) {
    await stripe.prices.create({
      product: product.id,
      currency: item.currency,
      unit_amount: item.priceMinor,
      lookup_key: item.sku,
      transfer_lookup_key: true,
      tax_behavior: 'inclusive',
      metadata: { sku: item.sku },
    });
    await stripe.prices.update(existing.id, { active: false });
  }
}

async function main() {
  const account = await stripe.accounts.retrieve();
  console.log(
    `${apply ? 'APPLYING to' : 'Dry run against'} ${account.settings?.dashboard?.display_name ?? account.id} ` +
      `· ${live ? 'LIVE MODE' : 'test mode'}\n`,
  );

  if (live && apply && process.env.STRIPE_SYNC_CONFIRM !== 'yes') {
    console.error(
      'Refusing to write to live mode without confirmation.\n' +
        'Re-run with STRIPE_SYNC_CONFIRM=yes once the test-mode run looks right.',
    );
    process.exit(1);
  }

  for (const item of catalog.items) {
    await syncItem(item);
  }

  const width = Math.max(...plan.map((p) => p.action.length));
  for (const entry of plan) {
    console.log(`  ${entry.action.padEnd(width)}  ${entry.detail}`);
  }

  const changes = plan.filter((p) => !p.action.endsWith('ok')).length;
  console.log(
    `\n${changes} change(s)${apply ? ' applied' : ' pending — re-run with --apply'}, ` +
      `${plan.length - changes} already in sync.`,
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
