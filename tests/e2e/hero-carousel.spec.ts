import { test, expect, type Page } from '@playwright/test';

/**
 * HeroCarousel end-to-end behavior (spec: hero-carousel; design decisions
 * #1/#10). These flows exercise the vanilla `is:inline` autoplay script that
 * unit (AstroContainer) tests cannot: real `setInterval` advance, pause on
 * hover, reduced-motion disabling autoplay, and dot-click jump.
 *
 * The carousel is wired into the home page in PR4. Until then this route does
 * not yet render it, so these tests are guarded: each SKIPS gracefully when no
 * `[data-hero-carousel]` is present, and becomes live automatically once PR4
 * mounts the HeroCarousel with 2+ featured items. This keeps the spec
 * syntactically valid and runnable without blocking on the PR4 wiring.
 */

const HOME = '/es/';

// The active slide carries `.is-active`; read its index for assertions.
async function activeIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const active = document.querySelector(
      '[data-hero-slide].is-active',
    ) as HTMLElement | null;
    return active ? Number(active.getAttribute('data-index')) : -1;
  });
}

async function hasCarousel(page: Page): Promise<boolean> {
  return (await page.locator('[data-hero-carousel]').count()) > 0;
}

test.describe('HeroCarousel autoplay', () => {
  test('auto-advances to the next slide after the interval', async ({
    page,
  }) => {
    await page.goto(HOME);
    test.skip(!(await hasCarousel(page)), 'HeroCarousel not mounted yet (PR4)');

    const carousel = page.locator('[data-hero-carousel]');
    const interval = Number(await carousel.getAttribute('data-interval')) || 6000;

    await expect
      .poll(() => activeIndex(page), { timeout: 200 })
      .toBe(0);

    // Wait a little past one interval and assert the active slide advanced.
    await expect
      .poll(() => activeIndex(page), { timeout: interval + 2000 })
      .toBeGreaterThan(0);
  });

  test('pauses autoplay while the pointer hovers the carousel', async ({
    page,
  }) => {
    await page.goto(HOME);
    test.skip(!(await hasCarousel(page)), 'HeroCarousel not mounted yet (PR4)');

    const carousel = page.locator('[data-hero-carousel]');
    const interval = Number(await carousel.getAttribute('data-interval')) || 6000;

    await carousel.hover();
    const before = await activeIndex(page);

    // Across more than one full interval the slide must NOT change while hovered.
    await page.waitForTimeout(interval + 1500);
    expect(await activeIndex(page)).toBe(before);
  });
});

test.describe('HeroCarousel reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('does not auto-advance when prefers-reduced-motion is set', async ({
    page,
  }) => {
    await page.goto(HOME);
    test.skip(!(await hasCarousel(page)), 'HeroCarousel not mounted yet (PR4)');

    const carousel = page.locator('[data-hero-carousel]');
    const interval = Number(await carousel.getAttribute('data-interval')) || 6000;

    const before = await activeIndex(page);
    // Autoplay is disabled entirely under reduced motion — no timer starts.
    await page.waitForTimeout(interval + 1500);
    expect(await activeIndex(page)).toBe(before);
  });
});

test.describe('HeroCarousel indicators', () => {
  test('clicking an indicator dot jumps directly to that slide', async ({
    page,
  }) => {
    await page.goto(HOME);
    test.skip(!(await hasCarousel(page)), 'HeroCarousel not mounted yet (PR4)');

    const dots = page.locator('[data-hero-dot]');
    const dotCount = await dots.count();
    test.skip(dotCount < 2, 'Need 2+ slides for indicator navigation');

    // Jump to the last dot; the matching slide becomes active immediately.
    const target = dotCount - 1;
    await dots.nth(target).click();

    await expect
      .poll(() => activeIndex(page), { timeout: 1000 })
      .toBe(target);
  });
});
