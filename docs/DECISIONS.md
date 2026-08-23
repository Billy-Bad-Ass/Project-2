# Decisions

Why things are the way they are, for whoever changes them next.

## Stripe is the orders database

There is no `orders` table. Entitlement is derived from the Checkout Session on every
request, and `/api/download` re-checks with Stripe before streaming.

**Why:** no schema, no migrations, no sync bugs, and a refund revokes access
automatically because the live check fails. For a catalogue of four products this is
strictly better than owning a database.

**Cost:** a download link needs a session id, so link recovery goes through the receipt
email or support rather than a self-service form. Accepted — see below.

## Download links are signed and expire in 72 hours

`lib/download-token.ts` mints an HMAC-signed token carrying the session id, the file
name and an expiry. Three gates on redemption: signature, Stripe says paid, and the
session actually entitles that file.

**Why three:** the signature alone would let a leaked link live forever. The Stripe
check alone would let someone swap the file name in the URL. Each gate covers a
different attack.

**Why 72 hours and not permanent:** links get pasted into Discord. Long enough that
almost nobody hits the limit, short enough that a leak has a shelf life.

## No self-service link recovery

Considered and rejected: a form where a buyer enters their email and gets their files.
Anyone could enter anyone's address. Doing it safely requires emailing the links rather
than displaying them, which requires an email provider, which is optional here.

Recovery is: the receipt email, or support with the order reference.

## The product notes are the single source of truth

One markdown file per product holds the frontmatter, the printable pages *and* the
marketplace listing copy. `scripts/build-catalog.mjs` parses it into
`catalog/generated.json`, which the storefront, the PDF build and the Stripe sync all
read.

**Why:** the alternative is the same description living in the PDF, the storefront, the
Stripe product and the Etsy listing, drifting apart. Here, editing the note updates all
four.

**Cost:** a parser to maintain (`scripts/lib/note-parser.mjs`), and a generated file
that must be committed and kept fresh — CI fails if it is stale.

## Generated catalogue is committed

`catalog/generated.json` is a build artefact but lives in git.

**Why:** `next build` never has to parse markdown, the diff of a content change shows
exactly what the storefront will render, and the Stripe sync can run without a build
step. CI regenerates it and fails if the committed copy differs.

## PDFs are auto-fitted to their page count

Each sheet is measured against the printable box and shrunk with CSS `zoom` if it
overflows, down to a floor of 74%.

**Why:** the listings promise "6-page PDF" and buyers count. Without this the same
content produced 6 pages on A4 and 8 on US Letter, which makes the listing wrong on one
of them.

**Why a floor:** below ~74% the reference tables stop being readable at arm's length,
which is what the product is for. Hitting the floor is a signal to trim the note, not
to lower the floor. `npm run pdf:check` enforces this in CI.

Measurement uses `getBoundingClientRect()`, not `scrollHeight` — `zoom` reflows content
but `scrollHeight` is reported in the element's own already-zoomed coordinate space, so
it never shows the shrink and the fitting loop silently does nothing.

## Prices carry `lookup_key`, and checkout falls back to inline price data

`/api/checkout` looks the price up by `lookup_key` (the sku) so the Stripe dashboard is
authoritative for what a buyer is charged. If no synced price exists it builds inline
`price_data` from the catalogue.

**Why the fallback:** the store sells on a fresh Stripe account before anyone has run
the sync. Without it, a new deploy takes no money until someone remembers a CLI step.

## Product files live in R2, not on the filesystem

Cloudflare Workers has no filesystem, so `app/api/download` reads from a private R2
bucket through `lib/storage.ts`, which falls back to `private/downloads/` when no
binding is present.

**Why R2 rather than bundling the PDFs into the Worker:** the six files are ~780 KB
today, which would fit inside the Worker size limit — but it would put a hard ceiling
on the catalogue, and every product change would need a redeploy rather than an
upload. R2 also has free egress, which is the whole economics of selling files.

**Why not Workers static assets:** those are served publicly by design. The paywall
is the download route; anything reachable without going through it is free product.
The same reasoning is why the R2 bucket must never get a public URL.

**Cost of the split:** two code paths, and a deploy step (`npm run pdf:upload`) that
is easy to forget. `/api/health` exists specifically to catch that — it reports which
backend is live and which files are missing, so "deployed but never uploaded" is one
curl away rather than a customer complaint.

## No CSS framework

Hand-written CSS with custom properties, in `app/globals.css` for the screen and
`scripts/lib/print-styles.mjs` for the PDFs.

**Why:** six pages. The print layouts need exact millimetre control that utility
classes fight. The whole site ships ~103 kB of JS, and one client component.

## Workers-compatible Stripe calls everywhere

The webhook uses `constructEventAsync` and the client uses
`Stripe.createFetchHttpClient()`.

**Why unconditionally rather than branching on runtime:** Workers has no synchronous
crypto and no Node http stack, so the sync forms simply fail there. Both async forms
work identically on Node, so a runtime check would add a branch that is never
exercised on one side and can silently rot.

## Verification is built into the agent workflows

Every workflow that produces findings checks them adversarially before reporting:
market findings get their evidence challenged, release blockers get reproduced, listing
copy gets fact-checked against the note.

**Why:** an unverified market finding leads to a mispriced product, a false blocker
costs a deploy, and a listing that overclaims generates refunds. For a business whose
entire pitch is being honest about what will not work, an agent that confidently makes
things up is the specific failure that would kill it.

## Vendored repos are cloned, not committed

`npm run agents:bootstrap` clones the eight reference repositories into `vendor/`,
which is gitignored. Only ten agency-agents subagents are materialised into
`.claude/agents/vendor/`, with their frontmatter normalised.

**Why:** those repos total ~330 MB and are all actively maintained. Cloning keeps them
updatable and keeps this repository small. The two things actually depended on — eleven
Font Awesome glyphs and ten role agents — are checked in so the repo works without the
bootstrap having been run.
