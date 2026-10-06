import { test, expect, type Page } from '@playwright/test';

/**
 * The practice page as a WINDOW over the desk ("desktop" redesign PART 6a,
 * owner spec 2026-10-06, "la dirección cambia por detrás, pero vos nunca
 * salís del escritorio"). The guest-play practice page is PUBLIC
 * (`@lib/access.ts#isPublicActivityRoute`), so every test below runs against
 * a real anonymous Playwright session — no e2e auth fixture needed, unlike
 * `desk-widgets-part4.spec.ts`'s own hub tests.
 */

/**
 * A real published activity's practice-page path, read from the live
 * sitemap — same approach as `chrome-visibility.spec.ts`'s own
 * `findInglesActivityPath`, so this skips gracefully instead of asserting
 * against a 404 when the dev database has no published activity yet.
 */
async function findInglesActivityPath(page: Page): Promise<string | null> {
  const res = await page.request.get('/sitemap.xml');
  if (!res.ok()) return null;
  const xml = await res.text();
  const match = xml.match(/<loc>[^<]*(\/es\/ingles\/actividades\/[^<]+)<\/loc>/);
  return match ? match[1] : null;
}

test.describe('practice page as a window over the desk (PART 6a), guest (public)', () => {
  test('renders the window chrome: a dialog, three named "traffic light" buttons, and the title', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);

    const dialog = page.locator('[data-desk-window]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('link', { name: 'Cerrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Minimizar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
    // No desk behind the window for a guest — the hub is gated, so the
    // window opens over a plain background instead (file header).
    await expect(page.locator('[data-desk]')).toHaveCount(0);
  });

  test('Escape sends a guest to the ChuyoCode home (never the gated hub)', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/es\/$/);
  });

  test('the red ("Cerrar") light sends a guest to the ChuyoCode home, not the gated hub', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);
    await page.getByRole('link', { name: 'Cerrar' }).click();
    await expect(page).toHaveURL(/\/es\/$/);
  });

  test('the window is a full-screen sheet on phones (inset 0, no radius)', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path!);

    const dialog = page.locator('[data-desk-window]');
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y)).toBe(0);
    const radius = await dialog.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(radius).toBe('0px');
  });

  test('does not scroll horizontally at 360px', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path!);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(360);
  });
});
