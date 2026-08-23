# Brand assets

## ⚠️ Replace the placeholder logo

`logo.svg` and `logo-mark.svg` are **placeholders**. The logo referenced in the
original brief did not arrive with the source notes — only the three product
markdown files came through.

To drop in the real logo:

1. Replace `brand/logo.svg` (horizontal lockup, ~240×64 viewBox) and
   `brand/logo-mark.svg` (square mark, 64×64 viewBox).
2. Run `cp brand/logo*.svg public/` — the storefront reads from `public/`.
3. If the real logo's colours differ, update the tokens in
   `app/globals.css` (`--ink`, `--accent`, `--paper`) so the site follows it.

Nothing else in the codebase hardcodes the logo; it is referenced once in
`app/components/Header.tsx` and once in `scripts/build-pdfs.mjs` for the PDF
cover pages.

## Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ink` | `#14110F` | `#F2EDE4` | Body text, mark background |
| `--paper` | `#FBF7F0` | `#14110F` | Page background |
| `--accent` | `#C2410C` | `#F97316` | Links, buttons, rules |
| `--muted` | `#6B6259` | `#A79C90` | Secondary text |

Type: system UI sans for the interface, `ui-monospace` for the reference
tables and code blocks that make up most of the product pages.
