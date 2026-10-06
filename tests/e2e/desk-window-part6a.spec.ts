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

/**
 * Regression for the CRITICAL bug fixed alongside the above (owner report,
 * 2026-10-06): the window used to render INSIDE `<main>`, whose own
 * `view-transition-name` (from `transition:animate`) gave it a stacking
 * context of its own — trapping the window's fixed `z-30` under the
 * footer, a later DOM sibling with no stacking context of its own. Fixed
 * by rendering the window through `BaseLayout.astro`'s `overlay` slot (last
 * in `<body>`, after the footer, outside `<main>`) at `z-50` — see that
 * slot's own comment and `global.css`'s `.ingles-window-veil` header.
 */
test.describe('the window paints above the footer and every other chrome element (PART 6a bugfix)', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`elementFromPoint at Comprobar/Ajustar resolves inside the dialog at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.setViewportSize(viewport);
      await page.goto(path!);

      const resolvesInsideDialog = async (locator: ReturnType<Page['locator']>) => {
        const box = await locator.boundingBox();
        expect(box, 'expected the control to have a bounding box').not.toBeNull();
        if (!box) return false;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        return page.evaluate(
          ([px, py]) => document.elementFromPoint(px, py)?.closest('[data-desk-window]') != null,
          [x, y],
        );
      };

      const checkButton = page.locator('[data-testid="practice-check-button"]');
      await expect(checkButton).toBeVisible();
      expect(await resolvesInsideDialog(checkButton)).toBe(true);

      // The zoom "Ajustar" control only renders at `lg:` and up (the
      // desktop camera toolbar, `WorksheetPracticePlayer.tsx`'s own
      // `toolbarSlot`) — unrelated, pre-existing behaviour, not something
      // this fix changes. Checked whenever it is actually on screen.
      const zoomFit = page.locator('[data-testid="practice-zoom-fit"]');
      if (await zoomFit.isVisible()) {
        expect(await resolvesInsideDialog(zoomFit)).toBe(true);
      }
    });
  }
});

test.describe('focus behaviour on open (PART 6a bugfix)', () => {
  test('initial focus lands on the dialog itself, never the red light (no focus-ring flash)', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);
    await expect(page.locator('[data-desk-window]')).toBeFocused();
  });

  test('Tab and Shift+Tab cycle within the dialog; Escape still closes', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);
    await expect(page.locator('[data-desk-window]')).toBeFocused();

    // Forward: container -> first focusable (the red light).
    await page.keyboard.press('Tab');
    const onFirst = await page.evaluate(() => document.activeElement?.hasAttribute('data-desk-window-close') ?? false);
    expect(onFirst).toBe(true);

    // Shift+Tab from the first element wraps to the dialog's own LAST
    // focusable element instead of leaving the dialog entirely.
    await page.keyboard.press('Shift+Tab');
    const wrappedToLast = await page.evaluate(() => {
      const dialog = document.querySelector('[data-desk-window]');
      const focusable = dialog
        ? Array.from(
            dialog.querySelectorAll(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
      return focusable.length > 0 && document.activeElement === focusable[focusable.length - 1];
    });
    expect(wrappedToLast).toBe(true);

    // Tab from the last element wraps back to the first.
    await page.keyboard.press('Tab');
    const wrappedToFirst = await page.evaluate(() => {
      const dialog = document.querySelector('[data-desk-window]');
      const focusable = dialog
        ? Array.from(
            dialog.querySelectorAll(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
      return focusable.length > 0 && document.activeElement === focusable[0];
    });
    expect(wrappedToFirst).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/es\/$/);
  });
});

test.describe('phone layout (PART 6a bugfix, < the `desk:` breakpoint)', () => {
  test('the worksheet canvas fills the space between the title bar and the bottom bar (no empty gap)', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path!);

    const viewport = page.locator('[data-testid="practice-mobile-viewport"]');
    test.skip(
      (await viewport.count()) === 0,
      'This activity has no worksheet block (or the viewport is not the mobile one) — nothing to measure',
    );

    const canvasBox = await viewport.boundingBox();
    const footerBox = await page.locator('[data-testid="practice-footer"]').boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    if (!canvasBox || !footerBox) return;

    // The canvas must reach all the way down to (within a few px of) the
    // footer's own top edge — the old `aspectRatio`-sized box left a large
    // empty gap here instead.
    const gap = footerBox.y - (canvasBox.y + canvasBox.height);
    expect(gap).toBeLessThan(8);
  });

  test('the title bar stays one row (hearts, Compartir and the "Más" trigger fit) and the page never scrolls horizontally', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path!);

    const titlebar = page.locator('[data-testid="desk-window-titlebar"]');
    const box = await titlebar.boundingBox();
    expect(box).not.toBeNull();
    // A single row (lights/title/chip + hearts/Compartir/Más, `py-3` +
    // 36px icons) comfortably fits under 64px; the pre-fix wrap measured
    // over 110px (two stacked rows).
    if (box) expect(box.height).toBeLessThan(64);

    await expect(page.locator('[data-testid="activity-heart-guest"]')).toBeVisible();
    await expect(page.locator('[data-testid="exercise-share"]')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(360);
  });

  test('"Duplicar"/"Reportar"/"Presentar"/"Imprimir" move behind the "Más" menu, reachable once opened', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path!);

    const printLink = page.locator('[data-testid="activity-print-link"]');
    await expect(printLink).toBeHidden();

    const moreTrigger = page.locator('[data-testid="activity-window-more-trigger"]');
    await expect(moreTrigger).toBeVisible();
    await moreTrigger.click();
    await expect(printLink).toBeVisible();
  });

  test('at `desk:` and up, the "Más" trigger is hidden and every action is directly visible again', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path!);

    await expect(page.locator('[data-testid="activity-window-more-trigger"]')).toBeHidden();
    await expect(page.locator('[data-testid="activity-print-link"]')).toBeVisible();
  });
});
