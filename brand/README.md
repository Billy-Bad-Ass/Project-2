# Brand assets

The real identity, supplied as `BBA_Network_brand_identity.zip`. The full kit is
kept verbatim in `kit/`; the files the site and PDFs actually read are the four
at the top of this directory, mirrored into `public/`.

## The mark

Eight horizontal bars tapering to a lens, cut by a blue line that breaks out to
the right and terminates in a square. **The blue is the one colour that must not
move** — it is the only thing separating the mark from a stack of grey bars.

That is why the dark theme swaps to a second file rather than applying a CSS
filter. The old placeholder was inverted with `filter: invert(1) hue-rotate(180deg)`,
which on this mark turns the blue orange.

| File | Used by |
| --- | --- |
| `logo.svg` | header, footer, PDF cover pages |
| `logo-dark.svg` | header and footer under `prefers-color-scheme: dark` |
| `logo-mark.svg` / `logo-mark-dark.svg` | square mark, no wordmark |
| `../app/icon.svg` | browser tab |
| `../app/apple-icon.png` | iOS home screen |

`kit/` also holds an avatar, an app icon, a phone wallpaper and the raster
signature lockups, for anywhere off-site — social profiles, marketplace shops.

### The wordmark is set, not traced

The kit ships the mark as SVG but the lockup only as PNG, and no font file. So
`logo.svg` combines the kit's exact mark geometry with `BBA` and `NETWORK` set
in the site's own sans stack. It is very close to the supplied signature but not
identical letterforms. Use `kit/png/bba-signature-*.png` where exactness matters
more than scaling.

## Tokens

Taken from the kit. Changing one here changes the whole site — `app/globals.css`
mirrors this table, and `scripts/lib/print-styles.mjs` mirrors the light column
for the PDFs.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ink` | `#12161F` | `#EDEFF3` | Body text, mark strokes |
| `--paper` | `#FAFAF8` | `#0B0F16` | Page background |
| `--accent` | `#2B5CE6` | `#5B82F0` | Links, buttons, the mark's blue |
| `--muted` | `#5B6474` | `#99A1B0` | Secondary text |
| `--rule` | `#E2E5EB` | `#262C38` | Hairlines |

Dark mode lightens the accent on purpose: the brand blue on `#0B0F16` is about
3.3:1, which fails WCAG AA for body-sized link text. The mark keeps the true
`#2B5CE6` in both themes — it is a graphic, not text.

Warning callouts in the PDFs stay amber rather than following the accent. That
colour is doing semantic work in a reference someone is following at a machine.

Type: system UI sans for the interface, `ui-monospace` for the reference tables
and code blocks that make up most of the product pages.
