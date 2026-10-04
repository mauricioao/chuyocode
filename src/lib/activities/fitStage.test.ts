import { describe, it, expect } from 'vitest';
import {
  fitStage,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  STAGE_SAFE_AREA_X,
  STAGE_SAFE_AREA_Y,
  STAGE_SAFE_WIDTH,
  STAGE_SAFE_HEIGHT,
} from './fitStage';

describe('fitStage', () => {
  it('scales 1:1 and centers with no bands when the viewport is exactly the stage size', () => {
    expect(fitStage(STAGE_WIDTH, STAGE_HEIGHT)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('scales down uniformly when the viewport is smaller, with no bands at the same aspect ratio', () => {
    // Exactly half the stage on both axes (still 16:9).
    expect(fitStage(960, 540)).toEqual({ scale: 0.5, offsetX: 0, offsetY: 0 });
  });

  it('letterboxes left/right when the viewport is wider than 16:9 (height-limited)', () => {
    const fit = fitStage(2560, 1080);
    expect(fit.scale).toBe(1); // height matches the stage exactly
    expect(fit.offsetY).toBe(0);
    expect(fit.offsetX).toBeGreaterThan(0);
    expect(fit.offsetX).toBeCloseTo((2560 - STAGE_WIDTH) / 2);
  });

  it('letterboxes top/bottom when the viewport is narrower than 16:9 (width-limited, e.g. portrait)', () => {
    const fit = fitStage(1080, 1920);
    expect(fit.scale).toBeCloseTo(1080 / STAGE_WIDTH);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBeGreaterThan(0);
  });

  it('keeps the stage centered: the two bands on each axis are equal', () => {
    const fit = fitStage(2000, 900);
    const scaledWidth = STAGE_WIDTH * fit.scale;
    const scaledHeight = STAGE_HEIGHT * fit.scale;
    expect(fit.offsetX).toBeCloseTo((2000 - scaledWidth) / 2);
    expect(fit.offsetY).toBeCloseTo((900 - scaledHeight) / 2);
  });

  it.each([
    [0, 1080],
    [1920, 0],
    [-100, 1080],
    [1920, -100],
    [Number.NaN, 1080],
  ])('falls back to an identity fit for a non-positive or NaN dimension (%s x %s)', (w, h) => {
    expect(fitStage(w, h)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('exposes the safe-area inset as 5% of the stage on each axis', () => {
    expect(STAGE_SAFE_AREA_X).toBeCloseTo(STAGE_WIDTH * 0.05);
    expect(STAGE_SAFE_AREA_Y).toBeCloseTo(STAGE_HEIGHT * 0.05);
  });

  it('exposes the safe area size, still exactly 16:9, with the inset removed from each side', () => {
    expect(STAGE_SAFE_WIDTH).toBeCloseTo(STAGE_WIDTH - 2 * STAGE_SAFE_AREA_X);
    expect(STAGE_SAFE_HEIGHT).toBeCloseTo(STAGE_HEIGHT - 2 * STAGE_SAFE_AREA_Y);
    expect(STAGE_SAFE_WIDTH / STAGE_SAFE_HEIGHT).toBeCloseTo(STAGE_WIDTH / STAGE_HEIGHT);
  });
});
