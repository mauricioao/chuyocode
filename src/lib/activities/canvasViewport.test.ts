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
  zoomAroundPoint,
  wheelZoom,
  clampPanAxis,
  clampPanScroll,
  contentSize,
  rotatedSize,
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
