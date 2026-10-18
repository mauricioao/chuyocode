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
    // PART 6c (owner spec 2026-10-07): non-modal floating window — no `aria-modal`.
    await expect(dialog).not.toHaveAttribute('aria-modal');
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

      // Whichever "Comprobar" this activity shows: Básico/worksheets use the
      // practice footer's, while each template game checks with its own
      // (one Comprobar per activity), and the first published activity may
      // be either.
      const checkButton = page
        .locator(
          [
            '[data-testid="practice-check-button"]',
            '[data-testid="matching-check"]',
            '[data-testid="reorder-check"]',
            '[data-testid="cloze-check"]',
            '[data-testid="groupsort-check"]',
          ].join(', '),
        )
        .first();
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

  // PART 6c (owner spec 2026-10-07): the window is non-modal now — there is
  // no focus trap anymore (`@lib/ui/deskWindow.ts`'s own header). Tab still
  // reaches the red light first, same as before; it is just free to leave
  // the dialog afterwards instead of being trapped inside it.
  test('Tab reaches the red light first; Escape still closes', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);
    await expect(page.locator('[data-desk-window]')).toBeFocused();

    // Forward: container -> first focusable (the red light).
    await page.keyboard.press('Tab');
    const onFirst = await page.evaluate(() => document.activeElement?.hasAttribute('data-desk-window-close') ?? false);
    expect(onFirst).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/es\/$/);
  });
});

test.describe('phone layout (PART 6a bugfix, < the `desk:` breakpoint)', () => {
  // ACTIVITY WINDOW CHROME PASS (owner mockup
  // `visor-actividad-franjas-2026-10-17.jpg`, 2026-10-17): the old rule —
  // the canvas reaches the FOOTER's own top edge, which reserved its own
  // row height below the canvas — is gone. The footer is now a borderless
  // `absolute` overlay (`ActivityPracticeIsland.tsx`'s own header) that
  // floats OVER the canvas instead of pushing it up, so the canvas now
  // reaches the WINDOW's own bottom edge, and the floating controls simply
  // sit on top of it.
  test('the worksheet canvas fills the space down to the window\'s own bottom edge (the floating footer overlays it, reserves no row)', async ({
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
    const dialogBox = await page.locator('[data-desk-window]').boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();
    if (!canvasBox || !dialogBox) return;

    // The canvas must reach all the way down to (within a few px of) the
    // WINDOW's own bottom edge — on a phone the window is the full-screen
    // sheet itself (inset 0), so this is effectively the viewport's bottom.
    const gap = dialogBox.y + dialogBox.height - (canvasBox.y + canvasBox.height);
    expect(gap).toBeLessThan(8);
  });

  test('the floating footer overlays the canvas instead of sitting below it (no reserved row)', async ({ page }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path!);

    const viewport = page.locator('[data-testid="practice-mobile-viewport"]');
    const footer = page.locator('[data-testid="practice-footer"]');
    test.skip((await viewport.count()) === 0 || (await footer.count()) === 0, 'Nothing to measure here');

    const canvasBox = await viewport.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    if (!canvasBox || !footerBox) return;

    // The footer's own top edge must land INSIDE the canvas's vertical
    // range (it overlays it), not below the canvas's bottom edge (which is
    // what an in-flow, space-reserving row would do).
    expect(footerBox.y).toBeLessThan(canvasBox.y + canvasBox.height);
  });

  // N6 (fewer equal-weight buttons while playing, 2026-10-06) + N6 FOLLOW-UP
  // (owner report 2026-10-12: the title collapsed to "V…" at 390px — five
  // standalone icons left no room for it). Final contract, by the STANDARD
  // `sm` breakpoint (640px — not the custom `desk:` one everything else on
  // this page uses):
  //   - below `sm` (this 360px viewport): only ❤ and "Modo enfoque" stay
  //     directly visible; Compartir/Presentar rejoin "Más" alongside
  //     Imprimir/Duplicar/Reportar (phone order: Compartir, Presentar,
  //     Imprimir, Duplicar, Reportar).
  //   - `sm` and up: Compartir/Presentar/"Modo enfoque" stay directly
  //     visible; "Más" holds only Imprimir/Duplicar/Reportar.
  test('below `sm`: only ❤ and "Modo enfoque" stay directly visible, and the page never scrolls horizontally', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path!);

    await expect(page.locator('[data-testid="activity-heart-guest"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-focus-mode-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-window-more-trigger"]')).toBeVisible();
    // The `sm:`-and-up standalone triggers are present in the DOM (a
    // SEPARATE node from their "Más" copies) but hidden at this width.
    await expect(page.locator('[data-testid="exercise-share"]')).toBeHidden();
    await expect(page.locator('[data-testid="activity-present-link"]')).toBeHidden();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(360);
  });

  test('below `sm`: "Más" holds Compartir, Presentar, Imprimir, Duplicar, Reportar — each with a visible label', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path!);

    const shareMenuItem = page.locator('[data-testid="exercise-share-menu"]');
    const presentMenuItem = page.locator('[data-testid="activity-present-link-menu"]');
    const printLink = page.locator('[data-testid="activity-print-link"]');

    await expect(shareMenuItem).toBeHidden();
    await expect(presentMenuItem).toBeHidden();
    await expect(printLink).toBeHidden();

    const moreTrigger = page.locator('[data-testid="activity-window-more-trigger"]');
    await expect(moreTrigger).toBeVisible();
    await moreTrigger.click();

    await expect(shareMenuItem).toBeVisible();
    await expect(shareMenuItem).toHaveText('Compartir');
    await expect(presentMenuItem).toBeVisible();
    await expect(presentMenuItem).toHaveText('Presentar');
    await expect(printLink).toBeVisible();
    await expect(printLink).toHaveText('Imprimir');

    // Phone order: Compartir, Presentar, Imprimir, …
    const order = await page.locator('[data-desk-window-more-content] [data-testid]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    expect(order.indexOf('exercise-share-menu')).toBeLessThan(order.indexOf('activity-present-link-menu'));
    expect(order.indexOf('activity-present-link-menu')).toBeLessThan(order.indexOf('activity-print-link'));
  });

  test('`sm` and up: Compartir/Presentar/"Modo enfoque" stay directly visible, "Más" holds only Imprimir/Duplicar/Reportar', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path!);

    await expect(page.locator('[data-testid="activity-window-more-trigger"]')).toBeVisible();
    await expect(page.locator('[data-testid="exercise-share"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-present-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-focus-mode-toggle"]')).toBeVisible();
    // The phone-only "Más" copies exist in the DOM but are hidden here.
    await expect(page.locator('[data-testid="exercise-share-menu"]')).toBeHidden();
    await expect(page.locator('[data-testid="activity-present-link-menu"]')).toBeHidden();

    const printLink = page.locator('[data-testid="activity-print-link"]');
    await expect(printLink).toBeHidden();
    await page.locator('[data-testid="activity-window-more-trigger"]').click();
    await expect(printLink).toBeVisible();
    await expect(printLink).toHaveText('Imprimir');
  });
});
