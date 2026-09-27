/**
 * Pure geometry helpers for drawing/moving/resizing a worksheet {@link
 * Zone} (PR B, "Activities creator"). Zero I/O, zero DOM: every function
 * here takes and returns plain fractional rectangles in `[0, 1]` — the exact
 * shape `src/lib/activities/blocks.ts`'s `parseZone` accepts — so the editor
 * component's only job is translating pointer/keyboard events into calls
 * here, never doing the clamping math itself.
 *
 * MIN_ZONE_SIZE is enforced EVERYWHERE a rect's size could shrink (a drag, a
 * resize): a zone smaller than this is too small to tap on a phone and too
 * small to draw an input inside, so nothing in this module ever produces
 * one, regardless of how the pointer moved.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest a zone's `w`/`h` may ever be, as a fraction of the image. */
export const MIN_ZONE_SIZE = 0.02;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Clamp a rect so it stays fully inside `[0, 1]` on both axes and never
 * shrinks below {@link MIN_ZONE_SIZE}. `w`/`h` are clamped first (so a
 * requested size above 1 collapses to at most 1), then `x`/`y` are clamped
 * so `x + w <= 1` and `y + h <= 1` — exactly `parseZone`'s own rule.
 */
export function clampRect(rect: Rect): Rect {
  const w = Math.min(1, Math.max(MIN_ZONE_SIZE, Number.isFinite(rect.w) ? rect.w : MIN_ZONE_SIZE));
  const h = Math.min(1, Math.max(MIN_ZONE_SIZE, Number.isFinite(rect.h) ? rect.h : MIN_ZONE_SIZE));
  const x = Math.min(1 - w, Math.max(0, Number.isFinite(rect.x) ? rect.x : 0));
  const y = Math.min(1 - h, Math.max(0, Number.isFinite(rect.y) ? rect.y : 0));
  return { x, y, w, h };
}

export interface Point {
  x: number;
  y: number;
}

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Build a normalized, clamped rect from a pointer drag between two points
 * given in the CONTAINER'S OWN pixel space (i.e. already offset against its
 * bounding box) — the caller subtracts `getBoundingClientRect()`'s
 * `left`/`top` before calling this; this function does no DOM work at all.
 *
 * The two points may arrive in ANY order (a drag can go in any of the four
 * directions), so the rect is normalized (`min`/`max`) before it is turned
 * into fractions of `container`.
 *
 * `container` with a non-positive dimension returns the smallest legal rect
 * anchored at the origin — never a `NaN`/`Infinity` rect from a
 * not-yet-laid-out image.
 */
export function rectFromDrag(a: Point, b: Point, container: ContainerSize): Rect {
  if (container.width <= 0 || container.height <= 0) {
    return clampRect({ x: 0, y: 0, w: MIN_ZONE_SIZE, h: MIN_ZONE_SIZE });
  }

  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);

  return clampRect({
    x: left / container.width,
    y: top / container.height,
    w: (right - left) / container.width,
    h: (bottom - top) / container.height,
  });
}

/**
 * Translate a rect by a fractional `(dx, dy)`, keeping its size fixed and
 * clamping so it never leaves `[0, 1]` — used for both a pointer-drag move
 * of an already-drawn zone and an arrow-key nudge ({@link nudgeRect}).
 *
 * Clamping happens on the TRANSLATED POSITION, with the ORIGINAL size —
 * `clampRect` alone would be wrong here for a large zone near an edge: it
 * would shrink `w`/`h` to fit rather than sliding `x`/`y` back, which reads
 * as the zone resizing itself on a plain move.
 */
export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  const w = Math.min(1, Math.max(MIN_ZONE_SIZE, rect.w));
  const h = Math.min(1, Math.max(MIN_ZONE_SIZE, rect.h));
  const x = Math.min(1 - w, Math.max(0, clampUnit(rect.x + dx)));
  const y = Math.min(1 - h, Math.max(0, clampUnit(rect.y + dy)));
  return { x, y, w, h };
}

/** Which corner handle a resize drag grabbed. */
export type Handle = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Resize a rect by dragging one corner `handle` by a fractional `(dx, dy)`,
 * keeping the OPPOSITE corner fixed.
 *
 * The moving edge is clamped to `[0, 1]`, then to at least {@link
 * MIN_ZONE_SIZE} away from the FIXED opposite edge — dragging a handle past
 * its opposite corner (or off the image) shrinks the rect down to the
 * minimum size rather than flipping it inside out, which would silently
 * swap which corner the caller is still dragging. Assumes `rect` already
 * satisfies the `w, h >= MIN_ZONE_SIZE` / `x + w, y + h <= 1` invariant
 * (true of every rect this module hands back), so the fixed edge is never
 * itself pushed out of `[0, 1]` by the minimum-size adjustment below.
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number): Rect {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle === 'nw' || handle === 'sw') {
    nextLeft = clampUnit(left + dx);
    nextLeft = Math.min(nextLeft, right - MIN_ZONE_SIZE);
  } else {
    nextRight = clampUnit(right + dx);
    nextRight = Math.max(nextRight, left + MIN_ZONE_SIZE);
  }

  if (handle === 'nw' || handle === 'ne') {
    nextTop = clampUnit(top + dy);
    nextTop = Math.min(nextTop, bottom - MIN_ZONE_SIZE);
  } else {
    nextBottom = clampUnit(bottom + dy);
    nextBottom = Math.max(nextBottom, top + MIN_ZONE_SIZE);
  }

  return {
    x: nextLeft,
    y: nextTop,
    w: nextRight - nextLeft,
    h: nextBottom - nextTop,
  };
}

/** A single arrow-key nudge step, as a fraction of the image. */
export const NUDGE_STEP = 0.01;

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Move a rect one keyboard nudge in `direction`, clamped like any other move. */
export function nudgeRect(rect: Rect, direction: Direction, step: number = NUDGE_STEP): Rect {
  switch (direction) {
    case 'up':
      return moveRect(rect, 0, -step);
    case 'down':
      return moveRect(rect, 0, step);
    case 'left':
      return moveRect(rect, -step, 0);
    case 'right':
      return moveRect(rect, step, 0);
    default:
      return rect;
  }
}
