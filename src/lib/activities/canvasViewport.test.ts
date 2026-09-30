import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  INPUT_MIN_ZOOM,
  clampZoom,
  clampZoomInput,
  parseZoomPercentInput,
  fitZoom,
  stepZoom,
  stepZoomInput,
  wheelZoom,
  wheelZoomInput,
  contentSize,
  rotatedSize,
  fitCamera,
  clampCamera,
  clampCameraLoose,
  zoomAt,
  panBy,
  screenToContentPoint,
  contentToScreenPoint,
  distanceBetween,
  midpoint,
  anchoredZoom,
  visibleImageRect,
  type Camera,
} from './canvasViewport';

describe('clampZoom', () => {
  it('keeps an in-range zoom unchanged', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('floors below MIN_ZOOM', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-1)).toBe(MIN_ZOOM);
  });

  it('caps above MAX_ZOOM', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
  });

  it('defaults a non-finite zoom to 100%', () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});

describe('fitZoom', () => {
  it('fits a landscape image into a wider viewport by the height ratio', () => {
    // viewport 1000x500, image 800x400 (same 2:1 ratio) -> scale 1.25 both axes
    expect(fitZoom({ width: 1000, height: 500 }, { width: 800, height: 400 })).toBe(1.25);
  });

  it('picks the SMALLER axis ratio so the whole image stays visible', () => {
    // width ratio would be 2x (400/200), height ratio 1x (300/300) -> must use 1x
    expect(fitZoom({ width: 400, height: 300 }, { width: 200, height: 300 })).toBe(1);
  });

  it('clamps a huge fit ratio to MAX_ZOOM', () => {
    expect(fitZoom({ width: 10000, height: 10000 }, { width: 10, height: 10 })).toBe(MAX_ZOOM);
  });

  it('returns 100% for a not-yet-laid-out viewport or image (jsdom, zero rect)', () => {
    expect(fitZoom({ width: 0, height: 0 }, { width: 800, height: 400 })).toBe(1);
    expect(fitZoom({ width: 800, height: 400 }, { width: 0, height: 0 })).toBe(1);
  });

  // Regression coverage (canvas tools pass, "Ajustar is broken"): the pure
  // fit math itself was already correct for these shapes even before that
  // fix — the real defect was the COMPONENT never computing a fit zoom
  // synchronously on mount (see `WorksheetZoneEditor.tsx`'s `useLayoutEffect`
  // and its own header comment). These two cases pin the pure math down
  // explicitly so a future regression in either shows up here first.
  it('fits a LANDSCAPE image into a short, wide viewport by the height ratio', () => {
    // viewport 1200x300 (short, wide); image 1600x800 (2:1 landscape).
    // width ratio 1200/1600 = 0.75, height ratio 300/800 = 0.375 -> 0.375.
    expect(fitZoom({ width: 1200, height: 300 }, { width: 1600, height: 800 })).toBe(0.375);
  });

  it('fits a PORTRAIT image into the same short, wide viewport, clamped at the MIN_ZOOM floor', () => {
    // viewport 1200x300; image 600x1200 (1:2 portrait).
    // width ratio 1200/600 = 2, height ratio 300/1200 = 0.25 -> 0.25 (== MIN_ZOOM).
    expect(fitZoom({ width: 1200, height: 300 }, { width: 600, height: 1200 })).toBe(MIN_ZOOM);
  });
});

describe('stepZoom', () => {
  it('steps in by ZOOM_STEP', () => {
    expect(stepZoom(1, 'in')).toBe(1 + ZOOM_STEP);
  });

  it('steps out by ZOOM_STEP', () => {
    expect(stepZoom(1, 'out')).toBe(1 - ZOOM_STEP);
  });

  it('clamps at the floor and ceiling', () => {
    expect(stepZoom(MIN_ZOOM, 'out')).toBe(MIN_ZOOM);
    expect(stepZoom(MAX_ZOOM, 'in')).toBe(MAX_ZOOM);
  });
});

describe('contentSize', () => {
  it('scales the image size by the zoom factor', () => {
    expect(contentSize({ width: 800, height: 400 }, 0.5)).toEqual({ width: 400, height: 200 });
    expect(contentSize({ width: 800, height: 400 }, 2)).toEqual({ width: 1600, height: 800 });
  });
});

