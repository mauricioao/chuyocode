import { test, expect, type Page } from '@playwright/test';

/**
 * Visual regression for the same public, unauthenticated pages covered by
 * `tests/e2e/a11y.spec.ts`: home, the Inglés activities catalog (guest
 * browse), and the news list.
 *
 * Runs only via `pnpm test:visual` (the `visual` Playwright project,
 * excluded from the `chromium` project and therefore from `pnpm test:e2e`
 * — see playwright.config.ts). Never part of CI: `.github/workflows/ci.yml`
 * runs typecheck/test/build only, and screenshot baselines are rendered by
 * the OS's own font/subpixel stack, so a baseline recorded on one platform
 * (win32, committed here) does not match a Linux CI runner byte-for-byte.
 * A Linux-rendered baseline set would be needed before this could run in
 * CI; `--update-snapshots` on that platform is how to produce it.
 *
 * Determinism:
 *  - `prefers-reduced-motion: reduce` disables carousel autoplay and CSS
 *    transitions driven by that media query (same technique as
 *    `hero-carousel.spec.ts`'s reduced-motion test).
 *  - `page.addStyleTag` additionally forces every animation/transition off,
 *    for the few that do not key off the media query.
 *  - `document.fonts.ready` is awaited before taking the screenshot so a
 *    shot is never taken mid font-swap (fonts.css's fontsource faces use
 *    `font-display: swap`).
 *  - `mask` covers elements that legitimately vary between runs (CMS-sourced
 *    dates/counters) rather than disabling the check for the whole page.
 */

const VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1280, height: 800 },
];

const PAGES = [
  { label: 'home', path: '/es/' },
  { label: 'activities-catalog', path: '/es/ingles/actividades' },
  { label: 'news-list', path: '/es/noticias' },
];

/** Elements whose content is allowed to change between runs (dates, counts). */
const DYNAMIC_SELECTORS = ['time', '[data-dynamic]', '[data-view-count]'];

async function prepareForScreenshot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
  });
}

test.describe('visual regression (public pages)', () => {
  for (const viewport of VIEWPORTS) {
    for (const target of PAGES) {
      test(`${target.label} @ ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(target.path, { waitUntil: 'networkidle' });
        await prepareForScreenshot(page);

        const mask = (
          await Promise.all(
            DYNAMIC_SELECTORS.map((selector) => page.locator(selector).all()),
          )
        ).flat();

        await expect(page).toHaveScreenshot(
          `${target.label}-${viewport.label}.png`,
          {
            fullPage: true,
            mask,
            maxDiffPixelRatio: 0.01,
          },
        );
      });
    }
  }
});
