import { defineConfig, devices } from '@playwright/test';

// End-to-end runner. Boots the Astro SSR server and drives real browser flows
// (pass gate, dark no-flash, redirects). Unit/integration tests run in Vitest.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/visual.spec.ts',
    },
    // Visual regression (toHaveScreenshot) — deliberately excluded from the
    // `chromium` project above and from `pnpm test:e2e`. Baselines are
    // OS-specific (see tests/e2e/visual.spec.ts header), so this only runs
    // on request via `pnpm test:visual`, never in CI (CI runs typecheck,
    // test, build only — see .github/workflows/ci.yml).
    {
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/visual.spec.ts',
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    // A fresh worktree's first `astro dev` re-optimizes dependencies and
    // took 137 s on this machine, past the old 120 s limit.
    timeout: 300_000,
  },
});
