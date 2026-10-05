/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

// Unit/integration test runner. E2E lives in Playwright (see
// playwright.config.ts) and is excluded here so `pnpm vitest run` stays fast.
//
// Split into three projects so only the tests that actually render a
// `.astro` file pay for Astro's Vite plugin (Tailwind, React integration,
// i18n, adapter resolution) — see vitest.node.config.ts, vitest.jsdom.config.ts
// and vitest.astro.config.ts, and src/testSupport/vitestProjectSplit.ts for
// how test files are classified into each one.
//
// `pnpm test` / `pnpm vitest run` still runs everything across all three
// projects. To run just one: `pnpm vitest run --project node` (or
// `jsdom` / `astro`). A single file still works as before:
// `pnpm vitest run <path>`.
export default defineConfig({
  test: {
    projects: ['./vitest.node.config.ts', './vitest.jsdom.config.ts', './vitest.astro.config.ts'],
    // `silent` is workspace-wide (Vitest's `NonProjectOptions`), so it can only
    // be set here, never inside a `defineProject()` config. `'passed-only'`
    // (Vitest 5+) keeps a passing run's console output out of the log — a
    // single real CI failure used to be buried under console noise from
    // thousands of unrelated passing tests; a failing test's console output
    // still prints, which is the only case it is actually useful for.
    silent: 'passed-only',
  },
});
