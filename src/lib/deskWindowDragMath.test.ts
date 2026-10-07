import { describe, it, expect } from 'vitest';
import {
  clampWindowDragOffset,
  parseStoredWindowOffset,
  serializeWindowOffset,
  WINDOW_EDGE_MARGIN,
  type WindowRect,
} from './deskWindowDragMath';

const viewport = { width: 1440, height: 900 };
const headerBottom = 64;

/** The whole window's own rect sitting at its default position: inset 64px from the left, 76px from the top, 600px wide, 500px tall. */
const windowRect: WindowRect = { top: 76, left: 64, width: 600, height: 500 };

describe('clampWindowDragOffset', () => {
  it('leaves a small, in-bounds offset untouched', () => {
    expect(clampWindowDragOffset({ x: 20, y: 20 }, windowRect, viewport, headerBottom)).toEqual({ x: 20, y: 20 });
  });

  it('never lets the window go above the header bottom (traffic lights stay reachable)', () => {
    const result = clampWindowDragOffset({ x: 0, y: -500 }, windowRect, viewport, headerBottom);
    expect(windowRect.top + result.y).toBe(headerBottom);
  });

  it('never lets the window bottom edge go past the viewport bottom minus the edge margin', () => {
    const result = clampWindowDragOffset({ x: 0, y: 5000 }, windowRect, viewport, headerBottom);
    expect(windowRect.top + result.y + windowRect.height).toBe(viewport.height - WINDOW_EDGE_MARGIN);
  });

  it('never lets the window left edge go past the edge margin when dragged far left', () => {
    const result = clampWindowDragOffset({ x: -5000, y: 0 }, windowRect, viewport, headerBottom);
    expect(windowRect.left + result.x).toBe(WINDOW_EDGE_MARGIN);
  });

  it('never lets the window right edge go past the viewport width minus the edge margin when dragged far right', () => {
    const result = clampWindowDragOffset({ x: 5000, y: 0 }, windowRect, viewport, headerBottom);
    expect(windowRect.left + result.x + windowRect.width).toBe(viewport.width - WINDOW_EDGE_MARGIN);
  });

  it('honours a custom edge margin', () => {
    const result = clampWindowDragOffset({ x: -5000, y: 0 }, windowRect, viewport, headerBottom, 24);
    expect(windowRect.left + result.x).toBe(24);
  });

  it('prefers staying below the header over the viewport-bottom bound when both cannot hold (a tiny viewport)', () => {
    const tinyViewport = { width: 1440, height: 100 };
    const result = clampWindowDragOffset({ x: 0, y: 0 }, windowRect, tinyViewport, headerBottom);
    expect(windowRect.top + result.y).toBe(headerBottom);
  });

  it('is a no-op round trip at the exact bound (idempotent)', () => {
    const first = clampWindowDragOffset({ x: -5000, y: -5000 }, windowRect, viewport, headerBottom);
    const second = clampWindowDragOffset(first, windowRect, viewport, headerBottom);
    expect(second).toEqual(first);
  });

  it('keeps the whole window on screen even when dragged diagonally past every edge at once', () => {
    const result = clampWindowDragOffset({ x: -5000, y: 5000 }, windowRect, viewport, headerBottom);
    expect(windowRect.left + result.x).toBeGreaterThanOrEqual(WINDOW_EDGE_MARGIN);
    expect(windowRect.top + result.y).toBeGreaterThanOrEqual(headerBottom);
    expect(windowRect.left + result.x + windowRect.width).toBeLessThanOrEqual(viewport.width - WINDOW_EDGE_MARGIN);
    expect(windowRect.top + result.y + windowRect.height).toBeLessThanOrEqual(viewport.height - WINDOW_EDGE_MARGIN);
  });
});

describe('parseStoredWindowOffset', () => {
  it('returns null for null/empty input', () => {
    expect(parseStoredWindowOffset(null)).toBeNull();
    expect(parseStoredWindowOffset('')).toBeNull();
  });

  it('returns null for malformed JSON, never throws', () => {
    expect(() => parseStoredWindowOffset('not json')).not.toThrow();
    expect(parseStoredWindowOffset('not json')).toBeNull();
  });

  it('returns null for a well-formed but non-offset value', () => {
    expect(parseStoredWindowOffset(JSON.stringify({ x: 'nope', y: 1 }))).toBeNull();
    expect(parseStoredWindowOffset(JSON.stringify({ x: 1 }))).toBeNull();
    expect(parseStoredWindowOffset(JSON.stringify([1, 2]))).toBeNull();
  });

  it('round-trips a real offset', () => {
    const offset = { x: 12, y: -34 };
    expect(parseStoredWindowOffset(serializeWindowOffset(offset))).toEqual(offset);
  });
});
