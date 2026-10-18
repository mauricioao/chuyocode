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
      testIgnore: ['**/visual.spec.ts', '**/auth.setup.ts'],
    },
    // Signed-in e2e (tests/e2e/README.md): `setup` logs in once per role via
    // the real password sign-in endpoint and saves storageState; the
    // `chromium-signed-in` project below reuses it instead of signing in per
    // test. Both need local Supabase running with the e2e fixture seed, so
    // neither runs under `chromium`/`pnpm test:e2e` — only via
    // `pnpm test:e2e:auth`.
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    {
      name: 'chromium-signed-in',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/regular.json' },
      dependencies: ['setup'],
      testMatch: ['**/desk-widgets-part4.spec.ts', '**/desk-helper-part5.spec.ts', '**/desk-minimized-tray-part6b.spec.ts', '**/editor-mobile-layout.spec.ts'],
    },
    // Visual regression (tests/e2e/visual.spec.ts) has its OWN config,
    // playwright.visual.config.ts (`pnpm test:visual`): it needs its own dev
    // server on its own port with local Supabase + fixture Sanity data, and
    // `webServer` is config-wide. It stays out of `chromium` above, and never
    // runs in CI (CI runs typecheck, test, build only — .github/workflows/ci.yml).
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
