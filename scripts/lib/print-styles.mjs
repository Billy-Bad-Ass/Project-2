/** Print stylesheet for the product PDFs. Kept separate so the layout can be
 *  tuned without touching the build script. */
export const printCss = `
  :root {
    --ink: #14110F;
    --paper: #FFFFFF;
    --accent: #C2410C;
    --muted: #6B6259;
    --rule: #D9D2C7;
    --wash: #F6F2EB;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.4pt;
    line-height: 1.44;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet--landscape { page: landscape; }

  /* ---------- cover ---------- */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: var(--sheet-h, 245mm);
    padding-top: 24mm;
  }
  .cover__logo { width: 58mm; margin-bottom: 18mm; }
  .cover__title {
    font-size: 34pt;
    line-height: 1.05;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 6mm;
    max-width: 150mm;
  }
  .cover__rule { width: 26mm; height: 3pt; background: var(--accent); margin: 0 0 8mm; }
  .cover__body { font-size: 13pt; max-width: 140mm; color: var(--ink); }
  .cover__body p { margin: 0 0 3mm; }
  .cover__body strong { font-weight: 700; }
  .cover__body em { color: var(--muted); font-style: italic; }
  .cover__meta {
    border-top: 1pt solid var(--rule);
    padding-top: 4mm;
    font-size: 8.5pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }

  /* ---------- interior pages ---------- */
  .page__eyebrow {
    font-size: 8pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 700;
    margin: 0 0 1.5mm;
  }
  .page__heading {
    font-size: 20pt;
    font-weight: 800;
    letter-spacing: -0.015em;
    margin: 0 0 2mm;
    padding-bottom: 3mm;
    border-bottom: 1.5pt solid var(--ink);
  }
  .page__body { margin-top: 5mm; }

  h2 {
    font-size: 12pt;
    font-weight: 800;
    margin: 4.6mm 0 1.8mm;
    letter-spacing: -0.01em;
    break-after: avoid;
  }
  h3 { font-size: 10.5pt; font-weight: 700; margin: 4mm 0 1.5mm; break-after: avoid; }
  p { margin: 0 0 2.2mm; }
  strong { font-weight: 700; }

  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  li { margin-bottom: 1mm; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 3mm 0 4mm;
    font-size: 8.8pt;
    break-inside: avoid;
  }
  th, td {
    border: 0.5pt solid var(--rule);
    padding: 1.4mm 1.9mm;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--ink);
    color: #fff;
    font-weight: 700;
    font-size: 8pt;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  tbody tr:nth-child(even) td { background: var(--wash); }

  /* The landscape sheet is the dense reference chart. It has width to spare
     and no height, so compact the vertical rhythm rather than the type — the
     table has to stay readable at arm's length. */
  .sheet--landscape .page__heading { font-size: 15pt; padding-bottom: 2mm; margin-bottom: 1mm; }
  .sheet--landscape .page__body { margin-top: 3mm; }
  .sheet--landscape h2 { font-size: 10.5pt; margin: 2.4mm 0 1.2mm; }
  .sheet--landscape p { margin: 0 0 1.6mm; }
  .sheet--landscape .callout { padding: 2mm 3mm; margin: 2mm 0; }
  .sheet--landscape table { font-size: 8.9pt; margin: 2mm 0 2.5mm; }
  .sheet--landscape th,
  .sheet--landscape td { padding: 1.1mm 1.8mm; }

  pre {
    background: var(--wash);
    border: 0.5pt solid var(--rule);
    border-left: 2.5pt solid var(--accent);
    padding: 3mm 4mm;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 8.6pt;
    line-height: 1.45;
    white-space: pre;
    overflow: visible;
    break-inside: avoid;
    margin: 3mm 0;
  }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt; }
  pre code { font-size: inherit; }

  blockquote {
    margin: 3mm 0;
    padding-left: 4mm;
    border-left: 2pt solid var(--accent);
    color: var(--muted);
  }

  hr { border: 0; border-top: 0.5pt solid var(--rule); margin: 4mm 0; }

  /* warning callouts — the notes mark these with a leading ⚠ */
  .callout {
    background: #FDF3E7;
    border: 0.5pt solid #E8C39A;
    border-left: 2.5pt solid var(--accent);
    padding: 2.5mm 3.5mm;
    margin: 3mm 0;
    break-inside: avoid;
  }
  .callout p:last-child { margin-bottom: 0; }
`;
