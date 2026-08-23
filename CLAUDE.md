# BBA Network store — working notes

A Next.js storefront selling printable reference guides as digital downloads, with an
agent fleet that maintains it. Read `docs/AGENTS.md` before doing agent work and
`docs/DECISIONS.md` before changing architecture.

## The one thing to understand first

`content/products/*.md` is the source of truth. Each note holds the frontmatter, the
printable pages **and** the marketplace listing copy. Everything else is derived:

```
content/products/*.md + catalog/products.json
        │  npm run catalog:build
        ▼
catalog/generated.json          ← committed, never hand-edited
        ├──► the storefront (lib/catalog.ts)
        ├──► the PDFs        (npm run pdf:build)
        └──► Stripe          (npm run stripe:sync)
```

Editing `catalog/generated.json` directly is always wrong — the next build overwrites
it, and CI fails if the committed copy is stale.

## After changing content

```bash
npm run catalog:build   # read the warnings, they are the point
npm run pdf:build
npm run pdf:check       # page counts must match what the listings promise
npm test
```

If it is already deployed, also `npm run pdf:upload && npm run cf:deploy` — the
PDFs live in R2, not in the bundle, so a deploy alone does not update them.

## Rules that are load-bearing

- **Never invent product content.** A wrong paint name, temperature or click count in a
  reference card is the worst failure this product line has. Flag gaps as `contentGap`
  in the note's frontmatter instead.
- **Page count is a promise.** Listings say "6-page PDF" and buyers count. If a page
  will not fit, trim the note — do not lower `MIN_ZOOM` in `scripts/build-pdfs.mjs`.
- **Never write to live-mode Stripe** without an explicit human go-ahead.
  `scripts/stripe-sync.mjs` guards this; do not route around it.
- **The four download gates stay.** `app/api/download/route.ts` checks signature,
  Stripe-says-paid, not-refunded, and entitlement. Removing any one is a security
  regression. "Paid" means `payment_status`, never `status: 'complete'` — Klarna and
  Cash App complete the session before the money lands.
- **Prices are pence.** `500` is £5.00.
- **The R2 bucket stays private.** No public bucket URL. The paywall is the download
  route; anything reachable around it is free product.
- **Stripe calls use the async/fetch forms** (`constructEventAsync`,
  `createFetchHttpClient`). Workers has no sync crypto and no Node http stack, and
  the sync forms fail only at runtime on a real payment.

## Known gaps

- `miniature-speedpaint-recipe-sheet` is missing its eight recipe tables; they exported
  empty. See `docs/RUNBOOK.md`. Do not fill them in from general knowledge.

## Conventions

- British spelling in all customer-facing copy and product content.
- Server components by default; `BuyButton` is the only client component.
- Hand-written CSS with custom properties — no framework, and both light and dark
  values for every colour token.
- Comments explain *why*, not what. The codebase is deliberately light on them.
