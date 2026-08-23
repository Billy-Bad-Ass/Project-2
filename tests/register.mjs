/**
 * Test-runner module hooks.
 *
 * Node can strip TypeScript types natively, but it does not know about the
 * `@/*` path alias from tsconfig.json, it will not guess a missing extension
 * the way a bundler does, and it requires an explicit `with { type: 'json' }`
 * attribute the app's TS imports do not carry. All three are handled here so
 * tests exercise the real application modules rather than a copy of them.
 */
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.json'];

/** Mirrors the bundler's extension resolution for alias imports. */
function withExtension(path) {
  if (existsSync(path) && !existsSync(join(path, 'package.json'))) return path;

  for (const ext of EXTENSIONS) {
    if (existsSync(path + ext)) return path + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexed = join(path, `index${ext}`);
    if (existsSync(indexed)) return indexed;
  }
  return path;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = specifier.startsWith('@/')
      ? pathToFileURL(withExtension(join(root, specifier.slice(2)))).href
      : specifier;

    const resolved = nextResolve(target, context);

    if (resolved.url.endsWith('.json')) {
      return { ...resolved, importAttributes: { type: 'json' } };
    }
    return resolved;
  },
});
