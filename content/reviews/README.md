# Reviews

One markdown file per review. They render on the product page and in the
aggregate rating; there is no database.

**Every review here must be a real one from a real buyer.** Writing them
yourself is illegal — the UK Digital Markets, Competition and Consumers Act
2024 and the US FTC's rule on consumer reviews both prohibit fake or
undisclosed-incentive reviews, with real penalties. It is also the worst
possible own goal for a product range whose entire pitch is being honest about
what will not work.

The build refuses to publish a review whose `order` does not resolve to a paid
Stripe session, so a fabricated one cannot reach the site by accident.

## Adding one

A buyer replies to their delivery email, or emails support. Ask permission to
publish, then create `content/reviews/<sku>-<something>.md`:

```markdown
---
sku: espresso-dial-in-card
rating: 5
author: Sam T.
location: Bristol
date: 2026-09-04
order: cs_test_a1b2c3...
---

Two weeks of sour shots and I was about to sell the machine. The channelling
page was the thing — I had been grinding finer every time and making it worse.
```

| Field | Notes |
| --- | --- |
| `sku` | Must match a product in the catalogue |
| `rating` | 1–5 |
| `author` | However they want to be credited. First name and initial is plenty |
| `location` | Optional |
| `date` | ISO, the day they sent it |
| `order` | Their Stripe session id. Verified at build; marks the review "Verified purchase" |

## Rules

- **Never edit the wording** beyond trimming length or fixing a typo, and never
  in a way that changes the meaning.
- **Publish the critical ones too.** A page of nothing but five stars reads as
  fake, and a three-star review explaining a real limitation sells better than
  another rave — it tells the reader the other reviews are honest.
- **Get permission in writing** before publishing anything, including a name.
- **Never offer anything in exchange** for a review. A discount for a review is
  an incentivised review and has to be disclosed as one, which destroys its
  value anyway.
