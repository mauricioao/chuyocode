import { describe, it, expect } from 'vitest';
import {
  MIN_ZONE_SIZE,
  NUDGE_STEP,
  KEYBOARD_ZONE_SIZE,
  clampRect,
  rectFromDrag,
  moveRect,
  resizeRect,
  nudgeRect,
  centeredZoneRect,
  rotateRectCW,
  rotateRectCCW,
  rotateRects,
  turnRotation,
  orderZonesForReading,
  type Rect,
} from './zoneGeometry';

describe('clampRect', () => {
  it('passes an already-valid rect through unchanged', () => {
    expect(clampRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  it('clamps a negative x/y to 0', () => {
    expect(clampRect({ x: -0.5, y: -1, w: 0.2, h: 0.2 })).toEqual({ x: 0, y: 0, w: 0.2, h: 0.2 });
  });

  it('clamps x so x + w never exceeds 1', () => {
    const rect = clampRect({ x: 0.9, y: 0, w: 0.3, h: 0.1 });
    expect(rect.x + rect.w).toBeCloseTo(1);
  });

  it('clamps y so y + h never exceeds 1', () => {
    const rect = clampRect({ x: 0, y: 0.9, w: 0.1, h: 0.3 });
    expect(rect.y + rect.h).toBeCloseTo(1);
  });

  it('enforces the minimum size on w and h', () => {
    expect(clampRect({ x: 0, y: 0, w: 0.001, h: 0.001 })).toEqual({
      x: 0,
      y: 0,
      w: MIN_ZONE_SIZE,
      h: MIN_ZONE_SIZE,
    });
  });

  it('caps w/h at 1', () => {
    expect(clampRect({ x: 0, y: 0, w: 5, h: 5 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('never returns NaN/Infinity for non-finite input', () => {
    const rect = clampRect({ x: NaN, y: Infinity, w: -Infinity, h: NaN });
    expect(Number.isFinite(rect.x)).toBe(true);
    expect(Number.isFinite(rect.y)).toBe(true);
    expect(Number.isFinite(rect.w)).toBe(true);
    expect(Number.isFinite(rect.h)).toBe(true);
  });
});

describe('rectFromDrag', () => {
  const container = { width: 200, height: 100 };

  it('builds a fractional rect from a top-left to bottom-right drag', () => {
    const rect = rectFromDrag({ x: 20, y: 10 }, { x: 60, y: 50 }, container);
    expect(rect).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.4 });
  });

  it('normalizes a drag going the opposite direction (bottom-right to top-left)', () => {
    const forward = rectFromDrag({ x: 20, y: 10 }, { x: 60, y: 50 }, container);
    const backward = rectFromDrag({ x: 60, y: 50 }, { x: 20, y: 10 }, container);
    expect(backward).toEqual(forward);
  });

  it('normalizes a drag going top-right to bottom-left', () => {
    const rect = rectFromDrag({ x: 60, y: 10 }, { x: 20, y: 50 }, container);
    expect(rect).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.4 });
  });

  it('enforces the minimum size for a near-zero drag', () => {
    const rect = rectFromDrag({ x: 5, y: 5 }, { x: 5, y: 5 }, container);
    expect(rect.w).toBe(MIN_ZONE_SIZE);
    expect(rect.h).toBe(MIN_ZONE_SIZE);
  });

  it('clamps a drag that starts or ends outside the container', () => {
    const rect = rectFromDrag({ x: -50, y: -50 }, { x: 250, y: 150 }, container);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1.0001);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1.0001);
  });

  it('returns the minimum legal rect when the container has no size yet', () => {
    const rect = rectFromDrag({ x: 20, y: 10 }, { x: 60, y: 50 }, { width: 0, height: 0 });
    expect(rect).toEqual({ x: 0, y: 0, w: MIN_ZONE_SIZE, h: MIN_ZONE_SIZE });
  });
});

describe('moveRect', () => {
  const base = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

  it('translates by a fractional delta, keeping size fixed', () => {
    const moved = moveRect(base, 0.1, -0.1);
    expect(moved.x).toBeCloseTo(0.5);
    expect(moved.y).toBeCloseTo(0.3);
    expect(moved.w).toBe(0.2);
    expect(moved.h).toBe(0.2);
  });

  it('clamps so the rect never crosses the left/top edge', () => {
    const moved = moveRect(base, -1, -1);
    expect(moved).toEqual({ x: 0, y: 0, w: 0.2, h: 0.2 });
  });

  it('clamps so the rect never crosses the right/bottom edge', () => {
    const moved = moveRect(base, 1, 1);
    expect(moved.x + moved.w).toBeCloseTo(1);
    expect(moved.y + moved.h).toBeCloseTo(1);
  });

  it('never shrinks the rect while clamping a move (unlike a bare clampRect)', () => {
    const nearEdge = { x: 0.95, y: 0.95, w: 0.2, h: 0.2 };
    const moved = moveRect(nearEdge, 0, 0);
    expect(moved.w).toBe(0.2);
    expect(moved.h).toBe(0.2);
  });
});

describe('resizeRect', () => {
  const base = { x: 0.3, y: 0.3, w: 0.2, h: 0.2 }; // right edge 0.5, bottom edge 0.5

  it('se handle grows the rect toward the bottom-right, keeping the top-left fixed', () => {
    const resized = resizeRect(base, 'se', 0.1, 0.1);
    expect(resized).toEqual({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
  });

  it('nw handle grows the rect toward the top-left, keeping the bottom-right fixed', () => {
    const resized = resizeRect(base, 'nw', -0.1, -0.1);
    expect(resized.x).toBeCloseTo(0.2);
    expect(resized.y).toBeCloseTo(0.2);
    expect(resized.w).toBeCloseTo(0.3);
    expect(resized.h).toBeCloseTo(0.3);
    // The opposite (bottom-right) corner stays put.
    expect(resized.x + resized.w).toBeCloseTo(0.5);
    expect(resized.y + resized.h).toBeCloseTo(0.5);
  });

  it('ne handle only moves the top-right corner', () => {
    const resized = resizeRect(base, 'ne', 0.1, -0.1);
    // Left edge and bottom edge stay fixed.
    expect(resized.x).toBeCloseTo(0.3);
    expect(resized.y + resized.h).toBeCloseTo(0.5);
    expect(resized.x + resized.w).toBeCloseTo(0.6);
    expect(resized.y).toBeCloseTo(0.2);
  });

  it('sw handle only moves the bottom-left corner', () => {
    const resized = resizeRect(base, 'sw', -0.1, 0.1);
    expect(resized.y).toBeCloseTo(0.3);
    expect(resized.x + resized.w).toBeCloseTo(0.5);
    expect(resized.x).toBeCloseTo(0.2);
    expect(resized.y + resized.h).toBeCloseTo(0.6);
  });

  it('never flips the rect inside out when a handle is dragged past its opposite corner', () => {
    const resized = resizeRect(base, 'se', -10, -10);
    expect(resized.w).toBeGreaterThanOrEqual(MIN_ZONE_SIZE);
    expect(resized.h).toBeGreaterThanOrEqual(MIN_ZONE_SIZE);
    expect(resized.x).toBeLessThanOrEqual(0.5);
    expect(resized.y).toBeLessThanOrEqual(0.5);
  });

  it('clamps a resize that would push the rect off the image', () => {
    const nearEdge = { x: 0.8, y: 0.8, w: 0.1, h: 0.1 };
    const resized = resizeRect(nearEdge, 'se', 1, 1);
    expect(resized.x + resized.w).toBeLessThanOrEqual(1.0001);
    expect(resized.y + resized.h).toBeLessThanOrEqual(1.0001);
  });

  it('enforces the minimum size on a shrinking resize', () => {
    const resized = resizeRect(base, 'se', -1, -1);
    expect(resized.w).toBeCloseTo(MIN_ZONE_SIZE);
    expect(resized.h).toBeCloseTo(MIN_ZONE_SIZE);
  });
});

describe('nudgeRect', () => {
  const base = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };

  it('moves up by the default step', () => {
    expect(nudgeRect(base, 'up')).toEqual({ x: 0.5, y: 0.5 - NUDGE_STEP, w: 0.1, h: 0.1 });
  });

  it('moves down by the default step', () => {
    expect(nudgeRect(base, 'down')).toEqual({ x: 0.5, y: 0.5 + NUDGE_STEP, w: 0.1, h: 0.1 });
  });

  it('moves left by the default step', () => {
    expect(nudgeRect(base, 'left')).toEqual({ x: 0.5 - NUDGE_STEP, y: 0.5, w: 0.1, h: 0.1 });
  });

  it('moves right by the default step', () => {
    expect(nudgeRect(base, 'right')).toEqual({ x: 0.5 + NUDGE_STEP, y: 0.5, w: 0.1, h: 0.1 });
  });

  it('accepts a custom step', () => {
    expect(nudgeRect(base, 'right', 0.25)).toEqual({ x: 0.75, y: 0.5, w: 0.1, h: 0.1 });
  });

  it('clamps at the edges just like moveRect', () => {
    const atEdge = { x: 0, y: 0, w: 0.1, h: 0.1 };
    expect(nudgeRect(atEdge, 'up')).toEqual(atEdge);
    expect(nudgeRect(atEdge, 'left')).toEqual(atEdge);
  });
});

describe('rotateRectCW / rotateRectCCW (worksheet rotation)', () => {
  it('sends the top-left corner to the top-right on a clockwise turn', () => {
    // A small rect pinned at the image's own top-left corner.
    const rect: Rect = { x: 0, y: 0, w: 0.1, h: 0.2 };
    expect(rotateRectCW(rect)).toEqual({ x: 0.8, y: 0, w: 0.2, h: 0.1 });
  });

  it('sends the top-left corner to the bottom-left on a counter-clockwise turn', () => {
    const rect: Rect = { x: 0, y: 0, w: 0.1, h: 0.2 };
    expect(rotateRectCCW(rect)).toEqual({ x: 0, y: 0.9, w: 0.2, h: 0.1 });
  });

  it('CCW is the exact inverse of CW', () => {
    const rect: Rect = { x: 0.15, y: 0.35, w: 0.2, h: 0.1 };
    const roundTrip = rotateRectCCW(rotateRectCW(rect));
    expect(roundTrip.x).toBeCloseTo(rect.x);
    expect(roundTrip.y).toBeCloseTo(rect.y);
    expect(roundTrip.w).toBeCloseTo(rect.w);
    expect(roundTrip.h).toBeCloseTo(rect.h);
  });

  it('four clockwise turns return to the original rect', () => {
    const rect: Rect = { x: 0.15, y: 0.35, w: 0.2, h: 0.1 };
    const full = rotateRectCW(rotateRectCW(rotateRectCW(rotateRectCW(rect))));
    expect(full.x).toBeCloseTo(rect.x);
    expect(full.y).toBeCloseTo(rect.y);
    expect(full.w).toBeCloseTo(rect.w);
    expect(full.h).toBeCloseTo(rect.h);
  });

  it('keeps a centered square rect centered', () => {
    const rect: Rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    const result = rotateRectCW(rect);
    expect(result.x).toBeCloseTo(0.4);
    expect(result.y).toBeCloseTo(0.4);
    expect(result.w).toBeCloseTo(0.2);
    expect(result.h).toBeCloseTo(0.2);
  });
});

describe('rotateRects', () => {
  it('rotates every rect in a list, preserving non-geometry fields', () => {
    const zones = [
      { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.2, kind: 'text' as const, answers: ['cat'] },
      { id: 'z2', x: 0.5, y: 0.5, w: 0.1, h: 0.1, kind: 'choice' as const, answers: ['a'], options: ['a', 'b'] },
    ];
    const rotated = rotateRects(zones, 'cw');
    expect(rotated[0]).toEqual({ id: 'z1', x: 0.8, y: 0, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] });
    expect(rotated[1].id).toBe('z2');
    expect(rotated[1].options).toEqual(['a', 'b']);
  });

  it('returns an empty array unchanged', () => {
    expect(rotateRects([], 'cw')).toEqual([]);
  });
});

describe('turnRotation', () => {
  it('adds 90 clockwise, wrapping past 270 back to 0', () => {
    expect(turnRotation(0, 'cw')).toBe(90);
    expect(turnRotation(90, 'cw')).toBe(180);
    expect(turnRotation(180, 'cw')).toBe(270);
    expect(turnRotation(270, 'cw')).toBe(0);
  });

  it('subtracts 90 counter-clockwise, wrapping past 0 back to 270', () => {
    expect(turnRotation(0, 'ccw')).toBe(270);
    expect(turnRotation(90, 'ccw')).toBe(0);
    expect(turnRotation(180, 'ccw')).toBe(90);
    expect(turnRotation(270, 'ccw')).toBe(180);
  });
});

describe('centeredZoneRect (keyboard zone creation)', () => {
  it('centers a default-size rect inside the visible rect', () => {
    const visible: Rect = { x: 0, y: 0, w: 1, h: 1 };
    const rect = centeredZoneRect(visible);
    expect(rect.w).toBeCloseTo(KEYBOARD_ZONE_SIZE.w);
    expect(rect.h).toBeCloseTo(KEYBOARD_ZONE_SIZE.h);
    expect(rect.x).toBeCloseTo(0.5 - KEYBOARD_ZONE_SIZE.w / 2);
    expect(rect.y).toBeCloseTo(0.5 - KEYBOARD_ZONE_SIZE.h / 2);
  });

  it('centers inside an off-center, partial visible rect (zoomed/panned view)', () => {
    const visible: Rect = { x: 0.4, y: 0.2, w: 0.3, h: 0.2 };
    const rect = centeredZoneRect(visible);
    expect(rect.x).toBeCloseTo(0.4 + 0.15 - KEYBOARD_ZONE_SIZE.w / 2);
    expect(rect.y).toBeCloseTo(0.2 + 0.1 - KEYBOARD_ZONE_SIZE.h / 2);
  });

  it('accepts a custom size', () => {
    const visible: Rect = { x: 0, y: 0, w: 1, h: 1 };
    const rect = centeredZoneRect(visible, { w: 0.1, h: 0.1 });
    expect(rect.w).toBeCloseTo(0.1);
    expect(rect.h).toBeCloseTo(0.1);
  });

  it('clamps inside [0, 1] when the visible rect sits at an edge', () => {
    const visible: Rect = { x: 0, y: 0, w: 0.05, h: 0.05 };
    const rect = centeredZoneRect(visible);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1);
  });

  it('never produces a rect smaller than MIN_ZONE_SIZE, even with a tiny custom size', () => {
    const visible: Rect = { x: 0, y: 0, w: 1, h: 1 };
    const rect = centeredZoneRect(visible, { w: 0.001, h: 0.001 });
    expect(rect.w).toBeGreaterThanOrEqual(MIN_ZONE_SIZE);
    expect(rect.h).toBeGreaterThanOrEqual(MIN_ZONE_SIZE);
  });
});

describe('orderZonesForReading (top-to-bottom, left-to-right — the practice page mobile sheet order)', () => {
  function zone(id: string, x: number, y: number): Rect & { id: string } {
    return { id, x, y, w: 0.1, h: 0.05 };
  }

  it('sorts a clean grid top-to-bottom, then left-to-right within each row', () => {
    const zones = [zone('c', 0.6, 0.5), zone('a', 0.1, 0.1), zone('b', 0.5, 0.1), zone('d', 0.1, 0.5)];
    expect(orderZonesForReading(zones).map((z) => z.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('groups zones within the row tolerance even with small hand-drawn drift', () => {
    const zones = [zone('right', 0.6, 0.101), zone('left', 0.1, 0.1)];
    expect(orderZonesForReading(zones).map((z) => z.id)).toEqual(['left', 'right']);
  });

  it('starts a new row once the top drifts past the tolerance', () => {
    const zones = [zone('below', 0.1, 0.2), zone('above', 0.1, 0.1)];
    expect(orderZonesForReading(zones).map((z) => z.id)).toEqual(['above', 'below']);
  });

  it('does not mutate the input array', () => {
    const zones = [zone('b', 0.5, 0.1), zone('a', 0.1, 0.1)];
    const copy = [...zones];
    orderZonesForReading(zones);
    expect(zones).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(orderZonesForReading([])).toEqual([]);
  });
});
