/**
 * Parses a product note (content/products/*.md) into its structured parts.
 *
 * A note is the single source of truth for one product: frontmatter, the
 * printable body, and the marketplace listing copy all live in one file so
 * editing the note updates the PDF, the storefront and Stripe together.
 */

const LISTING_HEADING = /^##\s+.*\bLISTING\b\s*$/im;

/** Minimal YAML reader covering the subset the notes use: scalars, inline
 *  arrays, and `>-` folded blocks. Deliberately not a full YAML parser. */
export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();

    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      const folded = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        folded.push(lines[++i].trim());
      }
      data[key] = value.startsWith('>') ? folded.join(' ') : folded.join('\n');
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
        .map((v) => (/^-?\d+$/.test(v) ? Number(v) : v));
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { data, body: raw.slice(match[0].length) };
}

/** The printable part of the note: everything between `## FULL CONTENT` and
 *  the marketplace listing section. Falls back to the whole body. */
export function extractPrintableBody(body) {
  let text = body;

  const contentStart = /^##\s+FULL CONTENT\s*$/im.exec(text);
  if (contentStart) text = text.slice(contentStart.index + contentStart[0].length);

  const listingStart = LISTING_HEADING.exec(text);
  if (listingStart) text = text.slice(0, listingStart.index);

  return text.trim();
}

/** The marketplace listing copy authored at the bottom of the note. */
export function extractListing(body) {
  const listingStart = LISTING_HEADING.exec(body);
  const section = listingStart ? body.slice(listingStart.index) : '';

  const title = firstProseLineAfter(section, /^##\s+Title\s*$/im);
  const description = firstFencedBlockAfter(section, /^##\s+Description\s*$/im);
  const tags = numberedListAfter(section, /^##\s+Tags\b.*$/im);

  return { title, description, tags };
}

/** Splits the printable body into pages on `## PAGE n — Heading` markers. */
export function splitPages(printableBody) {
  const marker = /^##\s+PAGE\s+(\d+)\s*[—–-]\s*(.+?)\s*$/gim;
  const hits = [...printableBody.matchAll(marker)];
  if (hits.length === 0) {
    return [{ number: 1, heading: '', markdown: printableBody.trim() }];
  }

  return hits.map((hit, index) => {
    const start = hit.index + hit[0].length;
    const end = index + 1 < hits.length ? hits[index + 1].index : printableBody.length;
    return {
      number: Number(hit[1]),
      heading: hit[2].trim(),
      markdown: printableBody.slice(start, end).trim(),
    };
  });
}

/**
 * Normalises the malformed markdown tables the notes exported with: rows whose
 * cells are all empty, and separator lines that landed above the header row
 * instead of below it.
 *
 * For each contiguous table block it keeps only rows with real content, then
 * re-emits `header / separator / data`. A block with no content left is
 * dropped entirely rather than rendering as a grid of empty boxes.
 */
export function stripEmptyTableRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let removed = 0;
  let droppedTables = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!isTableLine(lines[i])) {
      out.push(lines[i]);
      continue;
    }

    const block = [];
    while (i < lines.length && isTableLine(lines[i])) block.push(lines[i++]);
    i--;

    const rows = block
      .map(splitRow)
      .filter((cells) => {
        if (isSeparatorCells(cells)) return false;
        if (cells.every((cell) => cell === '')) {
          removed++;
          return false;
        }
        return true;
      });

    if (rows.length === 0) {
      droppedTables++;
      continue;
    }

    const width = Math.max(...rows.map((r) => r.length));
    const pad = (cells) => [...cells, ...Array(width - cells.length).fill('')];

    out.push(`| ${pad(rows[0]).join(' | ')} |`);
    out.push(`| ${Array(width).fill('---').join(' | ')} |`);
    for (const row of rows.slice(1)) out.push(`| ${pad(row).join(' | ')} |`);
  }

  return { markdown: out.join('\n'), removed, droppedTables };
}

function isTableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
}

function splitRow(line) {
  return line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
}

/** A separator needs at least one dash; `|  |  |` is an empty row, not one. */
function isSeparatorCells(cells) {
  return cells.every((cell) => /^:?-+:?$/.test(cell) || cell === '-');
}

function firstProseLineAfter(section, heading) {
  const start = heading.exec(section);
  if (!start) return '';
  const rest = section.slice(start.index + start[0].length).split(/\r?\n/);
  for (const line of rest) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) break;
    if (trimmed.startsWith('**')) continue; // the "why it is phrased this way" gloss
    return trimmed;
  }
  return '';
}

function firstFencedBlockAfter(section, heading) {
  const start = heading.exec(section);
  if (!start) return '';
  const rest = section.slice(start.index + start[0].length);
  const fenced = /```[a-z]*\r?\n([\s\S]*?)```/i.exec(rest);
  return fenced ? fenced[1].trim() : '';
}

function numberedListAfter(section, heading) {
  const start = heading.exec(section);
  if (!start) return [];
  const rest = section.slice(start.index + start[0].length).split(/\r?\n/);
  const tags = [];
  for (const line of rest) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) break;
    const item = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (item) tags.push(item[1].trim());
  }
  return tags;
}
