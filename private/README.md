# private/

Not served statically. `private/downloads/` holds the generated product PDFs,
and the only route that can read them is `app/api/download/route.ts`, which
verifies the purchase against Stripe before streaming a byte.

The PDFs are gitignored — they are build output. Regenerate with:

```bash
npm run pdf:build
```

`next.config.mjs` adds this directory to `outputFileTracingIncludes` so it is
bundled with the download function on deploy.
