/**
 * Reads customer reviews from content/reviews/*.md.
 *
 * Reviews are repo content rather than database rows: there are few of them,
 * they are curated by hand from emails buyers send, and keeping them in git
 * means every change to a published review has an author and a diff.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './note-parser.mjs';

export function readReviews(dir) {
  if (!existsSync(dir)) return { reviews: [], problems: [] };

  const reviews = [];
  const problems = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
    const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
    const text = body.trim();

    const rating = Number(data.rating);
    if (!data.sku) problems.push(`${file}: missing \`sku\``);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      problems.push(`${file}: \`rating\` must be a whole number from 1 to 5`);
    }
    if (!data.author) problems.push(`${file}: missing \`author\``);
    if (!text) problems.push(`${file}: has no review text`);

    reviews.push({
      file,
      sku: data.sku ?? '',
      rating,
      author: data.author ?? '',
      location: data.location ?? '',
      date: data.date ?? '',
      order: data.order ?? '',
      verified: false, // set by the build once Stripe confirms the order
      text,
    });
  }

  reviews.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { reviews, problems };
}

/** Aggregate shown next to the product title. Null below the threshold — an
 *  average of one is noise, and displaying it invites the wrong inference. */
export function summarise(reviews, minimum = 3) {
  const rated = reviews.filter((r) => Number.isFinite(r.rating));
  if (rated.length < minimum) return null;

  const total = rated.reduce((sum, r) => sum + r.rating, 0);
  return {
    count: rated.length,
    average: Math.round((total / rated.length) * 10) / 10,
  };
}
