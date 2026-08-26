# Agent orchestration

This store is built to be operated by agents as well as by hand. This document is the
map: who owns what, what runs automatically, and where the guardrails are.

## The three layers

```
  Scheduled orchestration          .github/workflows/agent-*.yml
  (GitHub Actions, on a cron)      runs Claude Code headless, opens PRs and issues
             │
             ▼
  Deterministic pipelines          .claude/workflows/*.mjs
  (Workflow tool)                  fan out, verify adversarially, synthesise
             │
             ▼
  Specialist subagents             .claude/agents/*.md
  (Agent tool)                     one job each, with the house rules baked in
```

Anything can be run by hand too — the slash commands in `.claude/commands/` are the
same entry points the scheduled jobs use.

## Subagents

| Agent | Owns |
| --- | --- |
| `product-builder` | note → catalogue → PDF → Stripe. The whole product pipeline. |
| `content-editor` | the guides themselves. Fact-checking, corrections, filling gaps. |
| `listing-copywriter` | titles, descriptions, tags. Marketplace copy. |
| `storefront-designer` | Next.js UI and the PDF print stylesheet. |
| `market-researcher` | demand signals, competitor pricing, keyword gaps. |
| `pricing-analyst` | what to charge, and whether the bundle is working. |
| `revenue-analyst` | the Stripe digest. Leads with problems, not the headline. |
| `release-qa` | pre-deploy verification. Reports, never fixes. |
| `support-responder` | download issues, expired links, refunds, licence questions. |

