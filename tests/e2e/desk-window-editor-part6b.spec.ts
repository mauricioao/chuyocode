import { test, expect, type Page } from '@playwright/test';

/**
 * The activity EDITOR as a WINDOW over the desk ("desktop" redesign PART
 * 6b, owner spec 2026-10-06) — `/[lang]/crear` (the type picker) and
 * `/[lang]/crear/[id]` (the real editor). Unlike the practice page (PART
 * 6a), there is NO guest variant here: both routes redirect an anonymous
 * visitor to sign-in before anything renders (`[id].astro`/`index.astro`'s
 * own gate), so the window itself is only ever reachable signed in.
 *
 * This repo has no e2e auth fixture yet (same posture as
 * `desk-widgets-part4.spec.ts`/`desk-minimized-tray-part6b.spec.ts`), so the
 * signed-in checks below skip gracefully rather than asserting against the
 * sign-in redirect every anonymous Playwright session actually gets. They
 * become real checks the moment an e2e auth fixture lands, with no change
 * needed here. The anonymous-gate checks need no fixture at all and run for
 * real every time.
 */

async function gotoOrSkipSignedIn(page: Page, path: string): Promise<boolean> {
  await page.goto(path);
  return (await page.locator('[data-desk-window]').count()) > 0;
}

test.describe('activity editor gate (PART 6b), anonymous', () => {
  test('/[lang]/crear redirects to sign-in, never shipping the window', async ({ page }) => {
    const res = await page.goto('/es/crear');
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/es\/auth\/entrar\?next=/);
    await expect(page.locator('[data-desk-window]')).toHaveCount(0);
  });

  test('/[lang]/crear/[id] redirects to sign-in, never shipping the window', async ({ page }) => {
    await page.goto('/es/crear/some-id');
    await expect(page).toHaveURL(/\/es\/auth\/entrar\?next=/);
    await expect(page.locator('[data-desk-window]')).toHaveCount(0);
  });
});

test.describe('activity editor window (PART 6b), signed-in', () => {
  test('the picker opens as a window, closing to the Inglés hub', async ({ page }) => {
    const signedIn = await gotoOrSkipSignedIn(page, '/es/crear');
    test.skip(!signedIn, 'No e2e auth fixture in this repo yet — anonymous visit redirects to sign-in');

    const dialog = page.locator('[data-desk-window]');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(page.getByRole('link', { name: 'Cerrar' })).toBeVisible();
    await page.getByRole('link', { name: 'Cerrar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
  });

  // PART 6c (owner spec 2026-10-07): closing ALWAYS lands on the Inglés hub
  // now — never `history.back()` to a tracked previous screen (the old
  // `closeUsesTrackedPath` behaviour, removed — `@lib/ui/deskWindow.ts`'s
  // own header).
  test('the editor opens as a window with the title bar actions, closing to the Inglés hub', async ({ page }) => {
    // A real id would come from creating an activity first — skips the same
    // way until an auth fixture can actually drive that flow.
    const signedIn = await gotoOrSkipSignedIn(page, '/es/crear/some-id');
    test.skip(!signedIn, 'No e2e auth fixture in this repo yet — anonymous visit redirects to sign-in');

    const dialog = page.locator('[data-desk-window]');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('view-as-presentation-button')).toBeVisible();
    await expect(page.getByTestId('submit-for-review-button')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cerrar' })).toBeVisible();
    await page.getByRole('link', { name: 'Cerrar' }).click();
    await expect(page).toHaveURL(/\/es\/ingles$/);
  });

  test('Escape never closes the editor window (it is the editor\'s own shortcut)', async ({ page }) => {
    const signedIn = await gotoOrSkipSignedIn(page, '/es/crear/some-id');
    test.skip(!signedIn, 'No e2e auth fixture in this repo yet — anonymous visit redirects to sign-in');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-desk-window]')).toBeVisible();
    await expect(page).toHaveURL(/\/es\/crear\/some-id$/);
  });

  // `/mis-actividades` itself stays a plain page (no `DeskScene`/tray) —
  // the chip is written to `sessionStorage` immediately regardless, and
  // becomes VISIBLE the next time the author is on a page that renders the
  // desk (the hub, or another window) — this test checks it from there.
  test('minimizing records a tray chip, visible from the hub, and reopening lands back on the same editor URL', async ({
    page,
  }) => {
    const signedIn = await gotoOrSkipSignedIn(page, '/es/crear/some-id');
    test.skip(!signedIn, 'No e2e auth fixture in this repo yet — anonymous visit redirects to sign-in');

    await page.getByRole('link', { name: 'Minimizar' }).click();
    await expect(page).toHaveURL(/\/es\/mis-actividades$/);

    await page.goto('/es/ingles');
    await expect(page.locator('[data-minimized-tray] [data-desk-window-open]')).toHaveCount(1);

    await page.locator('[data-minimized-tray] [data-desk-window-open]').first().click();
    await expect(page).toHaveURL(/\/es\/crear\/some-id$/);
  });
});
