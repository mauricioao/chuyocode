import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Desk hub layout across the review widths (mobile review 2026-10-17,
 * LANZAMIENTO.md §2 "Revisión móvil del escritorio completo"): phone and
 * tablet flow, plus the desktop layout on laptop-sized screens.
 *
 * The hub is sign-in gated and this repo has no e2e auth fixture yet — same
 * posture as `desk-widgets-part4.spec.ts`'s own `gotoHubOrSkip`: every test
 * skips when an anonymous session does not land on the hub.
 */

async function gotoHubOrSkip(page: Page): Promise<boolean> {
  await page.goto('/es/ingles');
  return /\/ingles\/?$/.test(new URL(page.url()).pathname);
}

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no layout box');
  return b;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The TEXT's own line boxes, not the element's block box (which spans the whole centred column, wider than the words). */
async function textLines(locator: Locator): Promise<Box[]> {
  return locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  });
}

// 1280×800 is where it broke (the weather widget covered the "¿"); 1440×900
// is the approved mockup's own size; 1100 is the narrowest desktop layout
// (`--breakpoint-desk`).
for (const viewport of [
  { width: 1100, height: 720 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test.describe(`desk hub at ${viewport.width}×${viewport.height} (desktop layout)`, () => {
    test.use({ viewport });

    test('the greeting never runs under a widget', async ({ page }) => {
      const signedIn = await gotoHubOrSkip(page);
      test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');

      // The widgets reach their final size only once the weather forecast
      // and the player have loaded.
      await page.waitForLoadState('networkidle');
      const lines = [
        ...(await textLines(page.locator('[data-desk] h1'))),
        ...(await textLines(page.locator('[data-desk] h1 + p'))),
      ];
      expect(lines.length).toBeGreaterThan(1);
      for (const id of ['#desk-clock', '#desk-calendar', '#desk-player', '#desk-weather']) {
        const widget = await box(page.locator(id));
        for (const line of lines) {
          expect(overlaps(line, widget), `greeting line overlaps ${id}`).toBe(false);
        }
      }
    });

    test('the widgets keep the mockup grid (160/160/320 columns, 20px gaps)', async ({ page }) => {
      const signedIn = await gotoHubOrSkip(page);
      test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
      await page.waitForLoadState('networkidle');

      const clock = await box(page.locator('#desk-clock'));
      const calendar = await box(page.locator('#desk-calendar'));
      const player = await box(page.locator('#desk-player'));
      expect(Math.round(clock.width)).toBe(160);
      expect(Math.round(calendar.width)).toBe(160);
      expect(Math.round(player.width)).toBe(320);
      expect(Math.round(calendar.x - (clock.x + clock.width))).toBe(20);
      expect(Math.round(player.x - (calendar.x + calendar.width))).toBe(20);
    });
  });
}

// Phone and tablet flow: the widgets form one even block, like the approved
// phone mockup (`propuestas/ingles-escritorio/celular-390-completo.png`) —
// clock and calendar as an equal pair, the player and the weather spanning
// the full row. They used to keep their fixed desktop caps (160px/320px),
// leaving ragged right edges at 375 and half-empty rows at 768.
for (const viewport of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
]) {
  test.describe(`desk hub widgets at ${viewport.width}px (flow layout)`, () => {
    test.use({ viewport });

    test('the widgets share one left and one right edge, and clock/calendar are an equal pair', async ({ page }) => {
      const signedIn = await gotoHubOrSkip(page);
      test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
      await page.waitForLoadState('networkidle');

      const clock = await box(page.locator('#desk-clock'));
      const calendar = await box(page.locator('#desk-calendar'));
      const player = await box(page.locator('#desk-player'));
      const weather = await box(page.locator('#desk-weather'));
      const right = (b: Box) => b.x + b.width;

      expect(Math.abs(clock.width - calendar.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(clock.height - calendar.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(clock.x - weather.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(right(player) - right(weather))).toBeLessThanOrEqual(1);
      // On a phone the pair fills its own row too (on a tablet the player
      // shares the pair's row instead).
      if (viewport.width < 640) expect(Math.abs(right(calendar) - right(weather))).toBeLessThanOrEqual(1);
    });

    test('the hub does not scroll sideways', async ({ page }) => {
      const signedIn = await gotoHubOrSkip(page);
      test.skip(!signedIn, 'Hub is sign-in gated; no e2e auth fixture in this repo yet');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
    });
  });
}
