# Third-party notices

## Font Awesome Free

Icons in `app/components/Icon.tsx` are from [Font Awesome Free](https://fontawesome.com)
and are licensed **CC BY 4.0**. Attribution is displayed in the site footer, as the
licence requires.

Eleven glyphs are vendored as raw SVG paths rather than pulled from the npm package,
to keep the storefront dependency-free. The full set is cloned to
`vendor/Font-Awesome` by `npm run agents:bootstrap`.

- Icons: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- Copyright 2024 Fonticons, Inc.

## Vendored subagents

`.claude/agents/vendor/*.md` are generated from
[msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents), MIT
licensed, Copyright (c) 2025 AgentLand Contributors. Only the `name` field is
rewritten, to the kebab-case identifier Claude Code expects; the content is upstream's.

## Reference repositories

Cloned into `vendor/` by `npm run agents:bootstrap` and not redistributed here:

| Repository | Licence |
| --- | --- |
| [obra/superpowers](https://github.com/obra/superpowers) | MIT |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | MIT |
| [block/buzz](https://github.com/block/buzz) | Apache-2.0 |
| [firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server) | MIT |
| [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| [FortAwesome/Font-Awesome](https://github.com/FortAwesome/Font-Awesome) | Icons CC BY 4.0, code MIT, fonts SIL OFL 1.1 |
| [goabstract/Awesome-Design-Tools](https://github.com/goabstract/Awesome-Design-Tools) | MIT |
| [public-apis/public-apis](https://github.com/public-apis/public-apis) | MIT |

## Product content

The guides in `content/products/` are original work, © BBA Network, all rights
reserved. They are not covered by any licence granted for the code in this repository.