describe('rotatedSize (worksheet rotation)', () => {
  it('leaves the size unchanged at 0deg', () => {
    expect(rotatedSize({ width: 800, height: 400 }, 0)).toEqual({ width: 800, height: 400 });
  });

  it('leaves the size unchanged at 180deg (no axis swap)', () => {
    expect(rotatedSize({ width: 800, height: 400 }, 180)).toEqual({ width: 800, height: 400 });
  });

  it('swaps width and height at 90deg', () => {
    expect(rotatedSize({ width: 800, height: 400 }, 90)).toEqual({ width: 400, height: 800 });
  });

  it('swaps width and height at 270deg', () => {
    expect(rotatedSize({ width: 800, height: 400 }, 270)).toEqual({ width: 400, height: 800 });
  });
});

describe('clampZoomInput (editable % field — wider floor than the toolbar)', () => {
  it('keeps an in-range value unchanged', () => {
    expect(clampZoomInput(1)).toBe(1);
  });

  it('floors below INPUT_MIN_ZOOM (10%), below the toolbar-wide MIN_ZOOM (25%)', () => {
    expect(clampZoomInput(0.05)).toBe(INPUT_MIN_ZOOM);
    expect(clampZoomInput(0.15)).toBe(0.15); // 15% is invalid for clampZoom but valid here
  });

  it('caps above MAX_ZOOM, same ceiling as the toolbar', () => {
    expect(clampZoomInput(10)).toBe(MAX_ZOOM);
  });

  it('defaults a non-finite value to 100%', () => {
    expect(clampZoomInput(NaN)).toBe(1);
  });
});

describe('parseZoomPercentInput', () => {
  it('parses a plain number', () => {
    expect(parseZoomPercentInput('80')).toBe(80);
  });

  it('parses a trailing % sign, with or without a space before it', () => {
    expect(parseZoomPercentInput('80%')).toBe(80);
    expect(parseZoomPercentInput('80 %')).toBe(80);
  });

  it('trims surrounding whitespace', () => {
    expect(parseZoomPercentInput('  80  ')).toBe(80);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseZoomPercentInput('')).toBeNull();
    expect(parseZoomPercentInput('   ')).toBeNull();
    expect(parseZoomPercentInput('abc')).toBeNull();
    expect(parseZoomPercentInput('%')).toBeNull();
  });
});

