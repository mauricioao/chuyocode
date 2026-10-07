import { describe, expect, it } from 'vitest';
import { boxesIntersect, type Box } from './deskHelperCollision';

function box(left: number, top: number, right: number, bottom: number): Box {
  return { left, top, right, bottom };
}

describe('boxesIntersect', () => {
  it('is true when one box fully contains the other', () => {
    expect(boxesIntersect(box(0, 0, 100, 100), box(10, 10, 20, 20))).toBe(true);
  });

  it('is true when the boxes partially overlap', () => {
    expect(boxesIntersect(box(0, 0, 50, 50), box(25, 25, 75, 75))).toBe(true);
  });

  it('is false when the boxes are side by side with a gap', () => {
    expect(boxesIntersect(box(0, 0, 50, 50), box(60, 0, 100, 50))).toBe(false);
  });

  it('is false when the boxes are stacked with a gap', () => {
    expect(boxesIntersect(box(0, 0, 50, 50), box(0, 60, 50, 100))).toBe(false);
  });

  it('is false when the boxes merely touch at an edge (no actual overlap area)', () => {
    expect(boxesIntersect(box(0, 0, 50, 50), box(50, 0, 100, 50))).toBe(false);
    expect(boxesIntersect(box(0, 0, 50, 50), box(0, 50, 50, 100))).toBe(false);
  });

  it('is symmetric: order of arguments never changes the result', () => {
    const a = box(10, 10, 60, 60);
    const b = box(40, 40, 90, 90);
    expect(boxesIntersect(a, b)).toBe(boxesIntersect(b, a));
  });

  it('is false for a degenerate (zero-size) box against anything', () => {
    expect(boxesIntersect(box(10, 10, 10, 10), box(0, 0, 100, 100))).toBe(false);
  });
});
