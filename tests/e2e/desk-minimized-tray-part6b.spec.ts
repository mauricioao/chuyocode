import { test, expect, type Page } from '@playwright/test';

/**
 * Minimized-windows tray — "desktop" redesign PART 6b (owner feedback
 * 2026-10-06): the practice window's yellow light REALLY minimizes now
 * (`@lib/ui/minimizedWindows.ts`, `@lib/ui/deskWindow.ts#initDeskWindow`'s
 * own `minimize()`) instead of just doing exactly what the red light does.
 *
 * The tray itself lives on the desk (`DeskScene.astro`), which only renders
 * for a SIGNED-IN visitor — the practice page's own guest-play carve-out
 * (`@lib/access.ts#isPublicActivityRoute`) means an anonymous Playwright
 * session reaches the PRACTICE page itself just fine (no redirect to sign-
 * in), but with no desk/tray behind it (`forceFullScreen`/`trayId=null`,
 * `DeskWindow.astro`'s own header) — its minimize falls back to doing
 * exactly what close does, straight to the ChuyoCode home. The real tray
 * behaviour below needs an actual desk, i.e. a signed-in visitor — same
 * posture as `desk-widgets-part4.spec.ts`'s own `gotoHubOrSkip`: this repo
 * has no e2e auth fixture yet, so every test below skips gracefully when no
 * `[data-desk]` renders behind the window, rather than asserting against
 * guest-only behaviour. These become real checks the moment an e2e auth
 * fixture lands, with no change needed here.
 */

async function findInglesActivityPath(page: Page): Promise<string | null> {
  const res = await page.request.get('/sitemap.xml');
  if (!res.ok()) return null;
  const xml = await res.text();
  const match = xml.match(/<loc>[^<]*(\/es\/ingles\/actividades\/[^<]+)<\/loc>/);
  return match ? match[1] : null;
}

/** Visits `path` and reports whether a real desk (signed-in visitor) renders behind the window. */
async function gotoActivityOrSkip(page: Page, path: string): Promise<boolean> {
  await page.goto(path);
  return (await page.locator('[data-desk]').count()) > 0;
}

test.describe('minimized-windows tray (PART 6b), signed-in', () => {
  test('minimizing a practice window lands on the hub with a chip for it in the tray', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in; no e2e auth fixture in this repo yet');

    await page.getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);

    const tray = page.locator('[data-minimized-tray]');
    await expect(tray).toBeVisible();
    await expect(tray.locator('[data-desk-window-open]')).toHaveCount(1);
  });

  test('clicking the chip reopens the exact same activity', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in; no e2e auth fixture in this repo yet');

    await page.getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);

    await page.locator('[data-minimized-tray] [data-desk-window-open]').first().click();
    await expect(page).toHaveURL(new RegExp(path!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('[data-desk-window]')).toBeVisible();
  });

  test('closing (red light) drops the chip for that activity', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in; no e2e auth fixture in this repo yet');

    await page.getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
    await expect(page.locator('[data-minimized-tray] [data-desk-window-open]')).toHaveCount(1);

    await page.locator('[data-minimized-tray] [data-desk-window-open]').first().click();
    await page.getByRole('link', { name: 'Cerrar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
    await expect(page.locator('[data-minimized-tray] [data-desk-window-open]')).toHaveCount(0);
  });

  test("the chip's own close button removes it from the tray without navigating", async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity');

    const signedIn = await gotoActivityOrSkip(page, path!);
    test.skip(!signedIn, 'No desk behind the window — guest visit or redirected to sign-in; no e2e auth fixture in this repo yet');

    await page.getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);

    const chip = page.locator('[data-minimized-tray] [data-desk-window-open]').first();
    await chip.hover();
    await chip.getByRole('button').click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
    await expect(page.locator('[data-minimized-tray] [data-desk-window-open]')).toHaveCount(0);
  });
});
