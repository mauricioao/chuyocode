import { test as setup } from '@playwright/test';

/**
 * Signs in once per role, through the REAL password sign-in endpoint
 * (`POST /api/auth/password`, action `signin` — src/pages/api/auth/
 * password.ts), and saves each resulting session as Playwright storageState.
 * The `chromium-signed-in` project (playwright.config.ts) depends on this
 * project and reuses those files instead of signing in per test.
 *
 * Needs local Supabase running with the e2e fixture seed applied
 * (`pnpm db:start`, which runs `supabase/seed.sql` — see tests/e2e/README.md)
 * and the dev server pointed at it (SUPABASE_URL/SUPABASE_ANON_KEY env vars,
 * same README). Using the real endpoint — not a crafted cookie — is what
 * proves the fixture actually exercises the app's own sign-in path, the
 * same cookies (`httpOnly`, `sameSite: 'lax'`) a real browser session gets.
 */

const FIXTURE_PASSWORD = 'ChuyoE2E!2026';

const ROLES = [
  { role: 'regular', email: 'e2e-regular@chuyocode.test', authFile: 'playwright/.auth/regular.json' },
  { role: 'moderator', email: 'e2e-moderator@chuyocode.test', authFile: 'playwright/.auth/moderator.json' },
] as const;

for (const { role, email, authFile } of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const response = await page.request.post('/api/auth/password', {
      data: { action: 'signin', email, password: FIXTURE_PASSWORD, lang: 'es' },
    });
    if (!response.ok()) {
      throw new Error(
        `Sign-in fixture failed for ${email}: HTTP ${response.status()}. ` +
          'Is local Supabase running with the e2e seed (pnpm db:start)? See tests/e2e/README.md.',
      );
    }
    const body = (await response.json()) as { ok?: boolean };
    if (body.ok !== true) {
      throw new Error(`Sign-in fixture rejected for ${email}: ${JSON.stringify(body)}`);
    }

    await page.context().storageState({ path: authFile });
  });
}
