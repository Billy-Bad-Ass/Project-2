---
description: Verify the store is safe to deploy — build, catalog, PDFs, Stripe parity and delivery security
---

Run the `release-check` workflow using the Workflow tool:

```
Workflow({ scriptPath: ".claude/workflows/release-check.mjs" })
```

It runs five independent verification passes in parallel, reproduces every claimed
blocker before reporting it, and writes a go/no-go to
`docs/reports/release-check-<date>.md`.

Report back with:
- **GO** or **NO-GO** as the first line
- every confirmed blocker, with what a buyer would experience
- what could not be checked this run — an unverified check is not a passed check

If the run is NO-GO, do not attempt to fix the blockers unless the user asks. Report
them.
