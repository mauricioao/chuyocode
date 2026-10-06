import { test, expect, type Page } from '@playwright/test';

/**
 * Desk hub floating "helper" character — "desktop" redesign PART 5 (the
 * grammar-tip speech bubble, bottom-left of the hub).
 *
 * Same posture as `desk-widgets-part4.spec.ts`'s own `gotoHubOrSkip`: the
 * hub is sign-in gated and this repo has no e2e auth fixture yet, so every
 * test below skips gracefully when an anonymous Playwright session gets
 * redirected to `/auth/entrar` rather than asserting against a sign-in page.
 */

async function gotoHubOrSkip(page: Page): Promise<boolean> {
  await page.goto('/es/ingles');
  return !page.url().includes('/auth/entrar');
}

test.describe('desk helper (PART 5) — desktop, wide (open by default)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('renders open, with the character, a tip and the action buttons', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const avatar = page.locator('#desk-helper-avatar');
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#desk-helper-bubble')).toBeVisible();
    await expect(page.getByRole('button', { name: /otro tip|another tip/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cerrar ayuda|close help/i })).toBeVisible();
  });

  test('"Otro tip" changes the tip text and which character speaks it', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const bubble = page.locator('#desk-helper-bubble');
    const nameBefore = await bubble.locator('[data-desk-helper-name]').textContent();
    const tipBefore = await bubble.locator('[data-desk-helper-tip]').textContent();

    await page.getByRole('button', { name: /otro tip|another tip/i }).click();

    const nameAfter = await bubble.locator('[data-desk-helper-name]').textContent();
    const tipAfter = await bubble.locator('[data-desk-helper-tip]').textContent();
    expect(`${nameAfter}:${tipAfter}`).not.toBe(`${nameBefore}:${tipBefore}`);
  });

  test('closing folds it down to just the character, which reopens it on click', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    await page.getByRole('button', { name: /cerrar ayuda|close help/i }).click();
    const avatar = page.locator('#desk-helper-avatar');
    await expect(avatar).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#desk-helper-bubble')).toBeHidden();

    await avatar.click();
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#desk-helper-bubble')).toBeVisible();
  });

  test('lifts clear of the footer once it scrolls into view', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const helper = page.locator('#desk-helper');
    const liftBefore = await helper.evaluate((el) => getComputedStyle(el).bottom);

    await page.locator('[data-chrome-footer]').scrollIntoViewIfNeeded();
    await expect
      .poll(() => helper.evaluate((el) => getComputedStyle(el).bottom))
      .not.toBe(liftBefore);

    const footerBox = await page.locator('[data-chrome-footer]').boundingBox();
    const helperBox = await helper.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(helperBox).not.toBeNull();
    if (footerBox && helperBox) {
      // No overlap: the helper's bottom edge sits at/above the footer's top edge.
      expect(helperBox.y + helperBox.height).toBeLessThanOrEqual(footerBox.y + 1);
    }
  });
});

test.describe('desk helper (PART 5) — desktop collision range (1100-1440px)', () => {
  for (const width of [1100, 1280, 1366]) {
    test(`starts folded at ${width}px wide, never overlapping the levels dock`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const signedIn = await gotoHubOrSkip(page);
      test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

      await expect(page.locator('#desk-helper-avatar')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#desk-helper-bubble')).toBeHidden();
    });
  }
});

test.describe('desk helper (PART 5) — phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('starts folded as a small circular avatar, opening the bubble on tap', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    const avatar = page.locator('#desk-helper-avatar');
    await expect(avatar).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#desk-helper-bubble')).toBeHidden();

    await avatar.click();
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#desk-helper-bubble')).toBeVisible();
  });

  test('no horizontal overflow with the helper open', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

    await page.locator('#desk-helper-avatar').click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
