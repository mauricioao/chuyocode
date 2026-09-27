import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  clampZoom,
  fitZoom,
  stepZoom,
  zoomAroundPoint,
  contentSize,
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
