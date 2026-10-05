import { test, expect } from '@playwright/test';

/**
 * No public page may scroll sideways at phone width. Layout overflow only
 * exists in a real browser (jsdom has no layout), so this is an e2e check.
 * The site footer renders on every page: when the stream that added the
 * Premium/Refunds links met the one that added Credits, five links in a
 * non-wrapping row pushed the Spanish pages ~40px past a 360px viewport.
 */

const PHONE_WIDTH = 360;
const PUBLIC_PAGES = [
  '/es/',
  '/en/',
  '/es/premium',
  '/es/creditos',
  '/es/legal/terms',
  '/es/legal/privacy',
  '/es/legal/reembolsos',
];

test.use({ viewport: { width: PHONE_WIDTH, height: 800 } });

for (const path of PUBLIC_PAGES) {
  test(`${path} does not scroll horizontally at ${PHONE_WIDTH}px`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(PHONE_WIDTH);
  });
}
