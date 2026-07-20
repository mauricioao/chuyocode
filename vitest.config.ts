/// <reference types="vitest" />
import { getViteConfig } from 'astro/config';

// Unit/integration test runner. E2E lives in Playwright (see playwright.config.ts)
// and is excluded here so `pnpm vitest run` stays fast and focused.
//
// We wrap the config with Astro's `getViteConfig` so the Astro Vite plugin is
// registered: this lets Vitest transform `.astro` components (rendered via the
// experimental Container API) instead of failing to parse their template JS.
export default getViteConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
  },
});
