export const meta = {
  name: 'release-check',
  description: 'Verify the store is safe to deploy: build, catalog, PDFs, Stripe parity and the delivery security path, checked in parallel then confirmed',
  whenToUse: 'Before deploying, before a live price change, and on the scheduled release check.',
  phases: [
    { title: 'Check', detail: 'five independent verification passes' },
    { title: 'Confirm', detail: 'reproduce each blocker before reporting it' },
    { title: 'Report', detail: 'one go / no-go summary' },
  ],
};

const DIMENSIONS = [
  {
    key: 'build',
    prompt: `Run \`npm run catalog:build\`, \`npm run build\` and \`npm test\`. Read the
catalog build warnings rather than only checking exit codes — warnings about dropped
table rows or missing listing copy are real findings. Report anything that fails or
warns.`,
  },
  {
    key: 'pdfs',
    prompt: `Run \`npm run pdf:build\`. For every product verify: the PDF page count
equals the note's \`pages\` frontmatter (buyers count these — the listing promises a
number), both A4 and US Letter built, and nothing appears in the "could not be fitted"
list. Check private/downloads/manifest.json against catalog/generated.json.`,
  },
  {
    key: 'catalog',
    prompt: `Verify catalog integrity without running the build: every sku in
catalog/products.json appears in catalog/generated.json with a matching price, every
tag is 20 characters or fewer, the bundle is cheaper than the sum of its parts and
states the correct saving, and every item has both an A4 and a US Letter file. Flag
any item with status "needs-content".`,
  },
  {
    key: 'delivery-security',
    prompt: `Audit the digital delivery path. Read app/api/download/route.ts,
lib/download-token.ts and lib/entitlements.ts. Confirm all three gates are still
enforced: valid unexpired HMAC signature, Stripe reports the session paid, and the
session's entitlements include the requested file. Confirm private/downloads is
gitignored and not under public/. Confirm isSafeFileName still blocks path traversal.
Run \`git grep -nE 'sk_(live|test)_|whsec_|re_[A-Za-z0-9]{20}'\` and report any hit.
Removing any one of the three gates is a release blocker.`,
  },
  {
    key: 'stripe-parity',
    prompt: `Read scripts/stripe-sync.mjs and catalog/generated.json and determine
whether the storefront and Stripe would agree on price. If STRIPE_SECRET_KEY is
available run \`npm run stripe:sync\` as a dry run and report the plan — a non-empty
plan before release means they disagree. If the key is absent, say so and report what
could not be checked rather than assuming it is fine.`,
  },
];

const FINDINGS = {
  type: 'object',
  required: ['dimension', 'findings'],
  properties: {
    dimension: { type: 'string' },
    ranCommands: { type: 'array', items: { type: 'string' } },
    couldNotCheck: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'summary', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'should-fix', 'note'] },
          summary: { type: 'string' },
          evidence: { type: 'string', description: 'the command output or file:line that shows it' },
          file: { type: 'string' },
          impact: { type: 'string', description: 'what a buyer would experience' },
        },
      },
    },
  },
};

const CONFIRMATION = {
  type: 'object',
  required: ['reproduced', 'reason'],
  properties: {
    reproduced: { type: 'boolean' },
    reason: { type: 'string' },
    correctedSeverity: { type: 'string', enum: ['blocker', 'should-fix', 'note'] },
  },
};

phase('Check');
log(`running ${DIMENSIONS.length} verification passes`);

const checked = await pipeline(
  DIMENSIONS,
  (dimension) =>
    agent(
      [
        `You are the release-qa subagent for the BBA Network digital store.`,
        `Read .claude/agents/release-qa.md for the full checklist and the house rules.`,
        ``,
        `Your dimension this run is "${dimension.key}".`,
        ``,
        dimension.prompt,
        ``,
        `Report only — do not fix anything. State every command you actually ran and`,
        `everything you could not check. "Tests pass" is not a report.`,
      ].join('\n'),
      { label: `check:${dimension.key}`, phase: 'Check', schema: FINDINGS },
    ),

  // Blockers get reproduced as soon as their dimension finishes.
  (result, dimension) => {
    const blockers = (result?.findings ?? []).filter((f) => f.severity === 'blocker');
    if (blockers.length === 0) return { dimension, result, confirmed: [] };

    return parallel(
      blockers.map((finding) => () =>
        agent(
          [
            `Independently reproduce a release blocker before it stops a deploy.`,
            ``,
            `Claim: ${finding.summary}`,
            `Evidence given: ${finding.evidence}`,
            `File: ${finding.file ?? 'not specified'}`,
            ``,
            `Re-run the command or re-read the file yourself. Set reproduced:false if`,
            `the evidence does not actually show what is claimed, if it is a warning`,
            `being reported as a failure, or if it is pre-existing and unrelated to`,
            `shipping. Downgrade the severity where the impact on a buyer is smaller`,
            `than stated.`,
          ].join('\n'),
          { label: `confirm:${dimension.key}`, phase: 'Confirm', schema: CONFIRMATION },
        ).then((verdict) => ({ finding, verdict })),
      ),
    ).then((confirmed) => ({ dimension, result, confirmed: confirmed.filter(Boolean) }));
  },
);

const passes = checked.filter(Boolean);
const all = passes.flatMap(({ dimension, result, confirmed }) => {
  const rejected = new Set(
    confirmed.filter((c) => !c.verdict?.reproduced).map((c) => c.finding.summary),
  );
  const severityOf = (f) =>
    confirmed.find((c) => c.finding.summary === f.summary)?.verdict?.correctedSeverity ?? f.severity;

  return (result?.findings ?? [])
    .filter((f) => !rejected.has(f.summary))
    .map((f) => ({ ...f, severity: severityOf(f), dimension: dimension.key }));
});

const blockers = all.filter((f) => f.severity === 'blocker');
const gaps = passes.flatMap(({ dimension, result }) =>
  (result?.couldNotCheck ?? []).map((g) => `${dimension.key}: ${g}`),
);

log(`${blockers.length} confirmed blocker(s), ${all.length} finding(s) total`);

phase('Report');
const report = await agent(
  [
    `Write the release go/no-go for the BBA Network store.`,
    ``,
    `Confirmed findings:`,
    JSON.stringify(all, null, 2),
    ``,
    `Things that could not be checked this run:`,
    JSON.stringify(gaps, null, 2),
    ``,
    `Open with GO or NO-GO on its own line — NO-GO if there is any confirmed blocker.`,
    `Then list blockers, then should-fix, then notes, each with what a buyer would`,
    `actually experience. Finish with the unchecked list: an unverified check is not`,
    `a passed check and the reader needs to know which is which.`,
    ``,
    `Write it to docs/reports/release-check-<today's date, YYYY-MM-DD>.md and also`,
    `return the summary. Create the directory if needed.`,
  ].join('\n'),
  { label: 'report', phase: 'Report' },
);

return {
  go: blockers.length === 0,
  blockers: blockers.length,
  findings: all.length,
  unchecked: gaps,
  report,
};
