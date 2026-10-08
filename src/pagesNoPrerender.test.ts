import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * A prerendered route makes `astro build` run the middleware, and the
 * middleware imports modules that call `loadEnv()` at import time
 * (`@lib/supabaseSession`, `@lib/sanity`). CI builds without the deployment
 * secrets, so a single `prerender = true` failed every PR's build with
 * `MissingEnvError`. Serve such routes from SSR with CDN caching instead.
 */
const PAGES_DIR = fileURLToPath(new URL('./pages', import.meta.url));
const PRERENDER = /export\s+const\s+prerender\s*=\s*true/;

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(path);
    return /\.(astro|ts)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('src/pages', () => {
  it('prerenders no route, so the build never needs the deployment secrets', () => {
    const prerendered = listRouteFiles(PAGES_DIR)
      .filter((path) => PRERENDER.test(readFileSync(path, 'utf8')))
      .map((path) => relative(PAGES_DIR, path));

    expect(prerendered).toEqual([]);
  });
});
