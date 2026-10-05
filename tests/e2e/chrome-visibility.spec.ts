import { test, expect, type Page } from '@playwright/test';

/**
 * "Smart" header/footer visibility — end-to-end behavior (chrome-visibility
 * feature). Every RULE (direction thresholds, the bottom dwell, the
 * INGLÉS-only rules, …) is already unit-tested against the pure reducer in
 * `src/lib/chromeVisibility.test.ts`; this suite only confirms the real
 * browser WIRING — that actual scroll/wheel/touch/focus/click events reach
 * it and that the CSS it drives really moves pixels (not jsdom, which has
 * no layout at all — see `pagesOverflow.test.ts`'s own header for the same
 * limitation elsewhere in this codebase).
 */

const HEADER_SELECTOR = '[data-chrome-header]';
const FOOTER_SELECTOR = '[data-chrome-footer]';

/** True once the header has fully slid/overlaid itself above the viewport. */
async function headerHidden(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    return el.getBoundingClientRect().bottom <= 1;
  }, HEADER_SELECTOR);
}

/** True once the footer has faded in (opacity driven by `data-footer-visible`). */
async function footerVisible(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Number(getComputedStyle(el).opacity) > 0.5 : false;
  }, FOOTER_SELECTOR);
}

test.describe('SITE mode — home page (/es/)', () => {
  test('is visible at the top, hides on scroll down, and a small scroll up reveals it again', async ({ page }) => {
    await page.goto('/es/');
    expect(await headerHidden(page)).toBe(false);

    await page.mouse.wheel(0, 1200);
    await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(true);

    await page.mouse.wheel(0, -40);
    await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);
  });

  test('the footer reveals once at the bottom and pushed a little further, without waiting out the full dwell', async ({
    page,
  }) => {
    await page.goto('/es/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // Let the (rAF-throttled) scroll measurement land before pushing —
    // otherwise the push could race ahead of "at the bottom" being registered.
    await page.waitForTimeout(150);
    expect(await footerVisible(page)).toBe(false);

    await page.mouse.wheel(0, 200); // a further downward attempt past the bottom
    await expect.poll(() => footerVisible(page), { timeout: 500 }).toBe(true);
  });

  test('tabbing into the header reveals it even while scrolled down', async ({ page }) => {
    await page.goto('/es/');
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(true);

    // Walk focus forward from the top of the document until it lands
    // somewhere inside the header (the skip-link is the first stop, the
    // masthead logo link the next one).
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const insideHeader = await page.evaluate(
        (sel) => document.activeElement?.closest(sel) != null,
        HEADER_SELECTOR,
      );
      if (insideHeader) break;
    }
    expect(await headerHidden(page)).toBe(false);
  });
});

test.describe('SITE mode — a page too short to scroll (/es/no-existe)', () => {
  test('the footer reveals on its own after the ~1s dwell, with no scrolling at all', async ({ page }) => {
    await page.goto('/es/no-existe');
    expect(await footerVisible(page)).toBe(false);
    await expect.poll(() => footerVisible(page), { timeout: 3000 }).toBe(true);
  });
});

test.describe('INGLÉS (immersive) mode — guest-play activity page, phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * A real published activity's practice-page path, read from the live
   * sitemap exactly like `hero-carousel.spec.ts` reads CMS-dependent data —
   * so this skips gracefully instead of asserting against a 404 when the
   * dev database has no published activity yet.
   */
  async function findInglesActivityPath(page: Page): Promise<string | null> {
    const res = await page.request.get('/sitemap.xml');
    if (!res.ok()) return null;
    const xml = await res.text();
    const match = xml.match(/<loc>[^<]*(\/es\/ingles\/actividades\/[^<]+)<\/loc>/);
    return match ? match[1] : null;
  }

  test('starts hidden with no flash, a scroll up shows it, and tapping the content hides it again', async ({
    page,
  }) => {
    const path = await findInglesActivityPath(page);
    test.skip(path === null, 'Need at least one published activity for a real guest-play id');

    await page.goto(path!);
    // No "always visible at the top" pin in this mode — hidden from the
    // very first paint, even though we have not scrolled at all yet.
    expect(await headerHidden(page)).toBe(true);

    await page.mouse.wheel(0, 300); // make room to scroll down first...
    await page.mouse.wheel(0, -40); // ...then a small scroll up shows it.
    await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);

    // A tap/click on the page content (never the header/footer themselves)
    // hides both — dispatched directly on <main> so this never risks
    // accidentally activating one of the activity's own interactive
    // elements underneath a realistic click position.
    await page.locator('main').dispatchEvent('pointerdown');
    await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(true);
  });
});
