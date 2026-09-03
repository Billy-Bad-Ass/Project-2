/**
 * The shape the catalogue source is allowed to take.
 *
 * `catalog/products.json` and the note frontmatter are hand-edited, and until
 * now nothing checked them. A field with a typo in its name, or a price left
 * out entirely, produced `undefined` — which `JSON.stringify` drops silently,
 * so the key simply vanished from `catalog/generated.json` and the storefront
 * rendered a guide with no price. Nothing failed. That is the class of bug
 * this file exists to make impossible.
 *
 * Deliberately dependency-free, for the same reason `check-pdfs.mjs` counts
 * PDF pages by hand rather than adding a parser: these scripts run in CI on a
 * clean checkout, and a schema library is a lot of supply chain for a document
 * with four field types in it.
 *
 * Every validator takes (value, path) and returns an array of problem strings.
 * An empty array means the value is fine.
 */

/** Formats a value for a error message without dumping a whole object into it. */
const show = (value) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value === null) return 'null';
  if (typeof value === 'object') return 'an object';
  return String(value);
};

const typeName = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
};

/**
 * A required value that is simply absent is the most common authoring mistake
 * and deserves its own sentence rather than "expected a string, got undefined".
 */
const missing = (path) => [`${path} is missing`];

export const string = ({ min = 1, max = Infinity, pattern = null, hint = '' } = {}) =>
  function stringCheck(value, path) {
    if (value === undefined) return missing(path);
    if (typeof value !== 'string') return [`${path} must be a string, not ${typeName(value)}`];
    if (value.length < min) {
      return [`${path} must be at least ${min} character${min === 1 ? '' : 's'}, got ${show(value)}`];
    }
    if (value.length > max) return [`${path} must be at most ${max} characters, got ${value.length}`];
    if (pattern && !pattern.test(value)) {
      return [`${path} is ${show(value)}, which is not ${hint || `of the form ${pattern}`}`];
    }
    return [];
  };

export const integer = ({ min = -Infinity, max = Infinity } = {}) =>
  function integerCheck(value, path) {
    if (value === undefined) return missing(path);
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return [`${path} must be a whole number, not ${typeName(value)} (${show(value)})`];
    }
    if (value < min) return [`${path} must be at least ${min}, got ${value}`];
    if (value > max) return [`${path} must be at most ${max}, got ${value}`];
    return [];
  };

/**
 * A whole number that may arrive as a string.
 *
 * `parseFrontmatter` is a deliberately minimal YAML reader and returns every
 * scalar as a string, so `pages: 6` is `"6"`. Describing that honestly beats
 * coercing at the call site and pretending the file holds a number.
 */
export const integerish = ({ min = -Infinity, max = Infinity } = {}) =>
  function integerishCheck(value, path) {
    if (value === undefined) return missing(path);
    if (typeof value === 'number') return integer({ min, max })(value, path);
    if (typeof value !== 'string' || !/^-?\d+$/.test(value.trim())) {
      return [`${path} must be a whole number, got ${show(value)}`];
    }
    return integer({ min, max })(Number(value.trim()), path);
  };

export const oneOf = (values) =>
  function oneOfCheck(value, path) {
    if (value === undefined) return missing(path);
    if (!values.includes(value)) {
      return [`${path} is ${show(value)}, but must be one of: ${values.join(', ')}`];
    }
    return [];
  };

export const boolean = () =>
  function booleanCheck(value, path) {
    if (value === undefined) return missing(path);
    if (typeof value !== 'boolean') return [`${path} must be true or false, not ${typeName(value)}`];
    return [];
  };

export const arrayOf = (item, { min = 0, max = Infinity } = {}) =>
  function arrayCheck(value, path) {
    if (value === undefined) return missing(path);
    if (!Array.isArray(value)) return [`${path} must be an array, not ${typeName(value)}`];
    if (value.length < min) return [`${path} must have at least ${min} entr${min === 1 ? 'y' : 'ies'}, got ${value.length}`];
    if (value.length > max) return [`${path} must have at most ${max} entries, got ${value.length}`];
    return value.flatMap((entry, index) => item(entry, `${path}[${index}]`));
  };

