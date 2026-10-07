/**
 * deskHelperCollision — the pure decision at the heart of `deskHelper.ts`'s
 * dynamic fold (polish pass 2026-10-06, owner report `dock-three-chips.png`:
 * the dock widened to the left under the open helper bubble and covered the
 * A1 tile). Zero DOM, same split as `deskWindow.ts`/`minimizedWindows.ts` —
 * anything that could silently be WRONG belongs in a pure, unit-testable
 * function, never inlined into a `ResizeObserver` callback nobody can assert
 * on directly.
 */

/** A plain axis-aligned rectangle in viewport coordinates — the exact shape `DOMRect`/`getBoundingClientRect()` already has, so a caller never needs to repack one. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** True when `box` has no actual area — a `0x0` (or inverted) rect, same shape `getBoundingClientRect()` returns for an element that has not actually laid out yet (e.g. mid-hydration, or `display: none`). Never worth treating as a real collision candidate. */
function isDegenerate(box: Box): boolean {
  return box.right <= box.left || box.bottom <= box.top;
}

/**
 * True when `a` and `b` share any actual overlap area — merely touching at a
 * shared edge (no area in common) does not count, and a degenerate
 * (zero-width/height, e.g. not-yet-measured) box never intersects anything,
 * including a box it is numerically positioned inside of. Order-independent.
 */
export function boxesIntersect(a: Box, b: Box): boolean {
  if (isDegenerate(a) || isDegenerate(b)) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
