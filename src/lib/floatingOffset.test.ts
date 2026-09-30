import { describe, expect, it } from 'vitest';
import { computeFloatingBottomOffset, visibleFooterHeight } from './floatingOffset';

describe('visibleFooterHeight', () => {
  it('is 0 when the footer has not entered the viewport yet', () => {
    expect(visibleFooterHeight(900, 800)).toBe(0);
  });

  it('is 0 when the footer top sits exactly at the viewport bottom', () => {
    expect(visibleFooterHeight(800, 800)).toBe(0);
  });

  it('is the slice below the viewport bottom once the footer starts entering', () => {
    expect(visibleFooterHeight(700, 800)).toBe(100);
  });

  it('is the full footer height once it has entered completely (top <= 0)', () => {
    expect(visibleFooterHeight(0, 800)).toBe(800);
    expect(visibleFooterHeight(-50, 800)).toBe(850);
  });
});

describe('computeFloatingBottomOffset', () => {
  it('keeps the base offset when the footer is not encroaching', () => {
    expect(computeFloatingBottomOffset(24, 0, 16)).toBe(24);
  });

  it('keeps the base offset while the footer + gap is still smaller than it', () => {
    expect(computeFloatingBottomOffset(24, 4, 16)).toBe(24);
  });

  it('rides above the footer once footer + gap exceeds the base offset', () => {
    expect(computeFloatingBottomOffset(24, 100, 16)).toBe(116);
  });

  it('tracks the footer smoothly as more of it becomes visible', () => {
    const first = computeFloatingBottomOffset(24, 100, 16);
    const second = computeFloatingBottomOffset(24, 300, 16);
    expect(second).toBeGreaterThan(first);
    expect(second).toBe(316);
  });
});
