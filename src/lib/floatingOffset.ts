/**
 * floatingOffset — pure math behind `ScrollToTop`'s "never hide behind the
 * footer" behavior (global/window mode only).
 *
 * Split out from the component for the same reason `scrollProgress.ts` is:
 * directly unit-testable (node project, no jsdom/DOM needed) instead of only
 * ever exercised through a rendered button's computed style.
 *
 * The button used to HIDE the moment the footer entered the viewport
 * (`IntersectionObserver`, `threshold: 0`). Owner feedback: it must never
 * hide because of the footer — instead it stays visible and rides UP, just
 * above the footer's visible edge, as the page scrolls to the bottom.
 */

/**
 * How tall the footer's currently-visible slice is, given the footer's top
 * edge position (`getBoundingClientRect().top`, viewport-relative) and the
 * viewport height. `0` while the footer hasn't started entering the
 * viewport yet (`footerTop >= viewportHeight`).
 */
export function visibleFooterHeight(footerTop: number, viewportHeight: number): number {
  return Math.max(0, viewportHeight - footerTop);
}

/**
 * The floating control's `bottom` offset in pixels: its normal resting
 * offset, or just clear of the footer's visible slice plus a gap —
 * whichever pushes it HIGHER. Riding `visibleFooterHeightPx` up as the
 * footer rises is what makes the button track the footer's edge smoothly
 * instead of jumping or ever sitting on top of it.
 */
export function computeFloatingBottomOffset(
  baseOffsetPx: number,
  visibleFooterHeightPx: number,
  gapPx: number,
): number {
  return Math.max(baseOffsetPx, visibleFooterHeightPx + gapPx);
}
