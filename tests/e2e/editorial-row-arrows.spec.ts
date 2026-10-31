import { test, expect } from '@playwright/test';

/**
 * EditorialRow prev/next arrow positioning (bugfix, 2026-10-31).
 *
 * 6cd40c6 added `relative` to `buttonVariants`' base string; EditorialRow
 * built each arrow's class with plain string concatenation (no `cn()`), so
 * nothing ever removed that `relative` (or the base `inline-flex`/
 * `rounded-lg`) — both arrows sat in flow at the top-left of the row as a
 * small "<>" chip instead of overlaid on the poster images. This spec pins
 * the fixed geometry and the new hover/focus-gated, overflow-aware behavior
 * in a real browser (jsdom, used by EditorialRow.test.ts, has no layout and
 * never scrolls).
 *
 * Anonymous, home page only — runs under the default `chromium` project.
 */

test.describe('editorial row arrows', () => {
  test('desktop: hover-gated, centered on the poster, meaningful-arrow hiding', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/es/');

    const row = page.locator('[data-editorial-row]').first();
    if ((await row.count()) === 0) {
      test.skip(true, 'No editorial row rendered (no CMS content in this environment).');
      return;
    }

    const prev = row.locator('[data-editorial-prev]');
    const next = row.locator('[data-editorial-next]');
    const poster = row.locator('[data-editorial-track] .mediacard-stage').first();
    await expect(poster).toBeVisible();

    // At rest: both invisible. The track starts scrolled to the left, so
    // prev additionally has nothing to do yet.
    await expect(prev).toHaveCSS('opacity', '0');
    await expect(next).toHaveCSS('opacity', '0');

    // Hover the row: next fades in (there is more to scroll to). Prev stays
    // hidden because the track is still at its start — via `display: none`
    // (the "only meaningful arrows" rule), a DIFFERENT mechanism than the
    // opacity fade: the hover rule still sets `opacity: 1` on it (that part
    // of the cascade does not know about data-at-start), so `display` is the
    // property that actually keeps it off-screen here. (Chromium's own
    // scroll-snap settles the resting scrollLeft at the track's own
    // padding-left, not 0 — see the inline script's `updateEdges` comment —
    // so "at its start" is genuinely true here, not just scrollLeft === 0.)
    await row.hover();
    await expect(next).toHaveCSS('opacity', '1');
    await expect(prev).not.toBeVisible();
    await expect(prev).toHaveCSS('display', 'none');
    await expect(next).toHaveCSS('position', 'absolute');

    // Vertically centered on the POSTER image (not the whole card, which
    // also carries the caption lines below it), at the row's right extreme.
    const posterBox = await poster.boundingBox();
    const nextBox = await next.boundingBox();
    const rowBox = await row.boundingBox();
    expect(posterBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    if (!posterBox || !nextBox || !rowBox) throw new Error('unreachable');

    const posterCenterY = posterBox.y + posterBox.height / 2;
    const nextCenterY = nextBox.y + nextBox.height / 2;
    expect(Math.abs(nextCenterY - posterCenterY)).toBeLessThanOrEqual(2);
    const nextRightEdge = nextBox.x + nextBox.width;
    expect(Math.abs(nextRightEdge - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(40);

    // Clicking next scrolls the track, and prev then becomes available —
    // also absolute, also centered on the poster, at the row's left extreme.
    const track = row.locator('[data-editorial-track]');
    await next.click();
    await expect.poll(async () => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    await row.hover();
    await expect(prev).toHaveCSS('opacity', '1');
    await expect(prev).toHaveCSS('position', 'absolute');

    const prevBox = await prev.boundingBox();
    expect(prevBox).not.toBeNull();
    if (!prevBox) throw new Error('unreachable');
    const prevCenterY = prevBox.y + prevBox.height / 2;
    expect(Math.abs(prevCenterY - posterCenterY)).toBeLessThanOrEqual(2);
    expect(Math.abs(prevBox.x - rowBox.x)).toBeLessThanOrEqual(40);
  });

  test('mobile: no arrows at all', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/es/');

    const row = page.locator('[data-editorial-row]').first();
    if ((await row.count()) === 0) {
      test.skip(true, 'No editorial row rendered (no CMS content in this environment).');
      return;
    }

    await expect(row.locator('[data-editorial-prev]')).toHaveCSS('display', 'none');
    await expect(row.locator('[data-editorial-next]')).toHaveCSS('display', 'none');
  });
});
