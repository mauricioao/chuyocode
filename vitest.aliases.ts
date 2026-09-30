import { fileURLToPath } from 'node:url';

// Mirrors tsconfig.json's `compilerOptions.paths`. `getViteConfig()` (used by
// vitest.astro.config.ts) derives these from tsconfig automatically; the
// plain node/jsdom projects don't load Astro's config, so they need this
// explicitly. Keep in sync with tsconfig.json if the paths ever change.
const src = fileURLToPath(new URL('./src', import.meta.url));

export const testAliases = {
  '@': src,
  '@lib': `${src}/lib`,
  '@components': `${src}/components`,
  '@layouts': `${src}/layouts`,
  '@styles': `${src}/styles`,
};
