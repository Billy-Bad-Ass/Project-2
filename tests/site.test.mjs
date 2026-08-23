import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression cover for the bug that broke the first Cloudflare deploy:
 * NEXT_PUBLIC_SITE_URL was present but empty, `?? fallback` did not fire
 * because `??` only catches undefined, and `new URL('')` threw during
 * `next build` while collecting page metadata.
 */

const original = process.env.NEXT_PUBLIC_SITE_URL;

// Read at call time, so the module can be imported once and the env varied.
let site;
beforeEach(async () => {
  site = await import('../lib/site.ts');
});
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

test('an empty value is treated as unset, not as a URL', () => {
  process.env.NEXT_PUBLIC_SITE_URL = '';
  assert.equal(site.configuredSiteUrl(), '');
  assert.equal(site.metadataBaseUrl(), site.FALLBACK_SITE_URL);
  assert.doesNotThrow(() => new URL(site.metadataBaseUrl()));
});

test('a whitespace-only value is treated as unset', () => {
  process.env.NEXT_PUBLIC_SITE_URL = '   ';
  assert.equal(site.configuredSiteUrl(), '');
  assert.doesNotThrow(() => new URL(site.metadataBaseUrl()));
});

test('an absent value falls back without throwing', () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(site.configuredSiteUrl(), '');
  assert.equal(site.metadataBaseUrl(), site.FALLBACK_SITE_URL);
  assert.doesNotThrow(() => new URL(site.metadataBaseUrl()));
});

test('a real origin is returned unchanged', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://store.example.com';
  assert.equal(site.configuredSiteUrl(), 'https://store.example.com');
  assert.equal(site.metadataBaseUrl(), 'https://store.example.com');
});

test('trailing slashes are stripped so joined paths never double up', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://store.example.com///';
  assert.equal(site.configuredSiteUrl(), 'https://store.example.com');
  assert.equal(`${site.configuredSiteUrl()}/api/download`, 'https://store.example.com/api/download');
});

test('a malformed value degrades to the fallback rather than failing the build', () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'not a url at all';
  assert.doesNotThrow(() => new URL(site.metadataBaseUrl()));
  assert.equal(site.metadataBaseUrl(), site.FALLBACK_SITE_URL);
});
