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

/** SITE only: true once the footer has faded in (opacity driven by `data-footer-visible`). */
async function footerVisible(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Number(getComputedStyle(el).opacity) > 0.5 : false;
  }, FOOTER_SELECTOR);
}

/**
 * INGLÉS only: the footer is a "blocks" panel that COLLAPSES TO ZERO HEIGHT
 * rather than merely fading (owner spec 2026-10-05) — opacity stays 1
 * throughout, so `footerVisible` above does not apply here.
 */
async function footerExpanded(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().height > 1 : false;
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
    // `expect.poll`, not a plain `expect`: focus can land inside the header
    // after just one or two tabs, leaving very little of the 220ms CSS
    // transition elapsed yet — a bare synchronous check can race ahead of it.
    await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);
  });
});

test.describe('SITE mode — a page too short to scroll (/es/no-existe)', () => {
  test('the footer reveals on its own after the ~1s dwell, with no scrolling at all', async ({ page }) => {
    await page.goto('/es/no-existe');
    expect(await footerVisible(page)).toBe(false);
    await expect.poll(() => footerVisible(page), { timeout: 3000 }).toBe(true);
  });
});

/**
 * A real published activity's practice-page path, read from the live
 * sitemap exactly like `hero-carousel.spec.ts` reads CMS-dependent data —
 * so this skips gracefully instead of asserting against a 404 when the
 * dev database has no published activity yet. Module-level: shared by both
 * the desktop and phone INGLÉS describe blocks below.
 */
async function findInglesActivityPath(page: Page): Promise<string | null> {
  const res = await page.request.get('/sitemap.xml');
  if (!res.ok()) return null;
  const xml = await res.text();
  const match = xml.match(/<loc>[^<]*(\/es\/ingles\/actividades\/[^<]+)<\/loc>/);
  return match ? match[1] : null;
}

/**
 * INGLÉS (blocks) mode — guest-play activity page (owner spec 2026-10-05).
 * This page is `fullHeight` (`BaseLayout`'s prop): the old `lg:` "always
 * visible" override is gone now, so the SAME pull/push-to-reveal behavior
 * runs at every width — hence running this full suite at BOTH a desktop and
 * a phone viewport instead of phone-only, unlike last night's version.
 */
function defineInglesChromeTests(viewportLabel: string, viewport: { width: number; height: number }): void {
  test.describe(`INGLÉS (blocks) mode — guest-play activity page, ${viewportLabel}`, () => {
    test.use({ viewport });

    test('starts collapsed, in flow, with no flash', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      // No "always visible at the top" pin in this mode — hidden/collapsed
      // from the very first paint, even though we have not scrolled yet.
      expect(await headerHidden(page)).toBe(true);
      expect(await footerExpanded(page)).toBe(false);
    });

    test('a wheel pull up at the top expands the header', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      expect(await headerHidden(page)).toBe(true);
      // Well past PULL_SHOW_THRESHOLD_PX in one go — a deliberate pull, not a
      // casual settle.
      await page.mouse.wheel(0, -150);
      await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);
    });

    test('a tap on the page content collapses the header again', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      await page.mouse.wheel(0, -150);
      await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);

      // A tap/click on the page content (never the header/footer themselves)
      // hides both — dispatched directly on <main> so this never risks
      // accidentally activating one of the activity's own interactive
      // elements underneath a realistic click position.
      await page.locator('main').dispatchEvent('pointerdown');
      await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(true);
    });

    test('scrolling it fully out of view collapses it (when the page can scroll that far)', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      await page.mouse.wheel(0, -150);
      await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);

      const headerHeight = await page.evaluate(
        (sel) => document.querySelector(sel)?.getBoundingClientRect().height ?? 0,
        HEADER_SELECTOR,
      );
      // A bounded `fullHeight` page at a wide viewport may have nothing to
      // scroll at all (the body itself never scrolls there) — the content
      // click above already proves the collapse mechanism; this is the
      // scroll-specific half, skipped gracefully when there is no room.
      const canScrollPastHeader = await page.evaluate(
        (h) => document.documentElement.scrollHeight > window.innerHeight + h,
        headerHeight,
      );
      test.skip(!canScrollPastHeader, 'Page has no room to scroll the header fully out of view at this viewport');

      await page.mouse.wheel(0, headerHeight + 300);
      await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(true);
    });

    test('a pull down past the bottom expands the footer', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      // Let the (rAF-throttled) scroll measurement land before pushing.
      await page.waitForTimeout(150);
      expect(await footerExpanded(page)).toBe(false);

      await page.mouse.wheel(0, 200);
      await expect.poll(() => footerExpanded(page), { timeout: 2000 }).toBe(true);
    });

    test('a hidden (collapsed) footer never catches a tap', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      expect(await footerExpanded(page)).toBe(false);

      // At zero height the hidden footer's own links sit at its collapsed
      // position; a tap there must reach the page, never an invisible link.
      const hit = await page.evaluate(() => {
        document.querySelector('astro-dev-toolbar')?.remove();
        const link = document.querySelector('[data-chrome-footer] a') as HTMLElement | null;
        if (!link) return 'no-link';
        const box = link.getBoundingClientRect();
        if (box.top >= window.innerHeight || box.height < 1) return 'off-screen';
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return target?.closest('[data-chrome-footer]') ? 'footer' : 'page';
      });
      test.skip(hit === 'off-screen', 'Footer is below the fold on this activity');
      expect(hit).not.toBe('footer');
    });

    test('tabbing into the header expands it', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      expect(await headerHidden(page)).toBe(true);

      // Walk focus forward from the top of the document until it lands
      // somewhere inside the header (the skip-link is the first stop, the
      // logo-block link the next one).
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        const insideHeader = await page.evaluate(
          (sel) => document.activeElement?.closest(sel) != null,
          HEADER_SELECTOR,
        );
        if (insideHeader) break;
      }
      // `expect.poll`, not a plain `expect` — same reasoning as SITE mode's
      // own tab test above: focus reaches the header almost immediately
      // here (it is the second or third stop), well before the 220ms CSS
      // transition would otherwise have had time to elapse.
      await expect.poll(() => headerHidden(page), { timeout: 2000 }).toBe(false);
    });
  });
}

defineInglesChromeTests('desktop', { width: 1440, height: 900 });
defineInglesChromeTests('phone', { width: 390, height: 844 });
