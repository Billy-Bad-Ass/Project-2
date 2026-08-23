# BBA Network — digital marketplace

A storefront for selling printable reference guides as digital downloads. Next.js,
Stripe Checkout, PDFs generated from markdown, and an agent fleet that researches the
market, refreshes listings and verifies releases on a schedule.

```
content/products/*.md  →  catalog/generated.json  →  PDFs + storefront + Stripe
        the notes            one merged artefact         three outputs, one source
```

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in the Stripe keys and a signing secret
npm run catalog:build             # notes + prices → catalog/generated.json
npm run pdf:build                 # → private/downloads/*.pdf (A4 + US Letter)
npm run dev                       # → http://localhost:3000
```

To take a real test payment, run the Stripe CLI in a second terminal so webhooks reach
you, and paste the `whsec_...` it prints into `.env.local`:

```bash
npm run stripe:listen
```

Then buy something with card `4242 4242 4242 4242`, any future expiry, any CVC.

## How it fits together

| Path | What it is |
| --- | --- |
| `content/products/*.md` | **The source of truth.** One note per product: frontmatter, the printable pages, and the marketplace listing copy. |
| `catalog/products.json` | Commercial metadata only — price, display order, icon, accent. |
| `catalog/generated.json` | Built artefact merging the two. Committed; never edited by hand. |
| `scripts/build-catalog.mjs` | Parses the notes and merges. Prints warnings you should read. |
| `scripts/build-pdfs.mjs` | Renders each note to A4 and US Letter via headless Chromium. |
| `scripts/stripe-sync.mjs` | Pushes the catalogue to Stripe, idempotently. Dry run by default. |
| `app/` | The storefront. Server components throughout, one client component. |
| `lib/download-token.ts` | Signed, expiring download links. |
| `private/downloads/` | Generated PDFs. Outside `public/` on purpose. |
| `.claude/` | Subagents, workflows and slash commands — see [docs/AGENTS.md](docs/AGENTS.md). |

## How delivery works

There is **no orders database**. Stripe is the order record, and entitlement is
derived from the Checkout Session every time.

1. A buyer pays. Stripe redirects to `/success?session_id=...`.
2. The success page retrieves the session, confirms it is paid, and mints HMAC-signed
   download links valid for 72 hours.
3. `/api/download` re-checks all three gates before streaming a byte: valid unexpired
   signature, Stripe still reports the session paid, and that session's entitlements
   include the requested file.
4. The webhook emails the same links, if `RESEND_API_KEY` is configured. Without it the
   store still works — the success page is the delivery route.

A refunded order stops working on its own, because gate 2 is checked live rather than
trusted from a stored flag.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `catalog:build` first) |
| `npm test` | Unit tests — parser, tokens, entitlements, catalogue integrity |
| `npm run catalog:build` | Rebuild `catalog/generated.json` from the notes |
| `npm run pdf:build` | Rebuild the product PDFs |
| `npm run pdf:check` | Verify every PDF matches the page count its listing promises |
| `npm run stripe:sync` | Dry-run the Stripe catalogue sync (`-- --apply` to write) |
| `npm run workflows:check` | Validate the agent workflow scripts |
| `npm run agents:bootstrap` | Clone the reference repos into `vendor/` |

## Agents

Five GitHub Actions run the fleet on a schedule — market intelligence weekly, revenue
digest weekly, listing refresh monthly, release check on tags, and `@claude` mentions
on issues and PRs. Nothing writes to live Stripe or changes a price without a human.

Read [docs/AGENTS.md](docs/AGENTS.md) for the full map, the required secrets, and the
guardrails.

## Deploying

Any Node host works; the store is a stock Next.js app. On Vercel:

1. Import the repo, framework preset **Next.js**, no build overrides needed.
2. Set every variable from `.env.example` in the project settings.
3. Add a Stripe webhook at `https://<domain>/api/stripe/webhook` subscribed to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `charge.refunded`. Put its signing
   secret in `STRIPE_WEBHOOK_SECRET`.
4. `NEXT_PUBLIC_SITE_URL` must be the real domain — a wrong value silently breaks the
   download links in delivery emails while the site itself looks fine.

The PDFs are build output and gitignored, so the deploy must run `npm run pdf:build`.
`next.config.mjs` already bundles `private/downloads/` with the download function.

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for going live, and
[docs/DECISIONS.md](docs/DECISIONS.md) for why things are built this way.

## Status

| | |
| --- | --- |
| Storefront, checkout, delivery | Working end to end |
| Stripe catalogue | Seeded in **test mode**; one command to replicate to live |
| Espresso and keyboard guides | Complete, 6 pages each, both paper sizes |
| Miniature guide | **Recipe tables are missing** — see `docs/RUNBOOK.md` |
| Logo | **Placeholder** — see `brand/README.md` |

## Licence

Product content in `content/` is © BBA Network, all rights reserved. The code is
yours to do with as you like. Third-party attribution is in [NOTICE.md](NOTICE.md).
