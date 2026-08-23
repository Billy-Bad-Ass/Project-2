# Deploying to Cloudflare

The store runs on **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare),
with the product PDFs in a private **R2** bucket. Everything it needs is covered
by the Workers Paid plan ($5/month) plus R2's free tier.

## Why R2 and not the filesystem

Workers has no filesystem. On a Node host the download route reads
`private/downloads/*.pdf` off disk; on Workers it reads from the `DOWNLOADS` R2
binding. `lib/storage.ts` picks whichever is available, so `next dev` still works
off disk with no Cloudflare account involved.

**The bucket must stay private.** Do not enable a public bucket URL or attach a
custom domain to it. Everything in it is paid product, and the paywall is the
download route — a public bucket URL bypasses it entirely.

## What it costs

| | Included | This store uses |
| --- | --- | --- |
| Workers requests | 10M/month on the $5 plan | nowhere near it |
| R2 storage | 10 GB/month free | ~800 KB |
| R2 Class A ops (writes) | 1M/month free | 6 per deploy |
| R2 Class B ops (reads) | 10M/month free | 2 per sale |
| Egress | **free on R2** | the whole point |

R2's free egress is the reason this is a better fit than S3 for selling files.

## Deploying without a terminal

Everything below can be done from a browser — including an iPad. The
**Deploy to Cloudflare** GitHub Action does the parts that would otherwise need
a command line: it creates the R2 buckets, builds the PDFs, uploads them and
deploys the Worker.

1. **Cloudflare → My Profile → API Tokens → Create Token**, using the
   *Edit Cloudflare Workers* template. Add **R2 → Edit** to its permissions so
   it can create buckets and upload the PDFs. Copy the token once — it is not
   shown again.
2. **Cloudflare → Workers & Pages.** Copy the **Account ID** from the right-hand
   sidebar, and note your `workers.dev` subdomain.
3. **GitHub → Settings → Secrets and variables → Actions.** Add five repository
   *secrets*: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the deploy
   itself, then the three the Worker needs at runtime — `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET` and `DOWNLOAD_SIGNING_SECRET`.

   The deploy pushes those last three onto the Worker with `wrangler secret put`,
   so GitHub is the only place you need to keep them. Only names that are
   actually present get pushed, so a name you leave out keeps whatever the Worker
   already has; a name you change here overwrites the Worker on the next run,
   which makes this the rotation path too.
4. **GitHub → Actions → Deploy to Cloudflare → Run workflow.** The job summary
   prints the deployed URL and the health result.
5. **GitHub → Settings → Secrets and variables → Actions → Variables.** Add
   `SITE_URL` set to the deployed origin, then run the workflow once more —
   `NEXT_PUBLIC_SITE_URL` is inlined at build time, so it needs a rebuild rather
   than just a variable change.

If you set a runtime secret in the Cloudflare dashboard instead — Workers & Pages
→ `bba-network-store` → Settings → Variables and Secrets — **the type dropdown
must say `Secret`, not `Text`.** A value added as Text is readable by anyone with
dashboard access and, worse, gets printed in full into the GitHub Actions log on
the next deploy, because wrangler diffs local config against remote and shows
what differs. If that happens, treat the value as leaked and rotate it. Secrets
never appear in that diff. Going through GitHub avoids the choice entirely.

The rest of this document is the equivalent from a terminal.

## First deploy (from a terminal)

### 1. Authenticate

```bash
npx wrangler login
```

CI uses a `CLOUDFLARE_API_TOKEN` instead — see below.

### 2. Create the buckets

```bash
npx wrangler r2 bucket create bba-network-downloads
npx wrangler r2 bucket create bba-network-downloads-preview
```

The names must match `wrangler.jsonc`. The preview bucket is what `wrangler dev`
binds to locally.

### 3. Set the secrets

