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
    // Threads spin up far cheaper than forked processes on Windows, and
    // `isolate: false` skips the per-file module-registry reset — the
    // dominant "collect"/"prepare" cost (heavy deps like @supabase/supabase-js
    // were being re-transformed and re-executed for every one of the ~100
    // files that import them). Safe here: these are pure lib/API-handler
    // tests with no shared mutable module state, verified by running the
    // full suite twice and shuffled (`--sequence.shuffle`) with identical
    // results.
    pool: 'threads',
    poolOptions: { threads: { maxThreads: 5, minThreads: 1 } },
    isolate: false,
  },
});
