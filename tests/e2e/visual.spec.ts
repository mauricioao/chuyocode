import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_MARKERS } from './visual/sanityFixtures.mjs';
import { DAILY_PICK_TITLE, FIRST_REGULAR_TITLE } from './visual/activityFixtures';

/**
 * Visual regression for the same public, unauthenticated pages covered by
 * `tests/e2e/a11y.spec.ts`: home, the Inglés activities catalog (guest
 * browse), and the news list.
 *
 * Runs only via `pnpm test:visual` (its own config,
 * playwright.visual.config.ts — not part of `pnpm test:e2e`). Never part of
 * CI: `.github/workflows/ci.yml` runs typecheck/test/build only, and
 * screenshot baselines are rendered by the OS's own font/subpixel stack, so a
 * baseline recorded on one platform (win32, committed here) does not match a
 * Linux CI runner byte-for-byte. A Linux-rendered baseline set would be
 * needed before this could run in CI; `--update-snapshots` on that platform
 * is how to produce it.
 *
 * Data (tests/e2e/README.md, "Visual snapshots"): never live content.
 *  - Sanity (home, news): a local fixture server answers the app's GROQ
 *    queries from the synthetic dataset in `visual/sanityFixtures.mjs`.
 *  - Supabase (catalog): the LOCAL stack, seeded with a fixed set of
 *    published activities by `visual/globalSetup.ts` and arranged so today's
 *    "Actividad del día" is always the same card (`visual/activityFixtures.ts`).
 *  Each test first asserts a fixture marker on the page, so a run that
 *  somehow reached other data fails with a clear message instead of a diff.
 *
 * Determinism:
 *  - `prefers-reduced-motion: reduce` disables carousel autoplay and CSS
 *    transitions driven by that media query (same technique as
 *    `hero-carousel.spec.ts`'s reduced-motion test).
 *  - `page.addStyleTag` additionally forces every animation/transition off,
 *    for the few that do not key off the media query.
 *  - Lazy images are switched to eager and awaited, so a full-page shot never
 *    catches an image half-loaded below the fold.
 *  - Every `.reveal` section gets `.revealed` up front: the scroll-reveal
 *    (src/lib/reveal.ts) only fires on intersection, and a full-page shot
 *    does not scroll, so below-the-fold sections would otherwise be blank.
 *  - Astro's dev toolbar (the suite runs on `astro dev`) is hidden.
 *  - `document.fonts.ready` is awaited before taking the screenshot so a
 *    shot is never taken mid font-swap (fonts.css's fontsource faces use
 *    `font-display: swap`).
 *  - The footer's copyright year, the one thing on these pages that still
 *    depends on the server clock, is pinned to {@link PINNED_YEAR}.
 */

const PINNED_YEAR = '2026';

const VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1280, height: 800 },
];

const PAGES = [
  {
    label: 'home',
    path: '/es/',
    async assertFixtureData(page: Page) {
      await expect(page.locator('main')).toContainText(FIXTURE_MARKERS.homeBookTitle);
    },
  },
  {
    label: 'activities-catalog',
    path: '/es/ingles/actividades',
    async assertFixtureData(page: Page) {
      const cards = page.getByTestId('activity-card');
      await expect(cards.nth(0)).toContainText(DAILY_PICK_TITLE);
      await expect(cards.nth(1)).toContainText(FIRST_REGULAR_TITLE);
      await expect(cards).toHaveCount(20);
    },
  },
  {
    label: 'news-list',
    path: '/es/noticias',
    async assertFixtureData(page: Page) {
      await expect(page.locator('[data-news-item]').first()).toContainText(FIXTURE_MARKERS.firstNewsTitle);
    },
  },
];

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
      astro-dev-toolbar { display: none !important; }
    `,
  });
  await page.evaluate(async (year) => {
    for (const el of document.querySelectorAll('.reveal')) el.classList.add('revealed');
    for (const p of document.querySelectorAll('footer p')) {
      if (p.textContent?.includes('©')) p.textContent = p.textContent.replace(/\d{4}/, year);
    }
    const images = Array.from(document.images);
    for (const img of images) img.loading = 'eager';
    await Promise.all(
      images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
    );
    if ('fonts' in document) {
      await document.fonts.ready;
    }
  }, PINNED_YEAR);
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
        await target.assertFixtureData(page);
        await prepareForScreenshot(page);

        await expect(page).toHaveScreenshot(
          `${target.label}-${viewport.label}.png`,
          {
            fullPage: true,
            maxDiffPixelRatio: 0.01,
          },
        );
      });
    }
  }
});
