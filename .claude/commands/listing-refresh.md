---
description: Refresh marketplace listing copy for every product and fact-check it against the notes
---

Run the `listing-refresh` workflow using the Workflow tool:

```
Workflow({ scriptPath: ".claude/workflows/listing-refresh.mjs" })
```

$ARGUMENTS may contain a JSON array of skus to limit the run — pass it as the
workflow's `args`. With no arguments it refreshes every single product.

Each listing is rewritten by the copywriter agent and then fact-checked against the
actual product note, because a listing that overclaims does more damage to this range
than a bland one.

After it finishes:
- report which listings changed and which were deliberately left alone
- **report every accuracy problem loudly** — those are copy that promises something
  the file does not deliver, and they must be fixed before the listings go out
- run `npm run catalog:build && npm test` to confirm no tag went over 20 characters
