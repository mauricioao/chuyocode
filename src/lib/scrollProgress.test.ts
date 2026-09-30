import { describe, it, expect } from 'vitest';
import { computeScrollProgress, ringDashOffset } from './scrollProgress';

describe('computeScrollProgress', () => {
  it('is 0 at the top of the scroll range', () => {
    expect(computeScrollProgress(0, 800, 2400)).toBe(0);
  });

  it('is 100 at the bottom of the scroll range', () => {
    expect(computeScrollProgress(1600, 800, 2400)).toBe(100);
  });

  it('is proportional in between', () => {
    expect(computeScrollProgress(800, 800, 2400)).toBe(50);
  });

  it('clamps to 100 for an overscroll past the bottom', () => {
    expect(computeScrollProgress(5000, 800, 2400)).toBe(100);
  });

  it('is 0 when the content does not overflow the viewport (no scroll range)', () => {
    expect(computeScrollProgress(0, 800, 400)).toBe(0);
  });

  it('never divides by zero when viewport equals full height', () => {
    expect(computeScrollProgress(0, 800, 800)).toBe(0);
  });
});

describe('ringDashOffset', () => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;

  it('is the full circumference at 0% (ring appears empty)', () => {
    expect(ringDashOffset(0, radius)).toBeCloseTo(circumference);
  });

  it('is 0 at 100% (ring appears fully filled)', () => {
    expect(ringDashOffset(100, radius)).toBeCloseTo(0);
  });

  it('is half the circumference at 50%', () => {
    expect(ringDashOffset(50, radius)).toBeCloseTo(circumference / 2);
  });
});
