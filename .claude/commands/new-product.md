---
description: Take a product idea from market validation through to a launch-ready draft
---

Run the `new-product` workflow using the Workflow tool:

```
Workflow({ scriptPath: ".claude/workflows/new-product.mjs", args: <see below> })
```

$ARGUMENTS is the product topic. Pass it as the workflow's `args`, either as a bare
string or as `{ topic, slug, priceMinor }` if the user specified a slug or price.

The workflow validates demand first and **stops early if the honest answer is that the
product is not worth building** — that is a successful outcome, not a failure.

If it does build, it drafts the note and the listing in parallel, wires the product
into the catalogue, builds the PDFs, and QAs the result. It deliberately does **not**
push anything to Stripe.

Report back:
- whether it stopped at validation, and why
- every TODO the content draft left for the author — the product cannot ship while any
  remain, because inventing a specific in a reference card is the worst failure this
  product line can have
- the QA verdict

Then tell the user the next two steps are theirs: fill the TODOs, and run
`npm run stripe:sync` once they are happy with the price.
