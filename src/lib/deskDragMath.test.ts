import { describe, it, expect } from 'vitest';
import {
  clampPosition,
  parseStoredPositions,
  serializePositions,
  nudgePosition,
  isArrowKey,
  ARROW_STEP_PX,
  ARROW_STEP_SHIFT_PX,
} from './deskDragMath';

describe('clampPosition', () => {
  const widget = { w: 160, h: 160 };
  const desk = { w: 1200, h: 800 };

  it('keeps an in-bounds position unchanged', () => {
    expect(clampPosition({ x: 100, y: 200 }, widget, desk)).toEqual({ x: 100, y: 200 });
  });

  it('clamps a negative position to 0,0', () => {
    expect(clampPosition({ x: -50, y: -20 }, widget, desk)).toEqual({ x: 0, y: 0 });
  });

  it('clamps past the right/bottom edge to keep the widget fully inside', () => {
    expect(clampPosition({ x: 5000, y: 5000 }, widget, desk)).toEqual({
      x: desk.w - widget.w,
      y: desk.h - widget.h,
    });
  });

  it('clamps to 0 when the desk is smaller than the widget, rather than going negative', () => {
    expect(clampPosition({ x: 10, y: 10 }, { w: 400, h: 400 }, { w: 100, h: 100 })).toEqual({ x: 0, y: 0 });
  });
});

describe('parseStoredPositions', () => {
  it('returns {} for null, empty, or invalid JSON', () => {
    expect(parseStoredPositions(null)).toEqual({});
    expect(parseStoredPositions('')).toEqual({});
    expect(parseStoredPositions('{not json')).toEqual({});
  });

  it('returns {} for a parsed non-object (array, number, string)', () => {
    expect(parseStoredPositions('[1,2,3]')).toEqual({});
    expect(parseStoredPositions('42')).toEqual({});
    expect(parseStoredPositions('"hello"')).toEqual({});
  });

  it('round-trips a valid map through serializePositions', () => {
    const positions = { clock: { x: 10, y: 20 }, weather: { x: 0, y: 340 } };
    expect(parseStoredPositions(serializePositions(positions))).toEqual(positions);
  });

  it('drops an entry whose value is not a valid { x, y } pair, keeping the rest', () => {
    const raw = JSON.stringify({
      clock: { x: 10, y: 20 },
      broken: { x: 'nope', y: 5 },
      alsoBroken: 'not an object',
      nullish: null,
    });
    expect(parseStoredPositions(raw)).toEqual({ clock: { x: 10, y: 20 } });
  });
});

describe('isArrowKey', () => {
  it('accepts the four arrow keys and rejects everything else', () => {
    expect(isArrowKey('ArrowUp')).toBe(true);
    expect(isArrowKey('ArrowDown')).toBe(true);
    expect(isArrowKey('ArrowLeft')).toBe(true);
    expect(isArrowKey('ArrowRight')).toBe(true);
    expect(isArrowKey('Escape')).toBe(false);
    expect(isArrowKey('a')).toBe(false);
  });
});

describe('nudgePosition', () => {
  const pos = { x: 100, y: 100 };

  it('moves by ARROW_STEP_PX per arrow key direction', () => {
    expect(nudgePosition(pos, 'ArrowUp', false)).toEqual({ x: 100, y: 100 - ARROW_STEP_PX });
    expect(nudgePosition(pos, 'ArrowDown', false)).toEqual({ x: 100, y: 100 + ARROW_STEP_PX });
    expect(nudgePosition(pos, 'ArrowLeft', false)).toEqual({ x: 100 - ARROW_STEP_PX, y: 100 });
    expect(nudgePosition(pos, 'ArrowRight', false)).toEqual({ x: 100 + ARROW_STEP_PX, y: 100 });
  });

  it('moves by ARROW_STEP_SHIFT_PX when big (Shift+arrow)', () => {
    expect(nudgePosition(pos, 'ArrowRight', true)).toEqual({ x: 100 + ARROW_STEP_SHIFT_PX, y: 100 });
  });
});