describe('wheelZoom (batched, proportional wheel zoom)', () => {
  it('zooms in on a negative deltaY (wheel up / pinch out)', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
  });

  it('zooms out on a positive deltaY (wheel down / pinch in)', () => {
    expect(wheelZoom(1, 100)).toBeLessThan(1);
  });

  it('is a no-op for a zero delta', () => {
    expect(wheelZoom(1, 0)).toBe(1);
  });

  it('clamps a huge accumulated delta to at most MAX_WHEEL_ZOOM_STEP of change in one call', () => {
    const next = wheelZoom(1, -1_000_000);
    expect(next).toBeLessThanOrEqual(1.5); // MAX_WHEEL_ZOOM_STEP is 0.5
    expect(next).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('never zooms out below MIN_ZOOM even with a huge positive delta', () => {
    expect(wheelZoom(MIN_ZOOM, 1_000_000)).toBe(MIN_ZOOM);
  });

  it('scales the step with the CURRENT zoom (proportional, not flat)', () => {
    const stepAtLowZoom = wheelZoom(0.5, -100) - 0.5;
    const stepAtHighZoom = wheelZoom(2, -100) - 2;
    expect(stepAtHighZoom).toBeGreaterThan(stepAtLowZoom);
  });
});

describe('stepZoomInput (unified −/+ button clamp, 10%-400% like the editable input)', () => {
  it('steps in/out by ZOOM_STEP, same as stepZoom in-range', () => {
    expect(stepZoomInput(1, 'in')).toBe(1 + ZOOM_STEP);
    expect(stepZoomInput(1, 'out')).toBe(1 - ZOOM_STEP);
  });

  it('floors at the WIDER 10% input floor, below stepZoom\'s own 25% floor', () => {
    // stepZoom would stop at MIN_ZOOM (25%); the unified buttons must reach
    // all the way down to INPUT_MIN_ZOOM (10%) like the editable % field.
    expect(stepZoomInput(0.15, 'out')).toBe(INPUT_MIN_ZOOM);
    expect(stepZoom(0.15, 'out')).toBe(MIN_ZOOM); // the OLD/unwidened helper, unchanged
  });

  it('caps at the same 400% ceiling', () => {
    expect(stepZoomInput(MAX_ZOOM, 'in')).toBe(MAX_ZOOM);
  });
});

describe('wheelZoomInput (unified wheel clamp, 10%-400%)', () => {
  it('matches wheelZoom in-range', () => {
    expect(wheelZoomInput(1, -100)).toBeCloseTo(wheelZoom(1, -100));
  });

  it('reaches below wheelZoom\'s own 25% floor, down to the wider 10% floor', () => {
    expect(wheelZoomInput(0.12, 1_000_000)).toBe(INPUT_MIN_ZOOM);
    expect(wheelZoom(0.12, 1_000_000)).toBe(MIN_ZOOM); // the OLD/unwidened helper, unchanged
  });
});

describe('screenToContentPoint / contentToScreenPoint (camera coordinate conversion)', () => {
  const camera: Camera = { scale: 2, x: 10, y: 20 };

  it('converts a viewport-relative screen point into content-space pixels', () => {
    // content = (screen - offset) / scale
    expect(screenToContentPoint({ x: 110, y: 220 }, camera)).toEqual({ x: 50, y: 100 });
  });

  it('is the exact inverse of contentToScreenPoint', () => {
    const content = { x: 37, y: 64 };
    const screen = contentToScreenPoint(content, camera);
    expect(screenToContentPoint(screen, camera)).toEqual(content);
  });

  it('is a no-op at the identity camera (scale 1, no offset)', () => {
    const identity: Camera = { scale: 1, x: 0, y: 0 };
    expect(screenToContentPoint({ x: 42, y: 7 }, identity)).toEqual({ x: 42, y: 7 });
  });
});

describe('clampCamera (bounded worksheet camera)', () => {
  it('CENTERS the content on an axis where the scaled content is SMALLER than the viewport', () => {
    // viewport 800x800, content 100x100 at scale 1 -> centered offset 350 both axes.
    const result = clampCamera({ scale: 1, x: 0, y: 0 }, { width: 100, height: 100 }, { width: 800, height: 800 });
    expect(result).toEqual({ scale: 1, x: 350, y: 350 });
  });

  it('clamps a smaller-than-viewport axis back to centered even if the caller proposed an offset', () => {
    const result = clampCamera({ scale: 1, x: 9999, y: -9999 }, { width: 100, height: 100 }, { width: 800, height: 800 });
    expect(result).toEqual({ scale: 1, x: 350, y: 350 });
  });

  it('clamps a LARGER-than-viewport axis so the image edges reach the viewport edges exactly, no further', () => {
    // viewport 400x400, content 1000x1000 at scale 1 -> x/y range is [-600, 0].
    const min = clampCamera({ scale: 1, x: -9999, y: -9999 }, { width: 1000, height: 1000 }, { width: 400, height: 400 });
    expect(min).toEqual({ scale: 1, x: -600, y: -600 });
    const max = clampCamera({ scale: 1, x: 9999, y: 9999 }, { width: 1000, height: 1000 }, { width: 400, height: 400 });
    expect(max).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('every corner of an oversized image is reachable: (0,0) puts the top-left corner exactly at the viewport origin', () => {
    const atOrigin = clampCamera({ scale: 1, x: 0, y: 0 }, { width: 1000, height: 1000 }, { width: 400, height: 400 });
    expect(atOrigin).toEqual({ scale: 1, x: 0, y: 0 }); // untouched: already in range
  });

  it('clamps scale to the shared 10%-400% camera range', () => {
    const tooSmall = clampCamera({ scale: 0.01, x: 0, y: 0 }, { width: 100, height: 100 }, { width: 100, height: 100 });
    expect(tooSmall.scale).toBe(INPUT_MIN_ZOOM);
    const tooBig = clampCamera({ scale: 100, x: 0, y: 0 }, { width: 100, height: 100 }, { width: 100, height: 100 });
    expect(tooBig.scale).toBe(MAX_ZOOM);
  });

  it('independently clamps each axis (one smaller, one larger than the viewport)', () => {
    // viewport 800x200, content 400x1000 at scale 1: x-axis smaller (centered),
    // y-axis larger (clamped to [-800, 0]).
    const result = clampCamera({ scale: 1, x: 0, y: 0 }, { width: 400, height: 1000 }, { width: 800, height: 200 });
    expect(result).toEqual({ scale: 1, x: 200, y: 0 });
  });
});

describe('clampCameraLoose (the EDITOR\'s own free-panning camera bound)', () => {
  it('does NOT force-center a smaller-than-viewport axis — free panning even at "fit" (the bug this fixes)', () => {
    // viewport 800x800, content 100x100 at scale 1 — `clampCamera` would
    // force this to the centered (350, 350) regardless of the proposed
    // offset; the loose bound leaves an UNCLAMPED offset alone.
    const result = clampCameraLoose({ scale: 1, x: 0, y: 0 }, { width: 100, height: 100 }, { width: 800, height: 800 });
    expect(result).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('bounds a smaller-than-viewport axis so >= max(20%, 80px) of the content stays visible, not centering it', () => {
    // content 100x100: minVisiblePx (80) wins over 20% (20) -> visibleMin 80.
    // range = [80 - 100, 800 - 80] = [-20, 720].
    const min = clampCameraLoose({ scale: 1, x: -9999, y: -9999 }, { width: 100, height: 100 }, { width: 800, height: 800 });
    expect(min).toEqual({ scale: 1, x: -20, y: -20 });
    const max = clampCameraLoose({ scale: 1, x: 9999, y: 9999 }, { width: 100, height: 100 }, { width: 800, height: 800 });
    expect(max).toEqual({ scale: 1, x: 720, y: 720 });
    // An offset already inside the range is untouched.
    const inRange = clampCameraLoose({ scale: 1, x: 400, y: -10 }, { width: 100, height: 100 }, { width: 800, height: 800 });
    expect(inRange).toEqual({ scale: 1, x: 400, y: -10 });
  });

  it('bounds an oversized axis MORE LOOSELY than the strict clamp — past either edge, at least the minimum stays visible', () => {
    // image 2000x2000, viewport 800x800: content-length 2000 -> 20% = 400
    // (wins over the 80px floor) -> range = [400 - 2000, 800 - 400] = [-1600, 400].
    // The strict clamp's own range here is only [-1200, 0] (see `clampCamera`'s
    // own "LARGER-than-viewport axis" test above with the same numbers) —
    // this reaches well past it in both directions.
    const min = clampCameraLoose({ scale: 1, x: -9999, y: -9999 }, { width: 2000, height: 2000 }, { width: 800, height: 800 });
    expect(min).toEqual({ scale: 1, x: -1600, y: -1600 });
    const max = clampCameraLoose({ scale: 1, x: 9999, y: 9999 }, { width: 2000, height: 2000 }, { width: 800, height: 800 });
    expect(max).toEqual({ scale: 1, x: 400, y: 400 });
    // An offset the STRICT clamp would already reject (-1500, past its own
    // -1200 floor) stays put here — genuinely freer panning, not just a
    // wider centered band.
    const pastStrictFloor = clampCameraLoose(
      { scale: 1, x: -1500, y: 0 },
      { width: 2000, height: 2000 },
      { width: 800, height: 800 },
    );
    expect(pastStrictFloor.x).toBe(-1500);
  });

  it('keeps AT LEAST minVisiblePx of the image inside the viewport at the extremes — it can never be fully lost', () => {
    const image = { width: 2000, height: 2000 };
    const viewport = { width: 800, height: 800 };
    const min = clampCameraLoose({ scale: 1, x: -9999, y: 0 }, image, viewport);
    // The image's right edge (x + width) must still be >= minVisiblePx (80) pixels into the viewport.
    expect(min.x + image.width).toBeGreaterThanOrEqual(80);
    const max = clampCameraLoose({ scale: 1, x: 9999, y: 0 }, image, viewport);
    // The image's left edge (x) must still be <= viewport.width - minVisiblePx.
    expect(max.x).toBeLessThanOrEqual(viewport.width - 80);
  });

  it('never demands more of a TINY image be visible than it actually has', () => {
    // content 10x10, well under the 80px floor and under 20% of itself too
    // (2px) — visibleMin caps at the content's own size (10), so the WHOLE
    // image must stay visible, never less, never "more than exists".
    const result = clampCameraLoose({ scale: 1, x: -9999, y: -9999 }, { width: 10, height: 10 }, { width: 800, height: 800 });
    expect(result.x).toBe(10 - 10); // = 0: the right edge exactly at the origin, all 10px visible
    const max = clampCameraLoose({ scale: 1, x: 9999, y: 9999 }, { width: 10, height: 10 }, { width: 800, height: 800 });
    expect(max.x).toBe(800 - 10); // left edge exactly at the viewport's own far edge, all 10px visible
  });

  it('never produces an inverted (min > max) range even for a viewport SMALLER than the visibility floor', () => {
    // content 2000, viewport only 50 (smaller than the 80px floor itself) —
    // `visibleMin` caps at the viewport's own length too, so the range never
    // inverts (see the function's own header for the proof).
    const result = clampCameraLoose({ scale: 1, x: 12345, y: -12345 }, { width: 2000, height: 2000 }, { width: 50, height: 50 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });

  it('accepts custom minVisibleFraction/minVisiblePx options', () => {
    // content 1000, viewport 800: 50% of 1000 = 500 (wins over a 10px floor) -> range = [500-1000, 800-500] = [-500, 300].
    const result = clampCameraLoose(
      { scale: 1, x: -9999, y: 0 },
      { width: 1000, height: 1000 },
      { width: 800, height: 800 },
      { minVisibleFraction: 0.5, minVisiblePx: 10 },
    );
    expect(result.x).toBe(-500);
  });

  it('clamps scale to the same shared 10%-400% camera range as clampCamera', () => {
    const tooSmall = clampCameraLoose({ scale: 0.01, x: 0, y: 0 }, { width: 100, height: 100 }, { width: 100, height: 100 });
    expect(tooSmall.scale).toBe(INPUT_MIN_ZOOM);
    const tooBig = clampCameraLoose({ scale: 100, x: 0, y: 0 }, { width: 100, height: 100 }, { width: 100, height: 100 });
    expect(tooBig.scale).toBe(MAX_ZOOM);
  });

  it('independently clamps each axis', () => {
    // x-axis: content 100 in viewport 800 -> visibleMin 80, range [-20, 720].
    // y-axis: content 2000 in viewport 800 -> visibleMin 400, range [-1600, 400].
    const result = clampCameraLoose(
      { scale: 1, x: 9999, y: -9999 },
      { width: 100, height: 2000 },
      { width: 800, height: 800 },
    );
    expect(result).toEqual({ scale: 1, x: 720, y: -1600 });
  });
});

describe('fitCamera (whole image visible, centered)', () => {
  it('fits a LANDSCAPE image, centered on the shorter axis', () => {
    // viewport 1000x500, image 800x400 (same ratio) -> scale 1.25, both axes exactly fill -> no centering offset.
    const camera = fitCamera({ width: 800, height: 400 }, { width: 1000, height: 500 });
    expect(camera.scale).toBe(1.25);
    expect(camera.x).toBeCloseTo(0);
    expect(camera.y).toBeCloseTo(0);
  });

  it('fits a PORTRAIT image inside a wide viewport, centered horizontally', () => {
    // viewport 1200x300, image 600x1200 -> scale MIN_ZOOM (0.25, same fixture as fitZoom's own test).
    // content = 150x300: height matches exactly (0 offset), width (150) centered in 1200 -> (1200-150)/2 = 525.
    const camera = fitCamera({ width: 600, height: 1200 }, { width: 1200, height: 300 });
    expect(camera.scale).toBe(MIN_ZOOM);
    expect(camera.x).toBeCloseTo(525);
    expect(camera.y).toBeCloseTo(0);
  });

  it('fits a ROTATED (90deg-swapped) size the same way fitZoom does — caller passes the already-rotated dimensions', () => {
    // Same numbers as the "swaps width and height at 90deg" pattern used across the codebase:
    // an 800x400 image displayed at 90deg is 400x800; fit into a 400x400 viewport ->
    // scale = min(400/400, 400/800) = 0.5. Content is then 200x400: the height axis
    // matches exactly (0 offset), the width axis (200) is centered in 400 -> (400-200)/2 = 100.
    const camera = fitCamera({ width: 400, height: 800 }, { width: 400, height: 400 });
    expect(camera.scale).toBe(0.5);
    expect(camera.x).toBeCloseTo(100);
    expect(camera.y).toBeCloseTo(0);
  });

  it('returns a centered 100% camera for a not-yet-laid-out viewport or image', () => {
    const camera = fitCamera({ width: 800, height: 400 }, { width: 0, height: 0 });
    expect(camera.scale).toBe(1);
  });
});

describe('zoomAt (keeps a viewport-relative point anchored to the same content pixel)', () => {
  const bounds = { image: { width: 2000, height: 2000 }, viewport: { width: 500, height: 500 } };

  it('keeps the point under the cursor fixed when zooming in, unclamped case', () => {
    // camera at scale 1, no offset; point (50,50) maps to content (50,50).
    // Zooming to scale 2 must put content point (50,50) back at screen (50,50):
    // x' = point.x - content.x * newScale = 50 - 50*2 = -50.
    const camera: Camera = { scale: 1, x: 0, y: 0 };
    const next = zoomAt(camera, 2, { x: 50, y: 50 }, bounds);
    expect(next.scale).toBe(2);
    const back = screenToContentPoint({ x: 50, y: 50 }, next);
    expect(back).toEqual(screenToContentPoint({ x: 50, y: 50 }, camera));
  });

  it('the anchored content point is invariant across a range of zoom factors (property check)', () => {
    // A validly-CENTERED starting camera (huge image, so every tested scale
    // keeps it larger than the viewport) and a viewport-CENTERED anchor:
    // symmetric enough that none of the tested scales gets re-clamped, so
    // the anchor invariant is checkable directly rather than conditionally.
    // (-750, -750) visually centers a 2000x2000 image at scale 1 inside the
    // 500x500 viewport: (500 - 2000) / 2 = -750 on both axes.
    const camera = clampCamera({ scale: 1, x: -750, y: -750 }, bounds.image, bounds.viewport);
    const anchor = { x: bounds.viewport.width / 2, y: bounds.viewport.height / 2 };
    const anchoredContent = screenToContentPoint(anchor, camera);
    for (const targetScale of [0.8, 1, 1.3]) {
      const next = zoomAt(camera, targetScale, anchor, bounds);
      expect(next.scale).toBe(targetScale); // sanity: this range never hits INPUT_MIN_ZOOM/MAX_ZOOM either
      expect(screenToContentPoint(anchor, next).x).toBeCloseTo(anchoredContent.x);
      expect(screenToContentPoint(anchor, next).y).toBeCloseTo(anchoredContent.y);
    }
  });

  it('still clamps the resulting camera against bounds (never leaves the image under-covering the viewport)', () => {
    const camera: Camera = { scale: 1, x: 0, y: 0 };
    // Zooming OUT far enough that content would be smaller than viewport re-centers it instead of
    // leaving it pinned to the (now stale) anchor position.
    const next = zoomAt(camera, 0.01, { x: 50, y: 50 }, bounds);
    expect(next.scale).toBe(INPUT_MIN_ZOOM);
    const content = { width: bounds.image.width * next.scale, height: bounds.image.height * next.scale };
    expect(next.x).toBeCloseTo((bounds.viewport.width - content.width) / 2);
  });
});

describe('panBy (translate the camera, clamped like every other camera change)', () => {
  const bounds = { image: { width: 1000, height: 1000 }, viewport: { width: 400, height: 400 } };

  it('translates by (dx, dy) within bounds', () => {
    const camera: Camera = { scale: 1, x: -100, y: -100 };
    const next = panBy(camera, 10, -10, bounds);
    expect(next).toEqual({ scale: 1, x: -90, y: -110 });
  });

  it('clamps so every corner of an oversized image stays reachable but never overshoots', () => {
    const camera: Camera = { scale: 1, x: 0, y: 0 };
    const next = panBy(camera, 10_000, 10_000, bounds);
    expect(next).toEqual({ scale: 1, x: 0, y: 0 }); // already at the max-reachable corner
    const other = panBy(camera, -10_000, -10_000, bounds);
    expect(other).toEqual({ scale: 1, x: -600, y: -600 }); // content 1000 - viewport 400
  });
});

describe('distanceBetween (pinch gesture primitive)', () => {
  it('is the straight-line distance between two points', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is zero for two identical points', () => {
    expect(distanceBetween({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
  });

  it('does not depend on argument order', () => {
    const a = { x: 12, y: 40 };
    const b = { x: 100, y: 5 };
    expect(distanceBetween(a, b)).toBe(distanceBetween(b, a));
  });
});

describe('midpoint (pinch gesture primitive)', () => {
  it('is the average of the two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('is the point itself when both fingers are at the same spot', () => {
    expect(midpoint({ x: 7, y: 3 }, { x: 7, y: 3 })).toEqual({ x: 7, y: 3 });
  });
});

describe('anchoredZoom (zoomAt generalized to a moving anchor — the pinch gesture primitive)', () => {
  const bounds = { image: { width: 1000, height: 1000 }, viewport: { width: 400, height: 400 } };

  it('matches zoomAt exactly when the anchor has not moved (anchorStart === anchorCurrent)', () => {
    const camera: Camera = { scale: 1, x: -150, y: -80 };
    const point = { x: 120, y: 90 };
    expect(anchoredZoom(camera, 1.5, point, point, bounds)).toEqual(zoomAt(camera, 1.5, point, bounds));
  });

  it('fingers moving apart zooms in, keeping the gesture-start content pixel under the fingers throughout', () => {
    const startCamera: Camera = { scale: 1, x: -200, y: -200 }; // centered 400x400 window over a 1000x1000 image
    const startA = { x: 150, y: 200 };
    const startB = { x: 250, y: 200 };
    const startDist = distanceBetween(startA, startB); // 100
    const startMid = midpoint(startA, startB); // { x: 200, y: 200 }

    const currentA = { x: 100, y: 200 };
    const currentB = { x: 300, y: 200 };
    const currentDist = distanceBetween(currentA, currentB); // 200 -> 2x
    const currentMid = midpoint(currentA, currentB); // still { x: 200, y: 200 } — a symmetric pinch, no pan

    const nextScale = startCamera.scale * (currentDist / startDist);
    const next = anchoredZoom(startCamera, nextScale, startMid, currentMid, bounds);

    expect(next.scale).toBe(2);
    // The content pixel that was under the fingers when the gesture STARTED
    // must still be exactly there.
    const contentAtStart = screenToContentPoint(startMid, startCamera);
    expect(screenToContentPoint(currentMid, next)).toEqual(contentAtStart);
  });

  it('a pure two-finger pan (no distance change) translates by exactly the midpoint delta', () => {
    const startCamera: Camera = { scale: 1, x: -200, y: -200 };
    const startMid = { x: 200, y: 200 };
    const currentMid = { x: 230, y: 210 }; // panned +30/+10, same distance apart -> scale unchanged

    const next = anchoredZoom(startCamera, startCamera.scale, startMid, currentMid, bounds);

    expect(next.scale).toBe(1);
    expect(next.x).toBeCloseTo(startCamera.x + 30);
    expect(next.y).toBeCloseTo(startCamera.y + 10);
  });

  it('a combined pinch-and-pan does both: zooms in AND tracks the moving midpoint', () => {
    const startCamera: Camera = { scale: 1, x: -200, y: -200 };
    const startMid = { x: 200, y: 200 };
    const currentMid = { x: 250, y: 200 }; // panned +50 while also zooming below

    const next = anchoredZoom(startCamera, 2, startMid, currentMid, bounds);

    expect(next.scale).toBe(2);
    const contentAtStart = screenToContentPoint(startMid, startCamera);
    expect(screenToContentPoint(currentMid, next)).toEqual(contentAtStart);
  });
});

describe('visibleImageRect (keyboard zone creation anchor)', () => {
  it('returns the full [0, 1] square when the whole image fits inside the viewport', () => {
    const camera = fitCamera({ width: 800, height: 400 }, { width: 400, height: 400 });
    const rect = visibleImageRect(camera, { width: 800, height: 400 }, { width: 400, height: 400 });
    expect(rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('returns a smaller, centered rect when zoomed in past 100% with a centered camera', () => {
    // 800x400 image, 100% zoom, camera centered (x/y both 0) -> viewport shows
    // exactly its own 400x400 box, which is half the image's width and the
    // full height.
    const camera: Camera = { scale: 1, x: 0, y: 0 };
    const rect = visibleImageRect(camera, { width: 800, height: 400 }, { width: 400, height: 400 });
    expect(rect.w).toBeCloseTo(0.5);
    expect(rect.h).toBeCloseTo(1);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
  });

  it('clamps to the image bounds when the camera is panned so part of the viewport shows empty margin', () => {
    // Panned camera.x = 100 shows the viewport starting BEFORE the image's
    // left edge (content x = -100..300); clamped to [0, image.width].
    const camera: Camera = { scale: 1, x: 100, y: 0 };
    const rect = visibleImageRect(camera, { width: 800, height: 400 }, { width: 400, height: 400 });
    expect(rect.x).toBe(0);
    expect(rect.w).toBeCloseTo(300 / 800);
  });

  it('returns the full square for a non-positive image dimension', () => {
    const camera: Camera = { scale: 1, x: 0, y: 0 };
    expect(visibleImageRect(camera, { width: 0, height: 0 }, { width: 400, height: 400 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });
});
