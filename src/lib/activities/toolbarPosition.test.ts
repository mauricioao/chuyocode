import { describe, it, expect } from 'vitest';
import {
  DOCK_MARGIN,
  DOCK_SNAP_DISTANCE,
  ARROW_KEY_STEP,
  ARROW_KEY_STEP_SHIFT,
  clampToolbarPosition,
  dockTargetPosition,
  distance,
  shouldSnapToDock,
  keyboardStep,
  parsePersistedToolbarState,
} from './toolbarPosition';

describe('clampToolbarPosition', () => {
  const bounds = { left: 0, right: 1000, top: 100, bottom: 800 };
  const size = { width: 50, height: 200 };

  it('keeps an in-bounds position unchanged', () => {
    expect(clampToolbarPosition({ x: 500, y: 400 }, size, bounds)).toEqual({ x: 500, y: 400 });
  });

  it('clamps the left/top edges to the bounds', () => {
    expect(clampToolbarPosition({ x: -999, y: -999 }, size, bounds)).toEqual({ x: 0, y: 100 });
  });

  it('clamps the right/bottom edges so the toolbar box stays fully inside the bounds', () => {
    // right edge: bounds.right - size.width = 1000 - 50 = 950.
    // bottom edge: bounds.bottom - size.height = 800 - 200 = 600.
    expect(clampToolbarPosition({ x: 9999, y: 9999 }, size, bounds)).toEqual({ x: 950, y: 600 });
  });

  it('collapses to the bounds\' own top when the toolbar is TALLER than the available vertical space', () => {
    const tinyBounds = { left: 0, right: 1000, top: 100, bottom: 120 }; // only 20px tall, plenty wide
    // Horizontally there's still room (500 is a valid x in [0, 950]), so only
    // the y axis collapses to `bounds.top` rather than producing a negative range.
    expect(clampToolbarPosition({ x: 500, y: 500 }, size, tinyBounds)).toEqual({ x: 500, y: 100 });
  });
});

describe('dockTargetPosition', () => {
  it('sits at the right edge (minus the margin) vertically centered in the bounds', () => {
    const bounds = { left: 0, right: 1000, top: 100, bottom: 900 }; // 800 tall, centered at 500
    const size = { width: 50, height: 200 };
    const target = dockTargetPosition(size, bounds);
    expect(target.x).toBe(1000 - 50 - DOCK_MARGIN);
    expect(target.y).toBe(500 - 100); // (100+900)/2 - 200/2 = 500 - 100 = 400
  });
});

describe('distance / shouldSnapToDock', () => {
  it('computes plain Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('snaps within the default snap distance', () => {
    expect(shouldSnapToDock({ x: 10, y: 10 }, { x: 10, y: 10 + DOCK_SNAP_DISTANCE }, )).toBe(true);
  });

  it('does not snap past the default snap distance', () => {
    expect(shouldSnapToDock({ x: 10, y: 10 }, { x: 10, y: 10 + DOCK_SNAP_DISTANCE + 1 })).toBe(false);
  });

  it('accepts a custom snap distance', () => {
    expect(shouldSnapToDock({ x: 0, y: 0 }, { x: 5, y: 0 }, 10)).toBe(true);
    expect(shouldSnapToDock({ x: 0, y: 0 }, { x: 15, y: 0 }, 10)).toBe(false);
  });
});

describe('keyboardStep', () => {
  it('is ARROW_KEY_STEP unshifted', () => {
    expect(keyboardStep(false)).toBe(ARROW_KEY_STEP);
  });

  it('is ARROW_KEY_STEP_SHIFT with Shift held', () => {
    expect(keyboardStep(true)).toBe(ARROW_KEY_STEP_SHIFT);
  });
});

describe('parsePersistedToolbarState', () => {
  it('accepts a well-formed docked state', () => {
    expect(parsePersistedToolbarState({ docked: true, x: 0, y: 0 })).toEqual({ docked: true, x: 0, y: 0 });
  });

  it('accepts a well-formed undocked state', () => {
    expect(parsePersistedToolbarState({ docked: false, x: 120, y: 340 })).toEqual({ docked: false, x: 120, y: 340 });
  });

  it('defaults to docked for null/undefined', () => {
    expect(parsePersistedToolbarState(null)).toEqual({ docked: true, x: 0, y: 0 });
    expect(parsePersistedToolbarState(undefined)).toEqual({ docked: true, x: 0, y: 0 });
  });

  it('defaults to docked for a non-object value', () => {
    expect(parsePersistedToolbarState('nonsense')).toEqual({ docked: true, x: 0, y: 0 });
    expect(parsePersistedToolbarState(42)).toEqual({ docked: true, x: 0, y: 0 });
  });

  it('defaults to docked when a field is missing or the wrong type', () => {
    expect(parsePersistedToolbarState({ docked: true })).toEqual({ docked: true, x: 0, y: 0 });
    expect(parsePersistedToolbarState({ docked: false, x: '120', y: 340 })).toEqual({ docked: true, x: 0, y: 0 });
  });

  it('defaults to docked when x/y are non-finite', () => {
    expect(parsePersistedToolbarState({ docked: false, x: NaN, y: 0 })).toEqual({ docked: true, x: 0, y: 0 });
    expect(parsePersistedToolbarState({ docked: false, x: Infinity, y: 0 })).toEqual({ docked: true, x: 0, y: 0 });
  });
});
