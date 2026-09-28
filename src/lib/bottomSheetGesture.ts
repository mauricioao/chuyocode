/**
 * bottomSheetGesture — pure swipe-down-to-close math for `BottomSheet`
 * (mobile layout pass). Zero DOM: the component only feeds it plain numbers
 * read off pointer events (`clientY`, `performance.now()`) and applies the
 * returned translate/decision — same "pure math, dumb component" split as
 * `src/lib/activities/canvasViewport.ts` right next to the other canvas/
 * gesture math in this codebase.
 */

/** A single sample of the drag-handle pointer, used to derive velocity. */
export interface DragSample {
  y: number;
  time: number;
}

/**
 * The live vertical offset (px) to apply to the sheet while dragging its
 * handle from `start` to `current`. Never negative — dragging UP must not
 * lift the sheet past its resting position (there is nothing above it to
 * reveal), only closing it downward is a gesture this sheet understands.
 */
export function dragTranslateY(start: DragSample, current: DragSample): number {
  return Math.max(0, current.y - start.y);
}

/** Downward velocity in px/ms between two samples; `0` when time did not advance (defensive — a real pointermove always advances the clock). */
export function dragVelocity(start: DragSample, current: DragSample): number {
  const dt = current.time - start.time;
  if (dt <= 0) return 0;
  return (current.y - start.y) / dt;
}

/** Past this fraction of the sheet's own height, a released drag closes it even at zero velocity. */
export const DISMISS_DISTANCE_RATIO = 0.3;

/** Past this downward speed (px/ms), a released drag closes it regardless of how far it travelled — a quick flick dismisses a barely-moved sheet. */
export const DISMISS_VELOCITY = 0.5;

/**
 * Whether releasing the drag handle at `translateY` (px, already clamped by
 * {@link dragTranslateY}) travelling at `velocity` (px/ms, from
 * {@link dragVelocity}) should close the sheet — a far-enough drag OR a
 * fast-enough flick, either one. `sheetHeight <= 0` (not yet laid out, e.g.
 * jsdom) never dismisses: there is no meaningful "how far" without it.
 */
export function shouldDismissSheet(translateY: number, velocity: number, sheetHeight: number): boolean {
  if (translateY <= 0 || sheetHeight <= 0) return false;
  return translateY / sheetHeight > DISMISS_DISTANCE_RATIO || velocity > DISMISS_VELOCITY;
}
