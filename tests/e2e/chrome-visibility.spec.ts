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
 * INGLÉS only: whether the footer currently has real height. Used to be a
 * "blocks" panel that COLLAPSED TO ZERO HEIGHT (owner spec 2026-10-05); the
 * "desktop" redesign PART 1 scope extension (owner spec 2026-10-06, item C,
 * "clean footer scroll") REMOVED that collapse entirely — the Inglés footer
 * is always expanded now, in both sub-modes, so every call site below
 * should see `true` immediately, with no reveal gesture needed.
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

    test('starts with the header collapsed but the footer already expanded, with no flash', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      // No "always visible at the top" pin for the header in this mode —
      // hidden/collapsed from the very first paint, even though we have not
      // scrolled yet. The footer, however, is never collapsed at all
      // anymore (item C, "clean footer scroll") — expanded immediately.
      expect(await headerHidden(page)).toBe(true);
      expect(await footerExpanded(page)).toBe(true);
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

    test('the footer stays expanded regardless of scroll position or a push past the bottom ("clean footer scroll", item C)', async ({
      page,
    }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      expect(await footerExpanded(page)).toBe(true);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      expect(await footerExpanded(page)).toBe(true);

      await page.mouse.wheel(0, 200); // a further downward attempt past the bottom — no-op now
      expect(await footerExpanded(page)).toBe(true);
    });

    // "Desktop" redesign PART 6a bugfix (owner report, 2026-10-06, superseding
    // this test's old "the footer catches a real tap" premise): this page
    // opens as a window (`DeskWindow.astro`) that reliably paints ABOVE every
    // other page element, including the footer (`BaseLayout.astro`'s own
    // `overlay` slot fix). A tap at the footer's own on-screen position must
    // therefore resolve to the window covering it, never to the footer
    // itself — the OPPOSITE of what this test used to assert, back when the
    // footer wrongly painted over the window (the very bug this fix closes:
    // a student could not reach "Comprobar" because the footer sat on top of
    // it).
    //
    // PART 6c (owner spec 2026-10-07): the window is non-modal now — the
    // footer is no longer `inert` while it is open (`BaseLayout.astro`'s own
    // header), same as the header staying usable. It is still visually
    // covered (the pointer-hit assertion above/below), just no longer
    // keyboard-unreachable by construction.
    test('the footer never catches a tap while the window is open — the window covers it, "expanded" or not', async ({
      page,
    }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);

      const hit = await page.evaluate(() => {
        document.querySelector('astro-dev-toolbar')?.remove();
        const link = document.querySelector('[data-chrome-footer] a') as HTMLElement | null;
        if (!link) return 'no-link';
        const box = link.getBoundingClientRect();
        if (box.top >= window.innerHeight || box.height < 1) return 'off-screen';
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return target?.closest('[data-chrome-footer]') ? 'footer' : 'window';
      });
      test.skip(hit === 'off-screen', 'Footer is below the fold on this activity');
      expect(hit).toBe('window');

      // PART 6c: no longer inert — the desk/header/footer all stay usable
      // while a non-modal window is open.
      const footerInert = await page.evaluate(() => {
        const footer = document.querySelector('[data-chrome-footer]');
        return footer ? footer.closest('[inert]') != null : false;
      });
      expect(footerInert).toBe(false);
    });

    // "Desktop" redesign PART 6a (owner spec 2026-10-06, superseding this
    // test's old "tabbing into the header expands it" premise): this page
    // opens as a window over the desk (`DeskWindow.astro`), and
    // `@lib/ui/deskWindow.ts#initDeskWindow` moves focus into it on open —
    // still true now that the window is non-modal (PART 6c): initial focus
    // landing on the window itself is a deliberate UX choice (no focus-ring
    // flash on a pointer visit — `DeskWindow.astro`'s own header), not
    // something modality decided. Tabbing from the top of the document no
    // longer reaches the header AT ALL on this page (it starts already
    // inside the window), so the header-reveal-via-tab affordance that still
    // applies to every other Inglés page simply does not apply here anymore.
    test('focus moves into the window on open, not the header', async ({ page }) => {
      const path = await findInglesActivityPath(page);
      test.skip(path === null, 'Need at least one published activity for a real guest-play id');

      await page.goto(path!);
      const insideWindow = await page.evaluate(
        () => document.activeElement?.closest('[data-desk-window]') != null,
      );
      expect(insideWindow).toBe(true);
    });
  });
}

defineInglesChromeTests('desktop', { width: 1440, height: 900 });
defineInglesChromeTests('phone', { width: 390, height: 844 });

/**
 * The hub (like every other Inglés page except the two guest-play activity
 * routes, `@lib/access.ts#requiresLogin`) is sign-in gated — this repo has
 * no e2e auth fixture yet, so an anonymous Playwright session gets
 * redirected to `/auth/entrar`. Each test below skips gracefully in that
 * case (same posture as `findInglesActivityPath`'s own skip above) rather
 * than asserting against a sign-in page; they become real checks the moment
 * an e2e auth fixture lands, with no change needed here.
 */
async function gotoHubOrSkip(page: Page): Promise<boolean> {
  await page.goto('/es/ingles');
  return !page.url().includes('/auth/entrar');
}

/**
 * INGLÉS HUB (`/es/ingles`) — "desktop" redesign PART 1 scope extension
 * (owner spec 2026-10-06, item C): the ONE Inglés page whose header stays
 * always visible (it holds the logo + avatar in the new design) and whose
 * footer gets scroll-snap, since the hub's own content is one screen tall.
 */
test.describe('INGLÉS HUB mode — /es/ingles (desktop redesign PART 1, item C)', () => {
  test('the header is visible immediately — no pull gesture needed, unlike every other Inglés page', async ({
    page,
  }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
    expect(await headerHidden(page)).toBe(false);
  });

  test('the footer is expanded immediately too', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
    expect(await footerExpanded(page)).toBe(true);
  });

  test('the header stays visible after scrolling all the way down to the footer', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    // Still "visible" in the chrome-visibility sense (expanded, never
    // collapsed) — it may now be scrolled physically out of the viewport,
    // same as any other in-flow block, which is expected and fine.
    const stillExpanded = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().height > 1 : false;
    }, HEADER_SELECTOR);
    expect(stillExpanded).toBe(true);
  });

  test('carries the server-rendered data-chrome-hub attribute and a non-"none" scroll-snap-type', async ({ page }) => {
    const signedIn = await gotoHubOrSkip(page);
    test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
    const hub = await page.evaluate(() => document.documentElement.hasAttribute('data-chrome-hub'));
    expect(hub).toBe(true);
    const snapType = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
    expect(snapType).not.toBe('none');
  });

  test('a non-hub Inglés page does NOT carry data-chrome-hub', async ({ page }) => {
    await page.goto('/es/ingles/propuestos');
    if (page.url().includes('/auth/entrar')) {
      test.skip(true, 'Inglés subroutes are sign-in gated; no e2e auth fixture in this repo yet');
    }
    const hub = await page.evaluate(() => document.documentElement.hasAttribute('data-chrome-hub'));
    expect(hub).toBe(false);
  });
});
