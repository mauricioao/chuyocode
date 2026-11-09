import { describe, it, expect } from 'vitest';
import { DOCK_BAR_HEIGHTS, filledBarCount, levelTier, miniBarHeights } from './levelBars';

describe('levelBars — the desk dock geometry, shared with the level dropdown', () => {
  it('keeps the dock tile bar heights (DeskScene.astro), ascending, one per CEFR level', () => {
    expect(DOCK_BAR_HEIGHTS).toEqual([7, 11, 15, 19, 23, 27]);
  });

  it('fills one bar per level step: A1 one … C2 six, and none for "no level"', () => {
    expect(filledBarCount('A1')).toBe(1);
    expect(filledBarCount('A2')).toBe(2);
    expect(filledBarCount('B1')).toBe(3);
    expect(filledBarCount('B2')).toBe(4);
    expect(filledBarCount('C1')).toBe(5);
    expect(filledBarCount('C2')).toBe(6);
    expect(filledBarCount(null)).toBe(0);
  });

  it('maps each level onto its tier letter (Básico A, Intermedio B, Avanzado C)', () => {
    expect(levelTier('A2')).toBe('A');
    expect(levelTier('B1')).toBe('B');
    expect(levelTier('C2')).toBe('C');
  });

  it('scales the dock heights so the tallest bar is exactly the icon height, keeping their proportions', () => {
    const heights = miniBarHeights(16);
    expect(heights).toHaveLength(6);
    expect(heights[5]).toBe(16);
    expect(heights[0]).toBeCloseTo((7 / 27) * 16, 5);
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]!);
    }
  });
});
