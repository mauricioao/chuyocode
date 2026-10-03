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
    // Threads spin up cheaper than forked processes on Windows. Keeps default
    // isolation (unlike the node/jsdom projects): rendering `.astro` files
    // through the Container API is more likely to touch Astro-internal
    // module-level state, and this project is only 24 files.
    pool: 'threads',
    // See vitest.node.config.ts: `poolOptions.threads.maxThreads` became the
    // top-level `maxWorkers` in Vitest 4; `poolOptions` no longer exists.
    maxWorkers: 5,
  },
});
