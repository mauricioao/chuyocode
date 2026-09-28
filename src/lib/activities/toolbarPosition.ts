/**
 * Pure positioning math for the editor's floating side toolbar
 * (`EditorSideToolbar.tsx`, "floating side toolbar" pass). Zero DOM, zero
 * I/O — same posture as `canvasViewport.ts`/`zoneGeometry.ts` right beside
 * it: the component only translates real `getBoundingClientRect()` reads
 * (the site header/footer elements, and the toolbar's own rail) and pointer
 * events into calls here.
 */

export interface Point {
  x: number;
  y: number;
}

export interface ToolbarSize {
  width: number;
  height: number;
}

/**
 * The rectangle the toolbar may occupy: `top`/`bottom` are the site
 * header's own bottom edge and the footer's own top edge (both in viewport
 * pixels, e.g. `getBoundingClientRect().bottom`/`.top`); `left`/`right` are
 * the visible horizontal extent (typically `0`/`window.innerWidth`).
 */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The gap from the viewport's right edge the DOCKED position keeps — matches the original `right-3` (0.75rem @ 16px root). */
export const DOCK_MARGIN = 12;

/** How close (px) a released drag must land to the dock target to snap back into place. */
export const DOCK_SNAP_DISTANCE = 48;

/** One arrow-key nudge of the drag handle. */
export const ARROW_KEY_STEP = 16;

/** One Shift+arrow-key nudge of the drag handle. */
export const ARROW_KEY_STEP_SHIFT = 64;

/**
 * Clamp a proposed top-left `position` so the toolbar's own `size` box stays
 * FULLY inside `bounds` on every edge — used while dragging, and again on
 * every window resize/scroll (the bounds themselves can shrink under an
 * already-positioned toolbar, e.g. the footer scrolling into view). When the
 * toolbar is taller/wider than the available space, both edges collapse to
 * `bounds`' own top-left corner rather than producing a negative-size range.
 */
export function clampToolbarPosition(position: Point, size: ToolbarSize, bounds: Bounds): Point {
  const maxX = Math.max(bounds.left, bounds.right - size.width);
  const maxY = Math.max(bounds.top, bounds.bottom - size.height);
  return {
    x: Math.min(maxX, Math.max(bounds.left, position.x)),
    y: Math.min(maxY, Math.max(bounds.top, position.y)),
  };
}

/**
 * The toolbar's DOCKED position — the right edge (minus {@link DOCK_MARGIN},
 * matching its original `right-3`), vertically centered in `bounds` (matching
 * its original `top-1/2 -translate-y-1/2`). This is both where the ghost
 * dock target renders while undocked, and the pre-computed "docked" position
 * used for arrow-key nudging and the snap-back distance check.
 */
export function dockTargetPosition(size: ToolbarSize, bounds: Bounds, margin: number = DOCK_MARGIN): Point {
  return {
    x: bounds.right - size.width - margin,
    y: (bounds.top + bounds.bottom) / 2 - size.height / 2,
  };
}

/** Plain Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Whether releasing a drag at `position` should re-dock it: within `snapDistance` of `dockTarget`. */
export function shouldSnapToDock(position: Point, dockTarget: Point, snapDistance: number = DOCK_SNAP_DISTANCE): boolean {
  return distance(position, dockTarget) <= snapDistance;
}

/** The drag handle's arrow-key nudge distance — {@link ARROW_KEY_STEP}, or {@link ARROW_KEY_STEP_SHIFT} with Shift held. */
export function keyboardStep(shiftKey: boolean): number {
  return shiftKey ? ARROW_KEY_STEP_SHIFT : ARROW_KEY_STEP;
}

/** The toolbar's persisted `localStorage` shape — see `EditorSideToolbar.tsx`'s own header. */
export interface ToolbarPersistedState {
  docked: boolean;
  x: number;
  y: number;
}

const DEFAULT_PERSISTED_STATE: ToolbarPersistedState = { docked: true, x: 0, y: 0 };

/**
 * Validate an arbitrary parsed-JSON value (from `localStorage`, wrapped in
 * try/catch by the caller — see the component's own header) into a real
 * {@link ToolbarPersistedState}. Anything malformed — missing/wrong-typed
 * fields, a non-finite `x`/`y`, not even an object — falls back to the
 * DOCKED default rather than propagating garbage into the camera/position
 * state.
 */
export function parsePersistedToolbarState(raw: unknown): ToolbarPersistedState {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>).docked === 'boolean' &&
    typeof (raw as Record<string, unknown>).x === 'number' &&
    typeof (raw as Record<string, unknown>).y === 'number' &&
    Number.isFinite((raw as Record<string, unknown>).x) &&
    Number.isFinite((raw as Record<string, unknown>).y)
  ) {
    const { docked, x, y } = raw as ToolbarPersistedState;
    return { docked, x, y };
  }
  return DEFAULT_PERSISTED_STATE;
}
