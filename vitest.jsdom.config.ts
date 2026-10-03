/// <reference types="vitest" />
import { defineProject } from 'vitest/config';
import { testAliases } from './vitest.aliases';
import { splitTestFiles } from './src/testSupport/vitestProjectSplit';

// React island / component tests rendered with @testing-library/react.
// These render components directly (not through an Astro island), so they
// need jsdom but not Astro's Vite plugin — esbuild already transforms JSX
// per tsconfig.json's `jsx: "react-jsx"` / `jsxImportSource: "react"`.
export default defineProject({
  resolve: { alias: testAliases },
  test: {
    name: 'jsdom',
    globals: true,
    environment: 'jsdom',
    include: splitTestFiles(process.cwd()).jsdom,
    // Threads spin up cheaper than forked processes on Windows (see
    // vitest.node.config.ts). Keeps default isolation: `--sequence.shuffle`
    // showed real cross-file leakage with `isolate: false` here (some files,
    // e.g. WorksheetZoneEditor.test.tsx / EditorSideToolbar.test.tsx, rely on
    // `window.matchMedia` having been set up by an earlier file rather than
    // mocking it themselves) — 27 tests failed. Not worth the speed win.
    pool: 'threads',
    // See vitest.node.config.ts: `poolOptions.threads.maxThreads` became the
    // top-level `maxWorkers` in Vitest 4; `poolOptions` no longer exists.
    maxWorkers: 5,
  },
});
