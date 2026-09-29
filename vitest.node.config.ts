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
  },
});
