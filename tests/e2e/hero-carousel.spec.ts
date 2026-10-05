import { test, expect, type Page } from '@playwright/test';

/**
 * HeroCarousel end-to-end behavior (spec: hero-carousel; design decisions
 * #1/#10). `HeroCarouselIsland` (React + Embla) exposes its active slide via
 * `aria-current="true"` (see that component) specifically so these flows can
 * observe REAL state — not poke at Embla's internal, unqueryable index — for
 * behavior unit tests cannot exercise under jsdom: real `setInterval`
 * advance, pause on hover and reduced-motion disabling autoplay (Embla's
 * scroll physics need real layout jsdom does not provide — see
 * HeroCarouselIsland.test.tsx's own header).
 *
 * The hero's slide count depends on CMS content (Sanity `getHeroItems`), so
 * every test here skips gracefully with fewer than 2 slides: 0 means the
 * `.astro` wrapper never mounts the carousel at all (placeholder only), 1
 * means the island renders statically (no autoplay) —
 * neither case has anything to advance between.
 */

const HOME = '/es/';
const SKIP_REASON = 'Need 2+ hero slides from the CMS for carousel navigation';

/** The active slide's `data-index`, or -1 if none is currently marked. */
async function activeIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const active = document.querySelector(
      '[data-hero-slide][aria-current="true"]',
    ) as HTMLElement | null;
    return active ? Number(active.getAttribute('data-index')) : -1;
  });
}

async function slideCount(page: Page): Promise<number> {
  return page.locator('[data-hero-slide]').count();
}

/**
 * Wait until the hero island has actually hydrated — not just SSR-rendered.
 * The SSR markup already carries `aria-current="true"` on slide 0 (React
 * renders that initial state server-side too), so polling for index===0
 * alone cannot tell "server HTML is in the DOM" apart from "the client JS
 * is running and embla-carousel-autoplay's timer is armed". Astro's own
 * `<astro-island>` wrapper removes its `ssr` attribute the instant hydration
 * completes (see astro/runtime/client's astro-island.js), which is the one
 * reliable signal: waiting for it avoids a real race where `.hover()` lands
 * on still-static markup moments before the real mouseenter listener (and
 * the autoplay timer) actually attach, letting one autoplay tick slip through
 * even though the test already believes it is hovering.
 *
 * Reloads and retries a few times on a bare timeout: a dev server's very
 * first dependency optimization pass can occasionally drop a module fetch
 * (surfaces client-side as `astro-island` hydration errors), which a fresh
 * navigation resolves once the dep cache has settled. This keeps the suite
 * reliable without ever treating a genuinely never-hydrating page as green.
 */
async function waitForHeroHydration(page: Page): Promise<void> {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await page.waitForFunction(
        () => {
          const carousel = document.querySelector('[data-hero-carousel]');
          if (!carousel) return true; // 0 CMS items — no island mounted at all.
          const island = carousel.closest('astro-island');
          return !island || !island.hasAttribute('ssr');
        },
        { timeout: 8000 },
      );
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await page.reload();
    }
  }
}

/**
 * The REAL configured autoplay delay, read off the DOM — `data-interval` is
 * set from the same `interval` prop that configures embla-carousel-autoplay,
 * so this is never a guessed/hardcoded fallback.
 */
async function readInterval(page: Page): Promise<number> {
  const raw = await page
    .locator('[data-hero-carousel]')
    .getAttribute('data-interval');
  const interval = Number(raw);
  expect(interval, `data-interval should be a positive number, got "${raw}"`)
    .toBeGreaterThan(0);
  return interval;
}

test.describe('HeroCarousel autoplay', () => {
  test('starts on the first slide', async ({ page }) => {
    await page.goto(HOME);
    await waitForHeroHydration(page);
    test.skip((await slideCount(page)) < 2, SKIP_REASON);

    await expect.poll(() => activeIndex(page), { timeout: 2000 }).toBe(0);
  });

  test('auto-advances to the next slide after the interval', async ({
    page,
  }) => {
    await page.goto(HOME);
    await waitForHeroHydration(page);
    test.skip((await slideCount(page)) < 2, SKIP_REASON);

    const interval = await readInterval(page);
    await expect.poll(() => activeIndex(page), { timeout: 2000 }).toBe(0);

    // Wait a little past one interval and assert the active slide advanced.
    await expect
      .poll(() => activeIndex(page), { timeout: interval + 2000 })
      .toBeGreaterThan(0);
  });

  test('pauses autoplay while the pointer hovers the carousel', async ({
    page,
  }) => {
    await page.goto(HOME);
    await waitForHeroHydration(page);
    test.skip((await slideCount(page)) < 2, SKIP_REASON);

    const interval = await readInterval(page);
    const carousel = page.locator('[data-hero-carousel]');

    await expect.poll(() => activeIndex(page), { timeout: 2000 }).toBe(0);
    await carousel.hover();
    const before = await activeIndex(page);
    expect(before).toBeGreaterThanOrEqual(0);

    // Across more than one full interval the slide must NOT change while
    // hovered — compared against the real starting value above, not -1.
    await page.waitForTimeout(interval + 1500);
    expect(await activeIndex(page)).toBe(before);
  });
});

test.describe('HeroCarousel reduced motion', () => {
  test('does not auto-advance when prefers-reduced-motion is set', async ({
    page,
  }) => {
    // Emulated BEFORE navigating: HeroCarouselIsland reads matchMedia once,
    // synchronously, on mount (no change listener), so the preference must
    // already be in place before `page.goto` triggers hydration.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(HOME);
    await waitForHeroHydration(page);
    test.skip((await slideCount(page)) < 2, SKIP_REASON);

    const interval = await readInterval(page);
    await expect.poll(() => activeIndex(page), { timeout: 2000 }).toBe(0);
    const before = await activeIndex(page);

    // Autoplay is disabled entirely under reduced motion — no timer starts.
    await page.waitForTimeout(interval + 1500);
    expect(await activeIndex(page)).toBe(before);
  });
});
