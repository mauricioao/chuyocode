/**
 * deskWindowDragMath — pure clamp math for the floating desk window's own
 * drag offset ("desktop" redesign PART 6c, owner spec 2026-10-07: "quiero
 * que sea una ventana dentro de nuestro escritorio"). Mirrors
 * `@lib/deskDragMath`'s own split (pure math here, DOM wiring in
 * `@lib/ui/deskWindowDrag`) — the window itself is positioned by CSS
 * `inset-*` utilities (`DeskWindow.astro`), never JS-computed left/top, so
 * dragging only ever adds a `translate` OFFSET on top of that default box;
 * this module is exactly the clamp that keeps the title bar reachable no
 * matter how far a visitor drags it.
 */

export interface Offset {
  x: number;
  y: number;
}

/** The title bar's own rect at offset `{x:0,y:0}` — its default, un-dragged position. */
export interface TitlebarRect {
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

/** How much of the title bar's own width must stay horizontally on screen, on either side. */
export const MIN_VISIBLE_TITLEBAR_WIDTH = 160;

/**
 * Clamps a drag offset so the title bar — not the whole window, which can
 * legitimately run off-screen at the bottom/sides; the title bar is what a
 * visitor actually needs to reach to drag/close/minimize it again — always
 * stays between the header's own bottom edge and the viewport's bottom
 * edge vertically, and keeps at least {@link MIN_VISIBLE_TITLEBAR_WIDTH} of
 * it on screen horizontally either side.
 *
 * When the viewport is too small/short for both bounds to hold at once
 * (a tiny window, or a very short viewport), the UPPER bound (never above
 * the header, never fully off the left/right edge) wins over the lower
 * one — same "clamp to the safe corner" posture as
 * `@lib/deskDragMath#clampPosition`.
 */
export function clampWindowDragOffset(
  offset: Offset,
  titlebar: TitlebarRect,
  viewport: ViewportSize,
  headerBottom: number,
  minVisibleWidth: number = MIN_VISIBLE_TITLEBAR_WIDTH,
): Offset {
  const minY = headerBottom - titlebar.top;
  const maxY = Math.max(minY, viewport.height - titlebar.height - titlebar.top);
  const y = Math.min(Math.max(offset.y, minY), maxY);

  const boundA = minVisibleWidth - titlebar.width - titlebar.left;
  const boundB = viewport.width - minVisibleWidth - titlebar.left;
  const minX = Math.min(boundA, boundB);
  const maxX = Math.max(boundA, boundB);
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
