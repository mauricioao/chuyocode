import { defineConfig, devices } from '@playwright/test';
import { resolveLocalSupabase } from './tests/e2e/visual/localSupabase';

/**
 * Visual regression runner (`pnpm test:visual`) — tests/e2e/visual.spec.ts.
 *
 * A separate config (not a project in playwright.config.ts) because
 * Playwright's `webServer` is config-wide: this suite needs its OWN servers
 * with its own data, never a dev server another session already has open on
 * :4321. Self-contained and deterministic:
 *
 *  - Supabase: the LOCAL stack (`pnpm db:start`), resolved from the Supabase
 *    CLI and refused unless it is on a loopback host. globalSetup writes a
 *    fixed set of published activities; globalTeardown removes them
 *    (tests/e2e/visual/activityFixtures.ts).
 *  - Sanity: a local fixture server (tests/e2e/visual/sanityFixtureServer.mjs)
 *    answering the app's GROQ queries from a synthetic dataset; the app is
 *    pointed at it with `SANITY_FIXTURE_API_HOST` (src/lib/sanityConfig.ts).
 *  - Both servers are started fresh (`reuseExistingServer: false`) on their
 *    own ports, with every data-related env var set explicitly so a local
 *    `.env` can never point this suite at real content.
 *
 * See tests/e2e/README.md ("Visual snapshots") for how to run and update it.
 */
const APP_PORT = 4334;
const SANITY_FIXTURE_PORT = 4335;
const SANITY_FIXTURE_HOST = `http://127.0.0.1:${SANITY_FIXTURE_PORT}`;
// Public ids from sanity.config.ts (only used inside fixture image URL paths).
const SANITY_PROJECT_ID = 'z9wkqssq';
const SANITY_DATASET = 'production_';

const supabase = resolveLocalSupabase();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/visual.spec.ts',
  // One worker: the machine shares one cold dev server, and screenshots are
  // more stable without parallel page loads competing for it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // A cold `astro dev` compiles each route on its first request; on a loaded
  // machine that alone has taken minutes.
  timeout: 600_000,
  globalSetup: './tests/e2e/visual/globalSetup.ts',
  globalTeardown: './tests/e2e/visual/globalTeardown.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // The project name is part of every baseline file name
      // (`<name>-visual-win32.png`), so it stays `visual`.
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/visual/sanityFixtureServer.mjs',
      url: `${SANITY_FIXTURE_HOST}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(SANITY_FIXTURE_PORT),
        SANITY_PROJECT_ID,
        SANITY_DATASET,
      },
    },
    {
      command: `pnpm exec astro dev --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      // A cold dev server has taken up to ~20 minutes on a loaded machine.
      timeout: 1_800_000,
      env: {
        SUPABASE_URL: supabase.url,
        SUPABASE_ANON_KEY: supabase.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
        SANITY_PROJECT_ID,
        SANITY_DATASET,
        SANITY_FIXTURE_API_HOST: SANITY_FIXTURE_HOST,
      },
    },
  ],
});
