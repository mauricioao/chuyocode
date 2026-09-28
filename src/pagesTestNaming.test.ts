import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Astro turns EVERY `.ts` file under `src/pages/` into a route, tests included.
 * A test there is compiled into the production server (it once broke the
 * Netlify build by dragging vite/rollup in, and `/es/auth/entrar.test`
 * answered 500 in production). Astro skips files prefixed with `_`, so tests
 * co-located with a page must be named `_<name>.test.ts`.
 */
const PAGES_DIR = fileURLToPath(new URL('./pages', import.meta.url));
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe('src/pages test naming', () => {
  it('prefixes every co-located test with `_` so Astro never routes it', () => {
    const routed = listFiles(PAGES_DIR)
      .filter((path) => TEST_FILE.test(path))
      .filter((path) => !path.split(/[\\/]/).pop()!.startsWith('_'))
      .map((path) => relative(PAGES_DIR, path));

    expect(routed).toEqual([]);
  });
});