Never put these in `wrangler.jsonc` — it is committed.

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put DOWNLOAD_SIGNING_SECRET   # openssl rand -base64 32
npx wrangler secret put RESEND_API_KEY            # optional
npx wrangler secret put DELIVERY_FROM_EMAIL       # optional
```

Public, non-secret values (`NEXT_PUBLIC_SITE_URL`, `STRIPE_AUTOMATIC_TAX`) live
in the `vars` block of `wrangler.jsonc`.

### 4. Build, upload, deploy

```bash
npm run catalog:build
npm run pdf:build
npm run pdf:upload      # PDFs -> R2. Skipping this ships a store that 500s on download.
npm run cf:deploy
```

### 5. Verify

```bash
curl https://<your-worker-url>/api/health
```

Expect `{"ok":true,...,"backend":"r2","missing":[]}`. A 503 tells you exactly
what is wrong — files not uploaded, or a secret not set.

## The domain

The store answers on **bbanetwork.org**, registered through Cloudflare. Both the
apex and `www` are attached to the Worker in the `routes` block of
`wrangler.jsonc`, so the deploy creates the DNS records and certificates itself
— there is nothing to click.

`workers_dev` is set to `true` in the same file, deliberately. Wrangler flips it
to `false` the moment `routes` exists, and the `*.workers.dev` address is the
fallback the Stripe webhook was first pointed at, so losing it silently would
stop paid orders being delivered.

`www` is attached rather than redirected: both hostnames serve the same pages,
and the canonical link tag from `app/layout.tsx` tells search engines the apex is
the real one. A redirect would need a Cloudflare rule outside this repo.

### Moving to a different domain

The order matters — the domain has to answer before Stripe points at it.

1. **Register or add it.** Cloudflare dashboard → Domain Registration, or
   **Websites → Add a site** and move the nameservers if you registered
   elsewhere. The zone must be on the same account as the Worker.
2. **Add it to `routes`** in `wrangler.jsonc` and change
   `vars.NEXT_PUBLIC_SITE_URL` to match, no trailing slash. Both in one commit:
   they are the same fact, and a mismatch inlines one origin into the build
   while serving another at runtime.
3. **Deploy**, then load `https://<domain>/api/health` to confirm it answers.
4. **Repoint the Stripe webhook.** Edit the existing endpoint's URL rather than
   creating a new one — the signing secret belongs to the endpoint, so editing
   keeps `STRIPE_WEBHOOK_SECRET` valid and a new endpoint would need a new one.
5. **Email sender.** If you use Resend, verify the domain there and set
   `DELIVERY_FROM_EMAIL` to an address on it. Cloudflare Email Routing forwards
   `support@` to a personal inbox for free — the storefront prints
   `support@bbanetwork.org` on eight pages, so that forward needs to exist.

The `*.workers.dev` URL keeps working throughout, including for a test purchase.

## Local development

Two options, and they test different things.

```bash
npm run dev          # Next dev server. Fast. Reads PDFs from disk.
npm run cf:preview   # Real workerd runtime with R2. Slower, but it is what ships.
```

For `cf:preview` you need the local bucket seeded and `.dev.vars` filled in:

```bash
cp .dev.vars.example .dev.vars
npm run pdf:upload -- --local     # seeds the *preview* bucket miniflare uses
npm run cf:preview
```

`wrangler dev` binds `DOWNLOADS` to `preview_bucket_name`, not `bucket_name`.
Seeding the wrong one leaves `/api/health` reporting every file missing while
the uploads looked like they worked. `--local` handles this for you.

## CI deploys

To deploy from GitHub Actions, add these repository secrets:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Workers & Pages overview, right-hand sidebar |

The workflow must run `npm run pdf:build && npm run pdf:upload` before
`cf:deploy`, or the Worker deploys pointing at a bucket with no files in it.

## Troubleshooting

**Downloads 500 after a deploy.** The PDFs are not in R2. `curl /api/health`
will confirm. `npm run pdf:build && npm run pdf:upload`.

**`/api/health` reports `backend: filesystem` in production.** The R2 binding is
not attached — check the `r2_buckets` block in `wrangler.jsonc` and that both
buckets exist.

**Webhook signature failures.** Workers has no synchronous crypto; the handler
uses `constructEventAsync`. If you see this after editing the webhook, check
that the `await` is still there.

**`nodejs_compat` errors on deploy.** `lib/download-token.ts` needs `node:crypto`.
The flag is set in `wrangler.jsonc` — do not remove it.
