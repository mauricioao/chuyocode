/// <reference types="vitest" />
import { defineProject } from 'vitest/config';
import { testAliases } from './vitest.aliases';
import { splitTestFiles } from './src/testSupport/vitestProjectSplit';

// Plain Node unit tests: no DOM, no `.astro` rendering. Deliberately does
// NOT wrap in Astro's `getViteConfig()` — that plugin pipeline (Tailwind,
// React integration, i18n, adapter resolution) was the dominant cost when
// every test file paid for it (see vitest.config.ts).
export default defineProject({
  resolve: { alias: testAliases },
  test: {
    name: 'node',
    globals: true,
    environment: 'node',
    include: splitTestFiles(process.cwd()).node,
    // Threads spin up far cheaper than forked processes on Windows.
    pool: 'threads',
    // Vitest 4 removed `poolOptions.threads.{max,min}Threads` in favor of a
    // top-level `maxWorkers` (https://v4.vitest.dev/guide/migration, "Pool
    // Architecture Rewrite"); `minWorkers` has no replacement, it was removed
    // outright. `poolOptions` itself no longer exists as a config key.
    maxWorkers: 5,
    // 🔴 `isolate: false` USED TO BE SET HERE (skips the per-file
    // module-registry reset, the dominant "collect"/"prepare" cost — heavy
    // deps like @supabase/supabase-js were re-transformed/re-executed per
    // file). It was verified safe under Vitest 3 by running the full suite
    // twice and shuffled with identical results — see git history.
    //
    // Astro 7's upgrade (astro 7 / vite 8 / vitest 5) replaced Vitest's old
    // vite-node module runner with Vite's own Module Runner. Under that new
    // runner, `isolate: false` no longer keeps this project's files
    // independent: `vi.mock()`/`vi.fn()` state from one file now
    // nondeterministically leaks into another file sharing the same worker.
    // Observed directly: four consecutive `pnpm vitest run --project node`
    // runs each failed a DIFFERENT set of files (e.g. profile.test.ts's
    // `pendingCountMock.mockResolvedValue(7)` leaking into
    // src/pages/api/_me.test.ts's unrelated "not a moderator" expectation).
    // `isolate: true` made two consecutive runs identical and green
    // (152/152 files). The cost is small: the full three-project suite ran
    // in 179.86s vs. the pre-upgrade 174.66s baseline (~3% slower).
    //
    // This reverses this project's own stated intent to keep isolate:false,
    // so flag it on review rather than treating it as routine — a cheaper
    // mitigation (e.g. `pool: 'forks'`, or waiting on an upstream Vitest fix)
    // may exist; `true` was chosen here only because it is the safe default.
    isolate: true,
  },
});