`.claude/agents/vendor/` holds ten role agents vendored from
[agency-agents](https://github.com/msitarzewski/agency-agents) (MIT) by
`npm run agents:bootstrap` — SEO, content, growth, email, community, trend research,
bookkeeping and UI design. Project agents take precedence over vendored ones.

## Workflows

Run with the Workflow tool, or via their slash command.

| Workflow | Command | Shape |
| --- | --- | --- |
| `market-intel` | `/market-intel` | one researcher per niche in parallel → adversarial check of every finding → one ranked action list |
| `new-product` | `/new-product <topic>` | validate demand (stops early if the answer is no) → draft content and listing in parallel → build → QA |
| `listing-refresh` | `/listing-refresh` | per-product pipeline: rewrite → fact-check against the actual note |
| `release-check` | `/release-check` | five verification passes in parallel → reproduce each blocker → go/no-go |

Every workflow that produces findings verifies them before reporting. That is
deliberate: a plausible-but-wrong market finding leads to a mispriced product, and a
false release blocker costs a deploy.

Validate them after editing:

```bash
npm run workflows:check
```

Workflow scripts run as an async function body with `agent`, `parallel`, `pipeline`,
`phase`, `log` and `args` injected. They have **no filesystem or Node API access**, and
`Date.now()`, `Math.random()` and argless `new Date()` throw — the checker enforces all
of that so it fails at commit time rather than mid-run.

## What runs automatically

| Workflow | Schedule | What it does |
| --- | --- | --- |
| `agent-market-intel.yml` | Mondays 07:00 UTC | Scans every niche, opens a PR with the report |
| `agent-revenue-digest.yml` | Mondays 08:00 UTC | Reads Stripe, opens an issue if there are problems |
| `agent-listing-refresh.yml` | 1st of the month | Refreshes listings, opens a PR — or an issue if copy overclaims |
| `agent-release-check.yml` | on `v*` tags, or manual | Go/no-go before a deploy |
| `agent-mention.yml` | on `@claude` in an issue or PR | Routes the request to the right subagent |
| `ci.yml` | push and PR | Build, tests, catalogue freshness, PDF page counts, secret scan |

### Secrets these need

Set in **Settings → Secrets and variables → Actions**:

| Secret | Used by | Notes |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | every agent job | Preferred. `claude setup-token` produces it, and on a Max plan these runs cost nothing |
| `ANTHROPIC_API_KEY` | every agent job | The alternative to the above. Bills per token; ignored when the OAuth token is set |
| `STRIPE_SECRET_KEY` | revenue digest, release check | **Restricted read-only key** — see below |
| `FIRECRAWL_API_KEY` | market intel, listing refresh | Optional; those jobs degrade to WebSearch |
| `DASHBOARD_URL` | every agent job | Base URL of Project 4's console. Absent, runs are recorded nowhere |
| `DASHBOARD_TOKEN` | every agent job | Must equal the value on the `bba-heartbeat` Worker |
| `CF_ACCESS_CLIENT_ID` | every agent job | Access service token id, ending `.access`. The console sits behind Access |
| `CF_ACCESS_CLIENT_SECRET` | every agent job | Its secret. Shown once, at creation |

**One of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` must exist or no agent
here does anything.** Neither was ever set, which is why every scheduled run in
this repository has failed since the day the workflows were written. The jobs now
say so in one line and report `skipped` rather than dying on a validation error
buried 200 lines into a log.

## Reporting to the console

Project 4 owns the portfolio view. This repository keeps no run log of its own —
each job posts what happened to `POST /api/agent-runs` and stops.

Two steps per workflow: one `running` on the way in, one `if: always()` on the way
out carrying `ok`, `failed` or `skipped`. Both go through
`.github/actions/report-run`, which exists so that a reporting problem can never
fail a run and can never be mistaken for a successful one. `curl -sf ... || true`
manages neither: with `DASHBOARD_URL` unset it posts nothing and exits 0, and it
treats Cloudflare Access's 302 to a login page as a success.

The agent names in the `agent:` field are not free text. They must match Project
4's `config/agents.ts` exactly, or the console files the run under an agent it has
never heard of.

Create the Stripe key at *Developers → API keys → Restricted keys* with read
permission on Charges, Checkout Sessions, Customers, Products and Prices, and **write
on nothing**. The agents never need to write to Stripe, and a read-only key means a
prompt injection in a scraped page cannot issue a refund.

## Guardrails

These are load-bearing. Removing one is a decision, not a cleanup.

- **No live-mode Stripe writes without a human.** `scripts/stripe-sync.mjs` refuses to
  write to live mode unless `STRIPE_SYNC_CONFIRM=yes`, and `.claude/settings.json`
  denies `stripe:sync -- --apply` outright.
- **Agents never invent product content.** A wrong specific — a paint name, a
  temperature, a click count — in a reference card is the worst failure this product
  line has. Gaps get flagged as `contentGap` in the note's frontmatter instead.
- **Page count is a promise.** The listings state it and buyers count. CI fails if a
  PDF does not match (`npm run pdf:check`). The fix is trimming the note, never
  lowering `MIN_ZOOM` in `scripts/build-pdfs.mjs`.
- **Listings cannot overclaim.** `listing-refresh` fact-checks every claim against the
  note and refuses to open a PR if one fails. This range sells on being honest about
  its own limits.
- **Secrets never land in the repo.** `.claude/settings.json` denies reading `.env*`,
  and CI greps every push for key-shaped strings.
- **Research is polite.** `scripts/research/scrapling_scan.py` checks `robots.txt`, is
  rate-limited by default, and never reuses competitor copy.

## Tooling from the reference repos

`npm run agents:bootstrap` clones all eight into `vendor/` (gitignored):

| Repo | Used for |
| --- | --- |
| [superpowers](https://github.com/obra/superpowers) | Skills: TDD, planning, subagent-driven development. Install as a plugin — see below. |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | Source of the vendored role agents |
| [buzz](https://github.com/block/buzz) | Optional self-hosted workspace for human/agent coordination — see `docs/RUNBOOK.md` |
| [firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server) | Wired into `.mcp.json` for market research |
| [Scrapling](https://github.com/D4Vinci/Scrapling) | Backs `scripts/research/scrapling_scan.py` |
| [Font-Awesome](https://github.com/FortAwesome/Font-Awesome) | Storefront icons (CC BY 4.0) |
| [Awesome-Design-Tools](https://github.com/goabstract/Awesome-Design-Tools) | Design reference for `storefront-designer` |
| [public-apis](https://github.com/public-apis/public-apis) | Check before scraping — the data may already be an API |

Superpowers installs as a Claude Code plugin rather than a vendored copy:

```
/plugin marketplace add obra/superpowers
/plugin install superpowers@superpowers-dev
```

## Adding an agent

1. Write `.claude/agents/<name>.md` with `name`, `description` and `tools`
   frontmatter. The description is what routes work to it, so say *when to use it*,
   not just what it is.
2. Give it the house rules that apply to its job — the existing agents each end with a
   Rules section, and that is where the guardrails actually live.
3. If it should run on a schedule, add a slash command in `.claude/commands/` and a
   workflow in `.github/workflows/`. Reuse an existing `agent-*.yml` as the template.
