export const meta = {
  name: 'market-intel',
  description: 'Scan each product niche for demand, competitors and keyword gaps, then synthesise one action list',
  whenToUse:
    'Weekly market intelligence, or before deciding what product to build next. Pass a niche list as args to override the default set.',
  phases: [
    { title: 'Scan', detail: 'one researcher per niche, in parallel' },
    { title: 'Verify', detail: 'check each claim is supported by what was actually found' },
    { title: 'Synthesise', detail: 'one ranked action list across all niches' },
  ],
};

const DEFAULT_NICHES = [
  {
    key: 'espresso',
    sku: 'espresso-dial-in-card',
    terms: ['espresso dial in cheat sheet', 'coffee troubleshooting printable', 'home barista guide'],
  },
  {
    key: 'keyboards',
    sku: 'keyboard-sound-mod-chart',
    terms: ['keyboard mod chart', 'mechanical keyboard guide printable', 'keyboard sound guide'],
  },
  {
    key: 'miniatures',
    sku: 'miniature-speedpaint-recipe-sheet',
    terms: ['miniature painting cheat sheet', 'slapchop guide', 'speed paint recipe printable'],
  },
];

const niches = Array.isArray(args) && args.length ? args : DEFAULT_NICHES;

const FINDINGS = {
  type: 'object',
  required: ['niche', 'findings', 'competitorPriceRange'],
  properties: {
    niche: { type: 'string' },
    competitorPriceRange: {
      type: 'object',
      required: ['lowMinor', 'highMinor', 'sampleSize'],
      properties: {
        lowMinor: { type: 'integer' },
        highMinor: { type: 'integer' },
        sampleSize: { type: 'integer' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['observation', 'evidence', 'action', 'confidence'],
        properties: {
          observation: { type: 'string' },
          evidence: { type: 'string', description: 'the number or source behind it' },
          action: { type: 'string' },
          confidence: { type: 'string', enum: ['measured', 'inferred', 'guess'] },
        },
      },
    },
    keywordGaps: { type: 'array', items: { type: 'string' } },
    nullResults: { type: 'array', items: { type: 'string' } },
  },
};

const VERDICT = {
  type: 'object',
  required: ['supported', 'reason'],
  properties: {
    supported: { type: 'boolean' },
    reason: { type: 'string' },
    correctedConfidence: { type: 'string', enum: ['measured', 'inferred', 'guess'] },
  },
};

phase('Scan');
log(`scanning ${niches.length} niche(s)`);

const scanned = await pipeline(
  niches,
  (niche) =>
    agent(
      [
        `You are the market-researcher subagent for the BBA Network digital store.`,
        `Research the "${niche.key}" niche for printable reference guides.`,
        ``,
        `Our product in this niche: ${niche.sku}. Read its note at`,
        `content/products/${niche.sku}.md and its price in catalog/products.json first,`,
        `so your findings are relative to what we actually sell.`,
        ``,
        `Search terms to work from: ${niche.terms.join('; ')}.`,
        ``,
        `Find: what the top listings charge and how many pages they give, what every`,
        `one of them omits, what buyers complain about, and which keywords our listing`,
        `title is missing. Report null results explicitly — "no signal for X" is a`,
        `useful finding.`,
        ``,
        `Mark every finding as measured, inferred or guess. Do not present a guess as`,
        `a measurement. Never copy competitor listing text.`,
      ].join('\n'),
      { label: `scan:${niche.key}`, phase: 'Scan', schema: FINDINGS },
    ),

  // Each niche's claims get checked as soon as that scan lands, rather than
  // waiting for the slowest researcher.
  (report, niche) => {
    if (!report?.findings?.length) return { niche, report, checked: [] };

    return parallel(
      report.findings.map((finding) => () =>
        agent(
          [
            `Adversarially check one market-research claim about the "${niche.key}" niche.`,
            ``,
            `Claim: ${finding.observation}`,
            `Stated evidence: ${finding.evidence}`,
            `Stated confidence: ${finding.confidence}`,
            `Proposed action: ${finding.action}`,
            ``,
            `Is the evidence actually sufficient for the claim at that confidence`,
            `level? Default to supported:false when the evidence is a single data`,
            `point presented as a trend, when a "measured" claim has no number, or`,
            `when the action does not follow from the observation.`,
          ].join('\n'),
          { label: `verify:${niche.key}`, phase: 'Verify', schema: VERDICT },
        ).then((verdict) => ({ finding, verdict })),
      ),
    ).then((checked) => ({ niche, report, checked: checked.filter(Boolean) }));
  },
);

const results = scanned.filter(Boolean);
const kept = results.flatMap(({ niche, checked }) =>
  checked
    .filter((c) => c.verdict?.supported)
    .map((c) => ({
      niche: niche.key,
      sku: niche.sku,
      ...c.finding,
      confidence: c.verdict.correctedConfidence ?? c.finding.confidence,
    })),
);
const dropped = results.flatMap(({ checked }) => checked.filter((c) => !c.verdict?.supported));

log(`${kept.length} finding(s) survived verification, ${dropped.length} dropped`);

phase('Synthesise');
const summary = await agent(
  [
    `Write the weekly market intelligence report for the BBA Network digital store.`,
    ``,
    `These findings survived an adversarial check:`,
    JSON.stringify(kept, null, 2),
    ``,
    `Competitor price ranges by niche:`,
    JSON.stringify(
      results.map(({ niche, report }) => ({ niche: niche.key, range: report?.competitorPriceRange })),
      null,
      2,
    ),
    ``,
    `Write it to docs/research/market-intel-<today's date, YYYY-MM-DD>.md.`,
    ``,
    `Structure: a three-line summary at the top, then one section per niche, then a`,
    `single ranked action list across all niches — most valuable first, each with the`,
    `number that justifies it. Mark anything inferred rather than measured.`,
    ``,
    `If a niche produced nothing worth acting on, say that in one line rather than`,
    `padding the section. Create the directory if it does not exist.`,
  ].join('\n'),
  { label: 'synthesise', phase: 'Synthesise' },
);

return {
  niches: niches.map((n) => n.key),
  kept: kept.length,
  dropped: dropped.length,
  report: summary,
};
