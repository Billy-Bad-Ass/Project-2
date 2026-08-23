---
description: Run the multi-agent market intelligence sweep across every product niche
---

Run the `market-intel` workflow using the Workflow tool:

```
Workflow({ scriptPath: ".claude/workflows/market-intel.mjs" })
```

$ARGUMENTS may contain a JSON array of niche objects (`{ key, sku, terms }`) to
override the default set — pass it as the workflow's `args`. With no arguments the
workflow scans all three current niches.

The workflow fans out one researcher per niche, adversarially checks every finding
before keeping it, and writes a ranked action list to
`docs/research/market-intel-<date>.md`.

When it finishes, summarise for the user:
- the single highest-value action across all niches
- any finding that was dropped in verification, and why
- any niche that produced no actionable signal

Do not act on the findings — pricing and content changes are separate, human-approved
steps.
