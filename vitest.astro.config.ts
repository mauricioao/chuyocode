/// <reference types="vitest" />
import { getViteConfig } from 'astro/config';
import { splitTestFiles } from './src/testSupport/vitestProjectSplit';

// The only tests that need Astro's Vite plugin: they render a `.astro`
// component through the experimental Container API (directly, or via
// src/testSupport/astroContainer.ts).
export default getViteConfig({
  test: {
    name: 'astro',
    globals: true,
    environment: 'node',
    include: splitTestFiles(process.cwd()).astro,
  },
});
