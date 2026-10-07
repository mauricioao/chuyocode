import { test, expect, type Page } from '@playwright/test';

/**
 * Back-navigation bugfix (2026-10-06, owner report: "el botón de volver me
 * manda a la pantalla principal de ChuyoCode en vez de a la pantalla
 * anterior que vi"). Two separate, real bugs were found and fixed in
 * `@lib/backNavigation.ts`:
 *
 *  1. `document.referrer` never updates after a tab's first client-side
 *     navigation (Astro's `<ClientRouter>` swaps pages without a new
 *     document) — fixed by tracking the real previous path in
 *     `sessionStorage` instead (`trackPageVisit`/`readTrackedPreviousPath`).
 *  2. EVEN WITH the referrer fixed, `history.back()` never actually fired in
 *     a real browser: `ClientRouter.astro`'s own click listener is ALSO
 *     bound to `document` (bubble phase, registered earlier on the page)
 *     and bails out whenever `event.defaultPrevented` is already `true` —
 *     but it was always `initBackButtons`'s OWN listener that ran second
 *     and therefore saw a FRESH, unprevented event, by which point Astro's
 *     own forward navigation had already started. Fixed by binding in the
 *     CAPTURE phase, which always runs before any bubble-phase listener on
 *     the same node regardless of registration order.
 *
 * This suite exercises bug #2 (the more severe one — it made `history.
 * back()` complete dead code for every single back button on the site,
 * independent of how correct the decision logic was) against the PUBLIC
 * Libros catalog/detail pages, which need no sign-in at all — unlike the
 * Inglés-area pages this bug was originally reported on, which have no
 * e2e auth fixture in this repo yet (same posture as `desk-widgets-part4.
 * spec.ts`'s own `gotoHubOrSkip`).
 */

/**
 * Closes any dialog a book detail page auto-opens (e.g. a gated-download
 * prompt), if present — it otherwise intercepts the BackButton click
 * underneath it. Retries a few times: some of these open on a short delay,
 * so a single check right after navigating can miss one that opens shortly
 * after.
 */
async function closeAnyDialog(page: Page): Promise<void> {
  // Under a loaded full e2e run the dialog can open well after a fixed
  // ~750 ms window, so first let the page settle, then require the overlay
  // to stay absent for several consecutive checks (bounded at ~6 s).
  await page.waitForLoadState('networkidle');
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  let clearChecks = 0;
  for (let attempt = 0; attempt < 30 && clearChecks < 4; attempt++) {
    if (await overlay.count()) {
      clearChecks = 0;
      await page.keyboard.press('Escape');
    } else {
      clearChecks += 1;
    }
    await page.waitForTimeout(200);
  }
  await expect(overlay).toHaveCount(0);
}

test.describe('BackButton uses real history.back() after a client-side navigation (bugfix 2026-10-06)', () => {
  test('a client-side navigation into a book, then BackButton, lands back on the catalog via a REAL history.back() (never a forward push)', async ({
    page,
  }) => {
    await page.goto('/es/libros');
    const bookLink = page.locator('a[href^="/es/libros/"]').first();
    test.skip((await bookLink.count()) === 0, 'Need at least one book in the catalog');

    const href = await bookLink.getAttribute('href');
    await bookLink.click();
    await page.waitForURL(`**${href}`);
    await closeAnyDialog(page);

    const historyLengthBeforeBack = await page.evaluate(() => history.length);

    await page.click('a[data-back-button]');
    await expect(page).toHaveURL(/\/es\/libros$/);

    // `history.back()` never grows `history.length` — a forward `href`
    // navigation (the pre-fix, buggy behaviour, caused by Astro's own
    // `<ClientRouter>` click listener winning the race — see this file's
    // own header) always would.
    const historyLengthAfterBack = await page.evaluate(() => history.length);
    expect(historyLengthAfterBack).toBe(historyLengthBeforeBack);
  });

  test('a direct visit (no tracked previous path, no referrer) still falls back to the plain href, never throwing', async ({
    page,
  }) => {
    await page.goto('/es/libros');
    const bookLink = page.locator('a[href^="/es/libros/"]').first();
    test.skip((await bookLink.count()) === 0, 'Need at least one book in the catalog');
    const href = await bookLink.getAttribute('href');

    // Direct visit straight to the book detail page — a fresh tab/session,
    // nothing tracked yet and no referrer.
    await page.goto(href!);
    await closeAnyDialog(page);

    await page.click('a[data-back-button]');
    await expect(page).toHaveURL(/\/es\/libros$/);
  });
});
