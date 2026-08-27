# Taking real money

The store is fully wired and healthy, and has been taking **test** payments
only. Its last deploy reported:

```json
"stripe": { "reachable": true, "mode": "test", "pricesResolved": 2, "pricesExpected": 2 }
```

Everything below is what turns that `"mode": "test"` into `"mode": "live"`.

## What is already done

Live mode on the **BBA Network** account (`acct_1U7Km3R7EyLACZsr`) now carries
the catalogue and the delivery webhook:

| | |
| --- | --- |
| `Espresso Dial-In Troubleshooting Card` | `prod_V9LQ41lnoOvNWl` |
| — its price, `lookup_key: espresso-dial-in-card` | `price_1U92jgR7EyLACZsrcbmu53qY`, $9.45 |
| `Keyboard Sound & Mod Chart` | `prod_V9LQdHg9eGBnXs` |
| — its price, `lookup_key: keyboard-sound-mod-chart` | `price_1U92jlR7EyLACZsrREOsT3W3`, $9.45 |
| Webhook → `https://guides.bbanetwork.org/api/stripe/webhook` | `we_1U92juR7EyLACZsrTsbOOPfx`, enabled |

Created with the same shape `scripts/stripe-sync.mjs` produces — matched on
`metadata.sku`, priced by `lookup_key`, `tax_behavior: inclusive`, tax code
`txcd_10502000` — so a later `npm run stripe:sync -- --apply` reconciles them
rather than creating a second set.

**`miniature-speedpaint-recipe-sheet` is deliberately absent.** Its listing
promises eight recipe tables the file does not contain. It is `needs-content`
in the catalogue, `/api/checkout` refuses it with a 409, and it should not have
a live price until the note is finished.

## What still needs you

Two secrets. Both go in **GitHub → Settings → Secrets and variables → Actions**,
on this repository — the deploy pushes them onto the Worker, so there is no
Cloudflare dashboard step and no terminal.

### 1. `STRIPE_SECRET_KEY` — already done

This is **already an `sk_live_` key**, as of 2026-08-27.

Not inferred: `Agent · Checkout end-to-end` refused to start against it, with
`refusing to run: STRIPE_SECRET_KEY is a LIVE key`. That check reads the prefix
before making any network call, which is how it is known without the value ever
being printed.

It has not reached the Worker. The store has not deployed since 2026-08-23, and
the deploy is what copies GitHub's secrets onto it — so the running store is
still on the sandbox test key, and **the deploy in step 4 is the actual switch.**

Note this is a change of *account*, not just of mode: the store has been running
on the **BBA Network sandbox** account, and live mode exists only on the main
one, `acct_1U7Km3R7EyLACZsr`. That is the account the live products above were
created on.

### 2. `STRIPE_WEBHOOK_SECRET` — do this before step 4

The signing secret belonging to `we_1U92juR7EyLACZsrTsbOOPfx`. Stripe Dashboard
→ Developers → Webhooks → *BBA Network store — digital download delivery
(live)* → **Signing secret** → Reveal. It starts `whsec_`.

It is not written down here on purpose. A signing secret in a repository is a
signing secret that needs rotating.

**This one is the ordering hazard.** The Worker currently holds the *sandbox*
endpoint's signing secret. Deploy the live key without replacing it and the
store goes live with a webhook that cannot verify a single delivery: every
signature check fails, so no delivery email is ever sent.

It fails quietly rather than loudly, because the success page — not the webhook
— is the primary delivery route, and it would keep working. A buyer who closes
the tab before downloading is the one who loses. Refund revocation also keeps
working, since gate 3 reads Stripe live rather than trusting a webhook.

So: degraded, not broken, and invisible unless you look. Set this first.

### 3. `STRIPE_TEST_SECRET_KEY` — overdue

The **sandbox** account's test key, from the sandbox dashboard: Developers →
API keys → Secret key. It starts `sk_test_`.

`Agent · Checkout end-to-end` buys a guide and refunds it, so it refuses to run
against a live key. It reads `STRIPE_TEST_SECRET_KEY` first and falls back to
`STRIPE_SECRET_KEY` — and since the latter is now live, **the test cannot run at
all until this is set.** That is the state today: the only check that proves a
buyer still receives what they paid for is currently refusing to start.

This was meant to be copied from `STRIPE_SECRET_KEY` before it was replaced.
That moment has passed, so it comes from the sandbox dashboard instead.

### 4. Deploy

**Actions → Deploy to Cloudflare → Run workflow.** The job summary prints the
health result. You want:

```json
"config": { "stripeKey": true, "webhookSecret": true, "signingSecret": true },
"stripe": { "reachable": true, "mode": "live", "pricesResolved": 2, "pricesExpected": 2 }
```

`pricesResolved: 0` with `reachable: true` means the key authenticated against
an account that has none of the catalogue on it — i.e. the sandbox key is still
in place. That is the specific failure this check was built to catch.

## Then, and only then

`web-6/src/businesses.ts` records `guides` as `status: 'building'`. Rule 2 in
that repo says `live` is a promise that a customer can reach the host **and pay
today** — which is why it has not been flipped already: a test-mode store is
reachable and cannot take money.

Once the health check above reads `"mode": "live"`, that promise is true. Flip
it, and the hub links the store from its cards and its footer again on the next
deploy.

## What does not need doing

- **The apex.** `bbanetwork.org` belongs to the hub. This store answers on
  `guides.bbanetwork.org` and `wrangler.jsonc` claims only that. See
  `docs/CLOUDFLARE.md`.
- **A second webhook for the audit business.** The Website Health Check sells
  through a Stripe Payment Link and fulfils by polling, not by webhook.
- **Guarding against its checkouts.** The audit product lives on the same
  account, so this store's live webhook receives its `checkout.session.completed`
  events too. `app/api/stripe/webhook/route.ts` already recognises a session
  carrying none of this catalogue and declines it rather than emailing an empty
  download list.

## The old sandbox endpoint

`we_1U7bbBJXu5sDe7hub698qSAI` on the sandbox account still points at
`https://guides.bbanetwork.org/api/stripe/webhook` and stays enabled. Leave it:
it is what `Agent · Checkout end-to-end` exercises, and it cannot interfere with
live traffic — a test-mode endpoint only ever receives test-mode events.
