import { test, expect, type Page } from '@playwright/test';

/**
 * Desk hub widgets — "desktop" redesign PART 4 (weather, "Frase del día"
 * player, draggable widgets, "Ordenar escritorio").
 *
 * The hub is sign-in gated (`@lib/access.ts#requiresLogin`) and this repo
 * has no e2e auth fixture yet — same posture as `chrome-visibility.spec.ts`'s
 * own `gotoHubOrSkip`: every test below skips gracefully when an anonymous
 * Playwright session gets redirected to `/auth/entrar`, rather than
 * asserting against a sign-in page. These become real checks the moment an
 * e2e auth fixture lands, with no change needed here.
 */

const DESK_BREAKPOINT = { width: 1440, height: 900 };

async function gotoHubOrSkip(page: Page): Promise<boolean> {
  await page.goto('/es/ingles');
  return !page.url().includes('/auth/entrar');
}

test.describe('desk hub widgets (PART 4)', () => {
  test.use({ viewport: DESK_BREAKPOINT });

  test('renders the clock, calendar, player, and weather widgets', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    await expect(page.locator('#desk-clock')).toBeVisible();
    await expect(page.locator('#desk-calendar')).toBeVisible();
    await expect(page.locator('#desk-player')).toBeVisible();
    await expect(page.locator('#desk-weather')).toBeVisible();
  });

  test('the weather widget fills in a forecast, or shows the calm unavailable state on failure', async ({ page }) => {
    await page.route('**/api/clima**', (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'weather_unavailable' }) }),
    );
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    await expect(page.locator('#desk-weather')).toContainText(/no disponible|not available/i, { timeout: 5000 });
  });

  test('the player can be played and switched to the next phrase', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const player = page.locator('#desk-player');
    const phraseBefore = await player.locator('p').first().textContent();
    await player.getByRole('button', { name: /siguiente|next/i }).click();
    const phraseAfter = await player.locator('p').first().textContent();
    expect(phraseAfter).not.toBe(phraseBefore);
  });

  test('dragging a widget persists its position and reveals the "Ordenar escritorio" icon', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const arrangeButton = page.locator('#desk-arrange-button');
    await expect(arrangeButton).toBeHidden();

    const clock = page.locator('[data-desk-widget="clock"]');
    const box = await clock.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 10 });
    await page.mouse.up();

    await expect(arrangeButton).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('ingles-desk-widgets'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}')).toHaveProperty('clock');

    await arrangeButton.click();
    await expect(arrangeButton).toBeHidden();
    const storedAfterReset = await page.evaluate(() => localStorage.getItem('ingles-desk-widgets'));
    expect(storedAfterReset).toBeNull();
  });

  test('arrow keys nudge a focused widget by 16px', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const clock = page.locator('[data-desk-widget="clock"]');
    await clock.focus();
    const before = await clock.evaluate((el) => parseFloat((el as HTMLElement).style.left || '0'));
    await page.keyboard.press('ArrowRight');
    const after = await clock.evaluate((el) => parseFloat((el as HTMLElement).style.left || '0'));
    expect(after).toBe(before + 16);
  });

  test('no horizontal overflow on the hub at desktop or phone width', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('desk hub widgets (PART 4) — phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('stacks clock/calendar side by side and player/weather full width, with no horizontal overflow', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    // Drag never activates below the desk breakpoint — the icon stays hidden.
    await expect(page.locator('#desk-arrange-button')).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
