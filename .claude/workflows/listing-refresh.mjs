export const meta = {
  name: 'listing-refresh',
  description: 'Refresh the marketplace listing copy for every product against current search behaviour, then verify nothing overclaims',
  whenToUse:
    'Monthly listing maintenance, or after market-intel surfaces keyword gaps. Pass an array of skus as args to limit the run.',
  phases: [
    { title: 'Rewrite', detail: 'one copywriter per product' },
    { title: 'Fact-check', detail: 'every claim checked against the actual note' },
  ],
};

// Workflow scripts have no filesystem access, so the default list is inline.
// Bundles inherit their copy from their members and are not refreshed directly.
// Keep in step with catalog/products.json, or pass an explicit array as args.
const DEFAULT_SKUS = [
  'espresso-dial-in-card',
  'keyboard-sound-mod-chart',
  'miniature-speedpaint-recipe-sheet',
];

const skus = Array.isArray(args) && args.length ? args : DEFAULT_SKUS;

log(`refreshing ${skus.length} listing(s): ${skus.join(', ')}`);

const REWRITE = {
  type: 'object',
  required: ['sku', 'changed', 'title', 'tags'],
  properties: {
    sku: { type: 'string' },
    changed: { type: 'boolean' },
    title: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
    claimsMade: {
      type: 'array',
      description: 'every factual claim the new copy makes about the product',
      items: { type: 'string' },
    },
  },
};

const FACTCHECK = {
  type: 'object',
  required: ['accurate', 'problems'],
  properties: {
    accurate: { type: 'boolean' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'issue'],
        properties: { claim: { type: 'string' }, issue: { type: 'string' } },
      },
    },
  },
};

const results = await pipeline(
  skus,

  (sku) =>
    agent(
      [
        `You are the listing-copywriter subagent for the BBA Network digital store.`,
        `Read .claude/agents/listing-copywriter.md for the house rules first.`,
        ``,
        `Refresh the marketplace listing for "${sku}".`,
        ``,
        `Read content/products/${sku}.md — both the printable pages (so you know what`,
        `the product actually contains) and the existing "## ... LISTING" section.`,
        `Check docs/research/ for any recent market-intel naming keyword gaps for this`,
        `niche; use them if they are there, ignore them if they are not.`,
        ``,
        `Improve the title's keyword coverage and tighten the description, keeping the`,
        `structure and the THE HONEST PART section. 13 tags, each 20 characters or`,
        `fewer — the test suite fails the build if one is longer.`,
        ``,
        `If the current listing is already good, set changed:false and leave the file`,
        `alone. Churning copy that works is a cost, not an improvement.`,
        ``,
        `If you do change it, edit the LISTING section of the note in place and then`,
        `run \`npm run catalog:build\`. List every factual claim the new copy makes.`,
      ].join('\n'),
      { label: `rewrite:${sku}`, phase: 'Rewrite', schema: REWRITE },
    ),

  (rewrite, sku) => {
    if (!rewrite?.changed) {
      log(`${sku}: unchanged`);
      return { sku, rewrite, factcheck: null };
    }

    return agent(
      [
        `Fact-check refreshed listing copy against the product it describes.`,
        ``,
        `Product note: content/products/${sku}.md`,
        `New title: ${rewrite.title}`,
        `Claims made by the new copy:`,
        JSON.stringify(rewrite.claimsMade ?? [], null, 2),
        ``,
        `For each claim, verify it against the actual note and`,
        `catalog/generated.json. Flag anything the product does not deliver: a page`,
        `count that does not match, a section that is not there, a paper size not`,
        `shipped, a promise the guide does not keep.`,
        ``,
        `Also check every tag is 20 characters or fewer and there are 13 of them.`,
        ``,
        `These guides sell on being honest about their own limits. A listing that`,
        `overclaims does more damage here than a bland one.`,
      ].join('\n'),
      { label: `factcheck:${sku}`, phase: 'Fact-check', schema: FACTCHECK },
    ).then((factcheck) => ({ sku, rewrite, factcheck }));
  },
);

const done = results.filter(Boolean);
const changed = done.filter((r) => r.rewrite?.changed);
const problems = done.flatMap((r) =>
  (r.factcheck?.problems ?? []).map((p) => ({ sku: r.sku, ...p })),
);

log(`${changed.length} listing(s) rewritten, ${problems.length} accuracy problem(s) found`);

if (problems.length) {
  log('accuracy problems need fixing before these listings go out:');
  for (const p of problems) log(`  ${p.sku}: ${p.claim} — ${p.issue}`);
}

return {
  refreshed: changed.map((r) => r.sku),
  unchanged: done.filter((r) => !r.rewrite?.changed).map((r) => r.sku),
  problems,
};
