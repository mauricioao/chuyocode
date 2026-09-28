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
  zoomAroundPoint,
  wheelZoom,
  wheelZoomInput,
  clampPanAxis,
  clampPanScroll,
  contentSize,
  rotatedSize,
  fitCamera,
  clampCamera,
  zoomAt,
  panBy,
  screenToContentPoint,
  contentToScreenPoint,
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

describe('zoomAroundPoint', () => {
  it('keeps the pointer anchored to the same content pixel when zooming in', () => {
    // pointer at (50, 50) in the viewport, no prior scroll, zooming 1x -> 2x:
    // content pixel under the pointer was (50, 50); after zoom it's at
    // (100, 100), so the viewport must scroll by 50 to keep it under the
    // still-stationary (50, 50) pointer.
    const next = zoomAroundPoint({ x: 50, y: 50 }, { left: 0, top: 0 }, 1, 2);
    expect(next).toEqual({ left: 50, top: 50 });
  });

  it('accounts for existing scroll', () => {
    const next = zoomAroundPoint({ x: 10, y: 10 }, { left: 100, top: 200 }, 1, 2);
    // content point = (110, 210); at 2x that's (220, 420); minus the pointer
    // (10, 10) -> scroll (210, 410).
    expect(next).toEqual({ left: 210, top: 410 });
  });

  it('is a no-op in scroll terms when zoom does not change', () => {
    const next = zoomAroundPoint({ x: 30, y: 40 }, { left: 5, top: 5 }, 1.5, 1.5);
    expect(next).toEqual({ left: 5, top: 5 });
  });

  it('never divides by zero for a defensive non-positive fromZoom', () => {
    const scroll = { left: 5, top: 5 };
    expect(zoomAroundPoint({ x: 1, y: 1 }, scroll, 0, 2)).toEqual(scroll);
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

describe('clampPanAxis / clampPanScroll (pan bounds)', () => {
  it('is a no-op within the native scrollable range for content bigger than the viewport', () => {
    // viewport 400, content 1000 -> center 200, allowed [-200, 800]; a normal
    // native-range scroll (0..600) is untouched.
    expect(clampPanAxis(300, 400, 1000)).toBe(300);
  });

  it('stops a pan before the content is dragged fully out of view when it is SMALLER than the viewport', () => {
    // viewport 800, content 100 -> center 400; range is [-400, -300].
    // Panning far in one direction (very negative scroll) clamps at the
    // MIN bound (-400): the content's left edge stops exactly at the
    // viewport's center, never past it.
    expect(clampPanAxis(-10_000, 800, 100)).toBe(-400);
  });

  it('stops a pan the other direction at the MAX bound', () => {
    // Same range [-400, -300]; a huge positive scroll clamps at -300: the
    // content's right edge stops exactly at the viewport's center instead.
    expect(clampPanAxis(10_000, 800, 100)).toBe(-300);
  });

  it('the min bound is -viewportLength/2 for a viewport-filling axis', () => {
    expect(clampPanAxis(-10_000, 1000, 1000)).toBe(-500);
  });

  it('applies both axes at once via clampPanScroll', () => {
    const result = clampPanScroll({ left: -10_000, top: 10_000 }, { width: 800, height: 800 }, { width: 100, height: 100 });
    expect(result).toEqual({ left: -400, top: -300 });
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