/** Allows an explicit null — used for `badge`, which is meaningfully absent. */
export const nullable = (inner) =>
  function nullableCheck(value, path) {
    if (value === null) return [];
    return inner(value, path);
  };

/** Allows the key to be left out entirely, but still checks it when present. */
export const optional = (inner) =>
  function optionalCheck(value, path) {
    if (value === undefined) return [];
    return inner(value, path);
  };

/**
 * Unknown keys are errors, not curiosities. A misspelt `priceMiner` would
 * otherwise sit in the file looking correct while the real field went missing,
 * which is the exact failure this whole module is here to prevent.
 */
export const object = (fields, { allowExtra = [] } = {}) =>
  function objectCheck(value, path) {
    if (value === undefined) return missing(path);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return [`${path} must be an object, not ${typeName(value)}`];
    }

    const problems = Object.entries(fields).flatMap(([key, check]) =>
      check(value[key], path ? `${path}.${key}` : key),
    );

    const known = new Set([...Object.keys(fields), ...allowExtra]);
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        problems.push(`${path ? `${path}.` : ''}${key} is not a field this file has — check the spelling`);
      }
    }
    return problems;
  };

/* ------------------------------------------------------------------ *
 * The catalogue's own schemas
 * ------------------------------------------------------------------ */

/** A sku is a filename, a URL segment and a Stripe lookup key all at once. */
export const SKU = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Accents are inlined into CSS, so anything but a six-digit hex breaks quietly. */
export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const money = integer({ min: 100, max: 100_000 });

const PRODUCT_ENTRY = object({
  sku: string({ pattern: SKU, hint: 'a lowercase hyphenated slug', max: 64 }),
  priceMinor: money,
  order: integer({ min: 1 }),
  badge: nullable(string({ max: 24 })),
  accent: string({ pattern: HEX_COLOUR, hint: 'a six-digit hex colour like #7C3E12' }),
  icon: string({ max: 40 }),
  blurb: string({ min: 20, max: 400 }),
});

const BUNDLE_ENTRY = object({
  sku: string({ pattern: SKU, hint: 'a lowercase hyphenated slug', max: 64 }),
  title: string({ max: 120 }),
  priceMinor: money,
  order: integer({ min: 1 }),
  badge: nullable(string({ max: 24 })),
  accent: string({ pattern: HEX_COLOUR, hint: 'a six-digit hex colour like #7C3E12' }),
  icon: string({ max: 40 }),
  blurb: string({ min: 20, max: 400 }),
  includes: arrayOf(string({ pattern: SKU, hint: 'a lowercase hyphenated slug' }), { min: 2 }),
});

export const PRODUCTS_JSON = object(
  {
    currency: oneOf(['usd', 'gbp', 'eur']),
    merchant: object({
      name: string({ max: 80 }),
      tagline: string({ max: 160 }),
      supportEmail: string({ pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, hint: 'an email address' }),
    }),
    products: arrayOf(PRODUCT_ENTRY, { min: 1 }),
    bundles: arrayOf(BUNDLE_ENTRY),
  },
  // The file documents itself at the top. That is worth keeping.
  { allowExtra: ['$comment'] },
);

/**
 * Note frontmatter. `pages` is checked here because `release-check.mjs` asks an
 * agent to compare the built PDF against it — a number a human maintains by
 * hand, that another check trusts, is exactly the number worth verifying.
 */
export const NOTE_FRONTMATTER = object(
  {
    slug: string({ pattern: SKU, hint: 'a lowercase hyphenated slug', max: 64 }),
    title: string({ max: 120 }),
    subtitle: optional(string({ max: 160 })),
    pages: integerish({ min: 1, max: 200 }),
    status: oneOf(['ready', 'needs-content']),
    sourceNote: optional(string()),
    contentGap: optional(string()),
    landscapePages: optional(arrayOf(integerish({ min: 1 }))),
  },
  { allowExtra: [] },
);
