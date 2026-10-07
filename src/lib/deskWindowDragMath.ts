/**
 * deskWindowDragMath — pure clamp math for the floating desk window's own
 * drag offset ("desktop" redesign PART 6c, owner spec 2026-10-07: "quiero
 * que sea una ventana dentro de nuestro escritorio"). Mirrors
 * `@lib/deskDragMath`'s own split (pure math here, DOM wiring in
 * `@lib/ui/deskWindowDrag`) — the window itself is positioned by CSS
 * `inset-*` utilities (`DeskWindow.astro`), never JS-computed left/top, so
 * dragging only ever adds a `translate` OFFSET on top of that default box;
 * this module is exactly the clamp that keeps the WHOLE window (and so its
 * traffic lights) on screen no matter how far a visitor drags it.
 */

export interface Offset {
  x: number;
  y: number;
}

/** The whole window element's own rect at offset `{x:0,y:0}` — its default, un-dragged position. */
export interface WindowRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/** sessionStorage key — ONE shared key for every desk window (practice, the
 * activities-creator picker, the editor), so a visitor's drag offset
 * follows them across a hub -> window -> hub round trip, never just one
 * activity's own window. */
export const DESK_WINDOW_OFFSET_STORAGE_KEY = 'ingles-desk-window-offset';

/** Minimum gap kept between the window's own edge and the viewport's edge (left/right/bottom). */
export const WINDOW_EDGE_MARGIN = 8;

/**
 * Clamps a drag offset so the WHOLE window — not just its title bar — always
 * stays inside the viewport: never above the header's own bottom edge
 * (keeps the traffic lights reachable), and never closer than
 * {@link WINDOW_EDGE_MARGIN} to the left, right, or bottom viewport edge.
 *
 * When the viewport is too small/short for both bounds to hold at once (a
 * tiny viewport, or a window wider/taller than the viewport itself), the
 * UPPER/LEFT bound (never above the header, never off the left edge) wins
 * over the lower/right one — same "clamp to the safe corner" posture as
 * `@lib/deskDragMath#clampPosition`, which keeps the traffic lights (always
 * top-left of the window) on screen even then.
 */
export function clampWindowDragOffset(
  offset: Offset,
  windowRect: WindowRect,
  viewport: ViewportSize,
  headerBottom: number,
  margin: number = WINDOW_EDGE_MARGIN,
): Offset {
  const minY = headerBottom - windowRect.top;
  const maxY = Math.max(minY, viewport.height - margin - windowRect.height - windowRect.top);
  const y = Math.min(Math.max(offset.y, minY), maxY);

  const minX = margin - windowRect.left;
  const maxX = Math.max(minX, viewport.width - margin - windowRect.width - windowRect.left);
  const x = Math.min(Math.max(offset.x, minX), maxX);

  return { x, y };
}

function isOffset(value: unknown): value is Offset {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Offset).x === 'number' &&
    Number.isFinite((value as Offset).x) &&
    typeof (value as Offset).y === 'number' &&
    Number.isFinite((value as Offset).y)
  );
}

/**
 * Parses the persisted offset, tolerating anything a hand-edited or
 * stale/corrupted `sessionStorage` value could contain — never throws, same
 * posture as `@lib/deskDragMath#parseStoredPositions`. The caller
 * (`@lib/ui/deskWindowDrag`) still re-clamps whatever this returns against
 * the CURRENT viewport before applying it, so a value left over from a much
 * wider screen is never applied as-is.
 */
export function parseStoredWindowOffset(raw: string | null): Offset | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isOffset(parsed) ? parsed : null;
}

export function serializeWindowOffset(offset: Offset): string {
  return JSON.stringify(offset);
}
