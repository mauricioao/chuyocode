import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitTestFiles } from './vitestProjectSplit';

/**
 * Guards the Vitest node/jsdom/astro project split (see
 * `vitestProjectSplit.ts`, `vitest.node.config.ts`, `vitest.jsdom.config.ts`,
 * `vitest.astro.config.ts`). All three project configs derive their
 * `include` from `splitTestFiles`, so the real risk isn't a hand-maintained
 * list drifting — it's a test that renders a `.astro` file WITHOUT going
 * through `astro/container`, `astro:container` or the shared
 * `astroContainer` helper's import, which the classifier would then miss and
 * silently route to a project without Astro's Vite plugin.
 */
describe('vitest project split', () => {
  it('routes every discovered test file into exactly one project', () => {
    const split = splitTestFiles(process.cwd());
    const buckets = [...split.astro, ...split.jsdom, ...split.node];
    const unique = new Set(buckets);

    expect(buckets.length).toBeGreaterThan(0);
    expect(unique.size).toBe(buckets.length);
  });

  it('routes every astro-container test through the astro project', () => {
    const split = splitTestFiles(process.cwd());
    const astroContentPattern =
      /from\s+['"](?:astro\/container|astro:container|[^'"]*astroContainer)['"]/;

    for (const file of [...split.jsdom, ...split.node]) {
      expect(astroContentPattern.test(readFileSync(file, 'utf8'))).toBe(false);
    }
  });
});
