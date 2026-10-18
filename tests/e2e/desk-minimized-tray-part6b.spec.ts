import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { localSupabaseAdmin, localSupabaseRest, type LocalSupabaseAdmin } from './support/localSupabaseAdmin';

/**
 * Minimized-windows tray — "desktop" redesign PART 6b (owner feedback
 * 2026-10-06): the practice window's yellow light REALLY minimizes now
 * (`@lib/ui/minimizedWindows.ts`, `@lib/ui/deskWindow.ts#initDeskWindow`'s
 * own `minimize()`) instead of just doing exactly what the red light does.
 *
 * The tray itself (PART 6c: its own fixed bottom-right container,
 * `MinimizedWindowsTray.astro`, mounted by `BaseLayout.astro` on every
 * Inglés page) only ever has anything in it for a SIGNED-IN visitor's own
 * minimized windows — the practice page's own guest-play carve-out
 * (`@lib/access.ts#isPublicActivityRoute`) means an anonymous Playwright
 * session reaches the PRACTICE page itself just fine (no redirect to sign-
 * in), but with no desk/tray behind it (`forceFullScreen`/`trayId=null`,
 * `DeskWindow.astro`'s own header) — its minimize falls back to doing
 * exactly what close does, straight to the ChuyoCode home. The real tray
 * behaviour below needs an actual desk, i.e. a signed-in visitor — same
 * posture as `desk-widgets-part4.spec.ts`'s own `gotoHubOrSkip`: every test
 * skips gracefully when no `[data-desk]` renders behind the window.
 *
 * Signed-in runs (`pnpm test:e2e:auth`, tests/e2e/README.md) seed their own
 * published activity in LOCAL Supabase before the suite and delete it after,
 * so the fixture seed stays users-only. That only ever happens when
 * SUPABASE_URL points at localhost and SUPABASE_SERVICE_ROLE_KEY is set;
 * otherwise the spec falls back to the first activity in /sitemap.xml. The
 * local-admin guard/REST helpers themselves live in
 * `support/localSupabaseAdmin.ts` (factored out night-of 2026-10-18 so
 * `editor-mobile-layout.spec.ts` could self-seed the same way) — this file's
 * own seed/cleanup shape is otherwise unchanged.
 */

const SEEDED_ACTIVITY_ID = 'e2e0b6b0-0000-4000-8000-000000000001';
const SEEDED_REVISION_ID = 'e2e0b6b0-0000-4000-8000-000000000002';
/** The moderator fixture user from supabase/seed.sql authors it, so the signed-in regular user sees a community activity. */
const SEEDED_AUTHOR_ID = '22222222-2222-2222-2222-222222222222';

async function deleteSeededActivity(admin: LocalSupabaseAdmin): Promise<void> {
  await localSupabaseRest(admin, `activities?id=eq.${SEEDED_ACTIVITY_ID}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft', published_revision_id: null }) });
  await localSupabaseRest(admin, `activity_revisions?activity_id=eq.${SEEDED_ACTIVITY_ID}`, { method: 'DELETE' });
  await localSupabaseRest(admin, `activities?id=eq.${SEEDED_ACTIVITY_ID}`, { method: 'DELETE' });
}

/** Publishes one minimal quiz activity in local Supabase; returns its practice path, or null when no local admin access. */
async function seedPublishedActivity(): Promise<string | null> {
  const admin = localSupabaseAdmin();
  if (!admin) return null;
  await deleteSeededActivity(admin);
  await localSupabaseRest(admin, 'activities', {
    method: 'POST',
    body: JSON.stringify({
      id: SEEDED_ACTIVITY_ID,
      author_id: SEEDED_AUTHOR_ID,
      title: 'E2E tray activity',
      level: 'A1',
      status: 'draft',
      block_types: ['quiz'],
      block_count: 1,
      published_at: new Date().toISOString(),
    }),
  });
  await localSupabaseRest(admin, 'activity_revisions', {
    method: 'POST',
    body: JSON.stringify({
      id: SEEDED_REVISION_ID,
      activity_id: SEEDED_ACTIVITY_ID,
      status: 'approved',
      created_by: SEEDED_AUTHOR_ID,
      blocks: [{ id: 'b1', type: 'quiz', payload: { pools: {}, slots: [{ id: 's1', label: 'cat', input: 'text', answer: ['cat'] }] } }],
    }),
  });
  await localSupabaseRest(admin, `activities?id=eq.${SEEDED_ACTIVITY_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'live', published_revision_id: SEEDED_REVISION_ID }),
  });
  return `/es/ingles/actividades/${SEEDED_ACTIVITY_ID}`;
}

async function findInglesActivityPath(page: Page): Promise<string | null> {
  if (seededPath) return seededPath;
  const res = await page.request.get('/sitemap.xml');
  if (!res.ok()) return null;
  const xml = await res.text();
  const match = xml.match(/<loc>[^<]*(\/es\/ingles\/actividades\/[^<]+)<\/loc>/);
  return match ? match[1] : null;
}

let seededPath: string | null = null;

// One worker, in order: the seeded row is shared, so parallel workers' own
// beforeAll/afterAll pairs must never race to create/delete it.
test.describe.configure({ mode: 'default' });

test.beforeAll(async () => {
  seededPath = await seedPublishedActivity();
});

test.afterAll(async () => {
  const admin = localSupabaseAdmin();
  if (admin && seededPath) await deleteSeededActivity(admin);
});

/** Visits `path` and reports whether a real desk (signed-in visitor) renders behind the window. */
async function gotoActivityOrSkip(page: Page, path: string): Promise<boolean> {
  await page.goto(path);
  return (await page.locator('[data-desk]').count()) > 0;
}

/**
 * A signed-in visit opens the activity as a desk window: a same-origin
 * `<iframe>` managed by `@lib/ui/deskWindowManager`, whose traffic lights
 * (Cerrar/Minimizar) live INSIDE the frame and talk to the host through
 * `@lib/ui/deskWindowMessaging`.
 */
function activityWindow(page: Page): FrameLocator {
  return page.frameLocator('iframe').first();
}

const chips = (page: Page) => page.locator('[data-minimized-tray] [data-minimized-chip]');

test.describe('minimized-windows tray (PART 6b), signed-in', () => {
  // At the default 1280x720 the tray collapses even one chip into "+1" so it
  // never covers the folders column (`computeMaxVisibleMinimizedChips`);
  // 1440x900 leaves room for the chip itself.
  test.use({ viewport: { width: 1440, height: 900 } });

  test('minimizing a practice window lands on the hub with a chip for it in the tray', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in');

    await activityWindow(page).getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);

    await expect(page.locator('[data-minimized-tray]')).toBeVisible();
    await expect(chips(page)).toHaveCount(1);
  });

  test('clicking the chip reopens the exact same activity', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in');

    await activityWindow(page).getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);

    await chips(page).first().click();
    await expect(page).toHaveURL(new RegExp(path!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(activityWindow(page).getByRole('link', { name: 'Minimizar' })).toBeVisible();
  });

  test('closing (red light) drops the chip for that activity', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in');

    await activityWindow(page).getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
    await expect(chips(page)).toHaveCount(1);

    await chips(page).first().click();
    await activityWindow(page).getByRole('link', { name: 'Cerrar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
    await expect(chips(page)).toHaveCount(0);
  });

  test("the chip's own close button removes it from the tray without navigating", async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in');

    await activityWindow(page).getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);

    const chip = chips(page).first();
    await chip.hover();
    await chip.getByRole('button').click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
    await expect(chips(page)).toHaveCount(0);
  });
});
