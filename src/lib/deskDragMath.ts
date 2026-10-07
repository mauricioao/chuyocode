/**
 * deskDragMath — the pure position math behind the desk hub's draggable
 * widgets ("desktop" redesign PART 4, desktop-only — approved mockup's own
 * `.desk.free .widget` drag behaviour). Kept separate from `@lib/ui/deskDrag`
 * (the DOM wiring: pointer events, `localStorage`, keyboard focus) so the
 * actual arithmetic — clamping a widget inside the desk, parsing/
 * serializing the persisted position map, and nudging a position by one
 * arrow-key step — is unit-testable without a browser.
 *
 * STORAGE KEY uses the widget's own stable `data-desk-widget` value
 * ("clock"/"calendar"/"player"/"weather") rather than its translated
 * `aria-label` text, which the approved mockup's own script used as its
 * storage key. That is a deliberate improvement over the mockup: an
 * `aria-label`-keyed position would silently stop matching the moment a
 * visitor switches the site's language (`es`/`en` labels differ), losing
 * every saved position. A fixed English id never changes with the locale.
 */

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** `localStorage` key for the persisted `{ widgetId: Position }` map. */
export const DESK_DRAG_STORAGE_KEY = 'ingles-desk-widgets';

/** Arrow-key nudge, in CSS pixels. */
export const ARROW_STEP_PX = 16;

/** Shift+arrow nudge, in CSS pixels. */
export const ARROW_STEP_SHIFT_PX = 64;

/** Minimum gap (px) kept between a dragged widget's own top edge and the desk's own top edge — "desktop" redesign (owner spec 2026-10-07): the desk no longer sits below a header, so a widget can be dragged all the way to the top of the screen, same small edge margin the floating desk window uses (`@lib/deskWindowDragMath#WINDOW_EDGE_MARGIN`). */
export const WIDGET_TOP_MARGIN_PX = 8;

/**
 * Keeps a widget fully inside the desk's own bounds. The left/right/bottom
 * edges stay flush with `0`/the desk's own far edge (unchanged); `topMargin`
 * only affects the TOP bound — defaults to `0` (every existing caller/test),
 * the desk hub passes {@link WIDGET_TOP_MARGIN_PX} instead. When the desk is
 * narrower/shorter than the widget itself (a transient layout moment, or a
 * saved position from a wider screen), clamps to the top-left corner
 * (`0`/`topMargin`) rather than producing a negative size that would push
 * the widget further out of view.
 */
export function clampPosition(pos: Position, widget: Size, desk: Size, topMargin: number = 0): Position {
  const maxX = Math.max(0, desk.w - widget.w);
  const maxY = Math.max(topMargin, desk.h - widget.h);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(topMargin, pos.y), maxY),
  };
}

function isPosition(value: unknown): value is Position {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Position).x === 'number' &&
    Number.isFinite((value as Position).x) &&
    typeof (value as Position).y === 'number' &&
    Number.isFinite((value as Position).y)
  );
}

/**
 * Parses a persisted position map, tolerating anything a hand-edited or
 * stale/corrupted `localStorage` value could contain: invalid JSON, a
 * non-object, or an entry that is not itself `{ x, y }` with finite
 * numbers. Never throws — the caller's own `try/catch` around the
 * `localStorage.getItem` call is what this function assumes already
 * happened; this is purely the "is the parsed shape trustworthy" half.
 */
export function parseStoredPositions(raw: string | null): Record<string, Position> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};

  const result: Record<string, Position> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (isPosition(value)) result[key] = { x: value.x, y: value.y };
  }
  return result;
}

export function serializePositions(positions: Record<string, Position>): string {
  return JSON.stringify(positions);
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** `true` for the four keys {@link nudgePosition} understands — lets the DOM wiring guard its keydown handler with one call instead of a literal union check inline. */
export function isArrowKey(key: string): key is ArrowKey {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

/**
 * The position moved one keyboard step in `key`'s direction — NOT yet
 * clamped to the desk (the caller runs {@link clampPosition} on the
 * result, same as every pointer-drag move).
 */
export function nudgePosition(pos: Position, key: ArrowKey, big: boolean): Position {
  const step = big ? ARROW_STEP_SHIFT_PX : ARROW_STEP_PX;
  switch (key) {
    case 'ArrowUp':
      return { x: pos.x, y: pos.y - step };
    case 'ArrowDown':
      return { x: pos.x, y: pos.y + step };
    case 'ArrowLeft':
      return { x: pos.x - step, y: pos.y };
    case 'ArrowRight':
      return { x: pos.x + step, y: pos.y };
  }
}
