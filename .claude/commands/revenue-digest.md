---
description: Produce the sales digest from Stripe — units, revenue, refunds and delivery failures
---

Use the **revenue-analyst** subagent to produce the sales digest.

$ARGUMENTS may name a period (for example "last 30 days"); default to the last 7 days.

The analyst reads Stripe through the MCP read tools — Stripe is the only order record
this business keeps. Remind it of the two rules that matter:

- amounts are in **pence**; report pounds
- **read operations only** — refunds are a human decision

The digest goes to `docs/reports/revenue-<date>.md` and must lead with problems
(refunds, failed checkouts, any completed session without a matching delivery) rather
than with the headline number.

Summarise back: units, revenue, the single recommendation, and anything that looks
like a delivery failure. If the period had no sales, say so in one line.
