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
  },
});
