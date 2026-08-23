# Runbook

Everything between "the code works" and "the business takes money".

## 1. The two things blocking a real launch

### The logo is a placeholder

The brief mentioned a logo, but only the three product markdown files arrived — no
image came through. `brand/logo.svg` and `brand/logo-mark.svg` are placeholders built
from the business name.

Replacing it is a two-file change; see `brand/README.md`. Nothing else hardcodes it.

### The miniature guide is missing its recipe tables

`content/products/miniature-speedpaint-recipe-sheet.md` exported with **83 empty table
rows across 11 tables**. The prose, the method, the troubleshooting page and the blank
recipe sheet are all intact — but the eight actual paint recipes on pages 2–5 are gone,
along with the paint and brush lists on page 3.

The build detects this and says so, the frontmatter records it as `contentGap`, and the
storefront marks the product `needs-content`. **The PDF currently generates without
them**, which means it is not sellable as described: the listing promises "8 full army
recipes" and the file does not contain them.

Those recipes only exist in the author's notes. To fix:

1. Fill the tables in the note. Each recipe wants two columns — part → paint — covering
   the parts the blank sheet on page 8 lists: armour, cloth, metal, leather, skin,
   weapon, spot colour, highlight, and the base steps.
2. `npm run catalog:build` — the warning count should drop to zero for that file.
3. `npm run pdf:build && npm run pdf:check` — the page count must still be 8.
4. Change `status: needs-content` to `status: ready` in the frontmatter.

Until then, either hold that product back or trim the listing to describe what the file
actually contains. Selling it as-is generates refunds.

## 2. Going live with Stripe

The catalogue is already seeded in **test mode** on the BBA Network account
(`acct_1U7Km3R7EyLACZsr`) — four products, four GBP prices, each with `lookup_key`
equal to its sku.

```
espresso-dial-in-card                £5
keyboard-sound-mod-chart             £6
miniature-speedpaint-recipe-sheet    £7
complete-bundle                      £14   (saves £4)
```

### Test the whole path first

```bash
cp .env.example .env.local     # test key, plus a real DOWNLOAD_SIGNING_SECRET
npm run stripe:listen          # paste the whsec_ it prints into .env.local
npm run dev
```

Buy with `4242 4242 4242 4242`. You are checking four things:

1. Checkout opens with the **synced** price, not the inline fallback. `/api/checkout`
   returns `usedSyncedPrice: true` when the lookup key resolved.
2. The success page lists both A4 and Letter links.
3. The links download real PDFs.
4. `npm run stripe:listen` logs the webhook and the delivery attempt.

Then check the links **fail** correctly: edit a character in a token (403), and confirm
`/api/download` with no token gives 400.

### Then go live

```bash
STRIPE_SECRET_KEY=sk_live_... npm run stripe:sync                    # dry run, read it
STRIPE_SECRET_KEY=sk_live_... STRIPE_SYNC_CONFIRM=yes \
  npm run stripe:sync -- --apply
```

The confirmation variable is a deliberate speed bump. Live-mode products and prices are
separate objects from test mode — the sync recreates them, it does not copy them.

Before switching the deployed environment to the live key:

- [ ] A live webhook endpoint exists at `https://<domain>/api/stripe/webhook`
- [ ] `STRIPE_WEBHOOK_SECRET` is the **live** endpoint's secret, not the CLI's
- [ ] `NEXT_PUBLIC_SITE_URL` is the real domain
- [ ] `DOWNLOAD_SIGNING_SECRET` is a fresh `openssl rand -base64 32`, not the example
- [ ] Tax: either `STRIPE_AUTOMATIC_TAX=true` with registrations set up in the
      dashboard, or `false` and prices treated as tax-inclusive. Prices are currently
      created with `tax_behavior: inclusive`.
- [ ] You have done one live £5 purchase yourself and refunded it

## 3. Hosting on Cloudflare

Full guide: **[docs/CLOUDFLARE.md](CLOUDFLARE.md)**. The short version and the two
things that catch people out:

```bash
npx wrangler login
npx wrangler r2 bucket create bba-network-downloads
npx wrangler r2 bucket create bba-network-downloads-preview
npx wrangler secret put STRIPE_SECRET_KEY        # + WEBHOOK_SECRET, DOWNLOAD_SIGNING_SECRET
npm run pdf:build && npm run pdf:upload
npm run cf:deploy
curl https://<worker-url>/api/health              # ok:true, backend:r2, missing:[]
```

**Catch one: `npm run pdf:upload` is part of every deploy.** Workers has no
filesystem. Deploy without it and the store takes money, then 500s on the download.

**Catch two: the R2 bucket must stay private.** No public bucket URL, no custom
domain on the bucket. Everything in it is paid product and the paywall is the
download route.

### The domain

Not registered yet. Cloudflare dashboard → Domain Registration → Register Domain
(sold at cost, WHOIS privacy free). Then attach it to the Worker under
Settings → Domains & Routes, update `NEXT_PUBLIC_SITE_URL` in `wrangler.jsonc`,
redeploy, and repoint the Stripe webhook. Steps in detail in
[docs/CLOUDFLARE.md](CLOUDFLARE.md).

Until then the `*.workers.dev` URL runs the full payment path, test purchase
included.

## 4. Delivery email

Optional. Without it the success page is the only delivery route, which works but
means a buyer who closes the tab has to email you.

Set `RESEND_API_KEY` and `DELIVERY_FROM_EMAIL` (a verified sender on your domain).
`lib/email.ts` sends through Resend over plain `fetch` — no SDK dependency. Any other
provider is a one-function swap.

## 5. Routine operations

| When | Do |
| --- | --- |
| Content changed | `/rebuild` — or `npm run catalog:build && npm run pdf:build && npm run pdf:check` |
| Content changed, deployed | Also `npm run pdf:upload` then `npm run cf:deploy` |
| Anything looks wrong in prod | `curl https://<domain>/api/health` first |
| Price changed | Edit `catalog/products.json`, rebuild, `stripe:sync` dry run, then apply |
| Before deploying | `/release-check` |
| Weekly | The market-intel and revenue-digest Actions run themselves; read the PR and issue |
| Monthly | Listing refresh Action opens a PR; check the fact-check results before merging |
| Buyer reports an error in a guide | `content-editor` agent. Buyers get corrected versions free. |
| Expired link ticket | Send them `/success?session_id=<their reference>` |

## 6. Optional: Buzz for human/agent coordination

[block/buzz](https://github.com/block/buzz) is a self-hostable workspace where people
and agents share the same rooms, on a Nostr relay you own. It is cloned to
`vendor/buzz` by the bootstrap but **not wired in** — it is a Rust service with its own
deployment, and this store does not need it to operate.

It is worth it if you get to the point of several agents working concurrently and you
want one audited event log of what they did. Until then the GitHub Actions PRs and
issues are the coordination surface, and they are enough.

## 7. Things deliberately not built

- **An orders database.** Stripe is the record. This removes a whole class of
  consistency bug, and refunds revoke access for free. The cost is that link recovery
  needs the session id.
- **Self-service link recovery by email.** Anyone could enter any address and get
  someone else's files. Recovery goes through support, or through the receipt email.
- **Accounts and logins.** Nobody wants an account to buy a £5 PDF.
- **A CSS framework.** Six pages and two print stylesheets. Hand-written CSS is
  smaller and gives exact control over the PDF layout.
