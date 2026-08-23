---
description: Rebuild the catalogue and PDFs after a content change, and verify the result
---

A product note has changed. Rebuild the derived artefacts and check them.

```bash
npm run catalog:build   # read the warnings — they are the point
npm run pdf:build       # page counts must match each note's `pages` frontmatter
npm test
npm run build
```

Then report:
- every warning `catalog:build` printed, and whether it is expected (a known
  `contentGap`) or new (a broken export)
- any page in the "could not be fitted" list — that means the source note needs
  trimming, **not** that `MIN_ZOOM` should be lowered in `scripts/build-pdfs.mjs`
- whether each PDF's page count still matches what its listing promises

If a page count changed, the listing copy that states it must change too — say so.
