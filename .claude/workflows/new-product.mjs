export const meta = {
  name: 'new-product',
  description: 'Take a product idea from research through to a launch-ready draft: validate demand, draft content, write the listing, build and QA',
  whenToUse:
    'Adding a new guide to the catalogue. Pass { topic, slug, priceMinor } as args, or a bare topic string.',
  phases: [
    { title: 'Validate', detail: 'is there demand, and at what price' },
    { title: 'Draft', detail: 'content outline and listing copy in parallel' },
    { title: 'Build', detail: 'wire it into the catalogue and generate PDFs' },
    { title: 'Review', detail: 'QA the result before it goes near Stripe' },
  ],
};

const input = typeof args === 'string' ? { topic: args } : (args ?? {});
const topic = input.topic;

if (!topic) {
  log('No topic given. Pass args as a string, or { topic, slug, priceMinor }.');
  return { error: 'missing-topic' };
}

const slug = input.slug ?? topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

log(`new product: "${topic}" -> ${slug}`);

const VALIDATION = {
  type: 'object',
  required: ['worthBuilding', 'reasoning', 'suggestedPriceMinor'],
  properties: {
    worthBuilding: { type: 'boolean' },
    reasoning: { type: 'string' },
    suggestedPriceMinor: { type: 'integer' },
    competitorPriceRange: { type: 'string' },
    differentiator: { type: 'string', description: 'what our guide says that none of theirs do' },
    risks: { type: 'array', items: { type: 'string' } },
  },
};

phase('Validate');
const validation = await agent(
  [
    `You are the market-researcher subagent for the BBA Network digital store, which`,
    `sells printable reference guides as PDF downloads.`,
    ``,
    `Assess whether "${topic}" is worth building as a guide.`,
    ``,
    `Read docs/AGENTS.md and one existing note (content/products/espresso-dial-in-card.md)`,
    `first so you understand the product shape: a short PDF where one page is the`,
    `actual reference and the rest exists to stop that page being misread.`,
    ``,
    `Answer: is there a searchable, recurring problem here that people currently solve`,
    `by asking a forum? What do comparable listings charge? And critically — what could`,
    `our guide say that none of theirs do, in the house style of being honest about`,
    `what will NOT work?`,
    ``,
    `Set worthBuilding false if the honest answer is no. A null result here saves weeks.`,
  ].join('\n'),
  { label: `validate:${slug}`, phase: 'Validate', schema: VALIDATION },
);

if (!validation?.worthBuilding) {
  log(`stopping: ${validation?.reasoning ?? 'validation failed'}`);
  return { slug, topic, built: false, validation };
}

log(`validated — suggested price ${(validation.suggestedPriceMinor / 100).toFixed(2)}`);

phase('Draft');
const [outline, listing] = await parallel([
  () =>
    agent(
      [
        `You are the content-editor subagent for the BBA Network digital store.`,
        ``,
        `Draft the page plan and content outline for a printable guide on "${topic}".`,
        `Its differentiator: ${validation.differentiator}`,
        ``,
        `Follow the structure of content/products/espresso-dial-in-card.md exactly:`,
        `YAML frontmatter, "## FULL CONTENT", then "## PAGE n — Heading" sections.`,
        `Page 1 is the cover. One page must be THE reference page — the thing people`,
        `print and pin up. The rest exists to stop that page being misread.`,
        ``,
        `Apply the house rule: separate what is reliably true from what depends on the`,
        `reader's specific setup from what is a purchase rather than an adjustment.`,
        ``,
        `CRITICAL: write the structure, the headings and the prose you can support.`,
        `Where a specific fact is needed that you cannot verify — a temperature, a`,
        `product name, a measurement — leave a clearly marked TODO for the author`,
        `rather than inventing it. An invented specific in a reference card is the`,
        `worst failure this product can have.`,
        ``,
        `Write the draft to content/products/${slug}.md and set status: needs-content`,
        `in the frontmatter, plus a contentGap line listing every TODO you left.`,
      ].join('\n'),
      { label: `outline:${slug}`, phase: 'Draft' },
    ),

  () =>
    agent(
      [
        `You are the listing-copywriter subagent for the BBA Network digital store.`,
        ``,
        `Write the marketplace listing copy for a printable guide on "${topic}".`,
        `Its differentiator: ${validation.differentiator}`,
        `Competitor pricing: ${validation.competitorPriceRange ?? 'unknown'}`,
        ``,
        `Read the "## (Any website) LISTING" section of`,
        `content/products/espresso-dial-in-card.md and match its structure exactly:`,
        `a keyword-stacked title, a fenced description with WHAT YOU GET / THE HONEST`,
        `PART / WHO IT IS FOR / DIGITAL DOWNLOAD, and 13 tags of 20 characters or fewer.`,
        ``,
        `Return the complete listing section as markdown, ready to append to the note.`,
        `Do not write any files — the outline agent owns that file this round.`,
      ].join('\n'),
      { label: `listing:${slug}`, phase: 'Draft' },
    ),
]);

phase('Build');
const build = await agent(
  [
    `You are the product-builder subagent for the BBA Network digital store.`,
    ``,
    `A draft note now exists at content/products/${slug}.md.`,
    ``,
    `Append this listing section to the end of it if it is not already there:`,
    ``,
    listing ?? '(the listing agent returned nothing — flag this)',
    ``,
    `Then wire the product into the catalogue:`,
    `  1. Add an entry to catalog/products.json with sku "${slug}",`,
    `     priceMinor ${input.priceMinor ?? validation.suggestedPriceMinor}, the next`,
    `     free order number, an accent colour and an icon that already exists in`,
    `     app/components/Icon.tsx.`,
    `  2. npm run catalog:build — read every warning.`,
    `  3. npm run pdf:build — confirm the page count matches the note's frontmatter`,
    `     and nothing lands in the "could not be fitted" list.`,
    `  4. npm test`,
    ``,
    `Do NOT run stripe:sync. Pricing goes live only with a human in the loop.`,
    ``,
    `Report what built, what warned, and every TODO still outstanding in the note.`,
  ].join('\n'),
  { label: `build:${slug}`, phase: 'Build' },
);

phase('Review');
const review = await agent(
  [
    `You are the release-qa subagent for the BBA Network digital store.`,
    ``,
    `A new product "${slug}" has just been drafted and built. Verify it against the`,
    `checklist in .claude/agents/release-qa.md, but do NOT fix anything — report only.`,
    ``,
    `Pay particular attention to:`,
    `  - unfilled TODOs left in content/products/${slug}.md`,
    `  - whether the PDF page count matches what the listing promises`,
    `  - whether both A4 and US Letter built`,
    `  - whether any tag exceeds 20 characters`,
    ``,
    `Group findings as blocker / should-fix / note. This product is not ready to sell`,
    `while any TODO or content gap remains — say so plainly if that is the case.`,
  ].join('\n'),
  { label: `qa:${slug}`, phase: 'Review' },
);

return { slug, topic, built: true, validation, build, review };
