import { describe, it, expect } from 'vitest';
import {
  clampWindowDragOffset,
  parseStoredWindowOffset,
  serializeWindowOffset,
  MIN_VISIBLE_TITLEBAR_WIDTH,
  type TitlebarRect,
} from './deskWindowDragMath';

const viewport = { width: 1440, height: 900 };
const headerBottom = 64;

/** A titlebar sitting at its default position: inset 64px from the left, 76px from the top, 600px wide, 56px tall. */
const titlebar: TitlebarRect = { top: 76, left: 64, width: 600, height: 56 };

describe('clampWindowDragOffset', () => {
  it('leaves a small, in-bounds offset untouched', () => {
    expect(clampWindowDragOffset({ x: 20, y: 20 }, titlebar, viewport, headerBottom)).toEqual({ x: 20, y: 20 });
  });

  it('never lets the title bar go above the header bottom', () => {
    const result = clampWindowDragOffset({ x: 0, y: -500 }, titlebar, viewport, headerBottom);
    expect(titlebar.top + result.y).toBe(headerBottom);
  });

  it('never lets the title bar go past the viewport bottom', () => {
    const result = clampWindowDragOffset({ x: 0, y: 5000 }, titlebar, viewport, headerBottom);
    expect(titlebar.top + result.y + titlebar.height).toBe(viewport.height);
  });

  it('keeps at least MIN_VISIBLE_TITLEBAR_WIDTH visible when dragged far left', () => {
    const result = clampWindowDragOffset({ x: -5000, y: 0 }, titlebar, viewport, headerBottom);
    const visibleRight = titlebar.left + result.x + titlebar.width;
    expect(visibleRight).toBe(MIN_VISIBLE_TITLEBAR_WIDTH);
  });

  it('keeps at least MIN_VISIBLE_TITLEBAR_WIDTH visible when dragged far right', () => {
    const result = clampWindowDragOffset({ x: 5000, y: 0 }, titlebar, viewport, headerBottom);
    const visibleLeft = titlebar.left + result.x;
    expect(visibleLeft).toBe(viewport.width - MIN_VISIBLE_TITLEBAR_WIDTH);
  });

  it('honours a custom minVisibleWidth', () => {
    const result = clampWindowDragOffset({ x: -5000, y: 0 }, titlebar, viewport, headerBottom, 80);
    const visibleRight = titlebar.left + result.x + titlebar.width;
    expect(visibleRight).toBe(80);
  });

  it('prefers staying below the header over the viewport-bottom bound when both cannot hold (a tiny viewport)', () => {
    const tinyViewport = { width: 1440, height: 100 };
    const result = clampWindowDragOffset({ x: 0, y: 0 }, titlebar, tinyViewport, headerBottom);
    expect(titlebar.top + result.y).toBe(headerBottom);
  });

  it('is a no-op round trip at the exact bound (idempotent)', () => {
    const first = clampWindowDragOffset({ x: -5000, y: -5000 }, titlebar, viewport, headerBottom);
    const second = clampWindowDragOffset(first, titlebar, viewport, headerBottom);
    expect(second).toEqual(first);
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
