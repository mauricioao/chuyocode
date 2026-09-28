/**
 * touchGesture — the pure pointer-tracking state machine behind two-finger
 * pinch/pan on `WorksheetZoneEditor`'s canvas (mobile layout pass). Zero DOM,
 * same "pure math, dumb component" split as `zoneGeometry.ts`/
 * `canvasViewport.ts` right beside it: the component only feeds it real
 * pointer events and applies the `TouchGestureEffect` it returns.
 *
 * TYPE-AGNOSTIC BY DESIGN: this module tracks whatever pointer ids it is
 * given — it does not itself know or care about `pointerType`. Mouse/pen
 * behavior stays completely unchanged because `WorksheetZoneEditor.tsx`
 * only ever feeds pointers whose `event.pointerType === 'touch'` into it;
 * a mouse/pen gesture never reaches this reducer at all, and keeps using
 * the editor's existing `dragRef`-based drag handling exclusively.
 *
 * Reuses the SAME pinch primitives the practice player's own camera already
 * uses (`anchoredZoom`, `midpoint`, `distanceBetween` — `canvasViewport.ts`),
 * so both gestures share one implementation instead of two subtly different
 * ones. Anchors through `clampZoomInput`'s WIDER 10%-400% range (pre-clamped
 * the same explicit way `stepZoomInput`/`wheelZoomInput` already do) to
 * match every OTHER explicit zoom entry point in THIS editor — the practice
 * player's own pinch intentionally keeps the narrower `clampZoom` instead;
 * see `canvasViewport.ts`'s own header on each.
 *
 * RULES (owner-approved design, mobile layout pass):
 *  - One touch pointer down starts a `'single'` phase — the CALLER owns
 *    whatever that pointer actually does (draw/move/resize/pan); this
 *    module only counts it and keeps its latest position fresh.
 *  - A SECOND touch pointer down while `'single'` cancels whatever the
 *    caller's one-finger action was (`effect: { type: 'cancel-single' }` —
 *    the caller must DISCARD it, never commit it, no history entry) and
 *    starts a `'pinch'`, anchored to the two fingers' CURRENT positions and
 *    distance apart.
 *  - While `'pinch'`, a pointermove of either pinch-pair finger updates the
 *    camera in one call via `anchoredZoom` — zoom from the distance ratio,
 *    pan from the pair's own midpoint drift, exactly like the practice
 *    player's own pinch.
 *  - Dropping from 2 fingers to 1 ends the pinch and moves to `'suppressed'`
 *    — NOT back to `'single'`: the remaining finger does nothing (no pan, no
 *    draw) until it ALSO lifts. Only once every pointer is up does the state
 *    return to `'idle'`, ready for a genuinely NEW single-finger gesture on
 *    the next touch. (Same posture the practice player's own pinch already
 *    takes for "dropping below 2 fingers always ends the pinch".)
 *  - A third+ simultaneous finger is tracked for counting only — the active
 *    pinch pair and its camera math are untouched by it.
 */
import {
  anchoredZoom,
  clampZoomInput,
  distanceBetween,
  midpoint,
  type Camera,
  type CameraBounds,
  type Point,
} from './canvasViewport';

export type TouchGesturePhase = 'idle' | 'single' | 'pinch' | 'suppressed';

export interface TouchGestureState {
  phase: TouchGesturePhase;
  /** Every currently-down touch pointer's last known VIEWPORT-relative point, by id. */
  pointers: Record<number, Point>;
  /** Set only while `phase === 'pinch'` — the two pointer ids this pinch is anchored to, and where it started. */
  pinch: {
    pairIds: [number, number];
    startCamera: Camera;
    startDistance: number;
    startMid: Point;
  } | null;
}

export const INITIAL_TOUCH_GESTURE_STATE: TouchGestureState = {
  phase: 'idle',
  pointers: {},
  pinch: null,
};

export type TouchGestureAction =
  | { type: 'pointerdown'; id: number; point: Point; camera: Camera }
  | { type: 'pointermove'; id: number; point: Point }
  | { type: 'pointerup'; id: number }
  | { type: 'pointercancel'; id: number };

export type TouchGestureEffect =
  | { type: 'none' }
  /** The caller's in-progress one-finger action (draw/move/resize) must be discarded, never committed. */
  | { type: 'cancel-single' }
  /** A pinch/pan move produced this new camera. */
  | { type: 'camera'; camera: Camera };

export interface TouchGestureResult {
  state: TouchGestureState;
  effect: TouchGestureEffect;
}

function withoutPointer(pointers: Record<number, Point>, id: number): Record<number, Point> {
  const next = { ...pointers };
  delete next[id];
  return next;
}

export function reduceTouchGesture(
  state: TouchGestureState,
  action: TouchGestureAction,
  bounds: CameraBounds,
): TouchGestureResult {
  switch (action.type) {
    case 'pointerdown': {
      const pointers = { ...state.pointers, [action.id]: action.point };
      const ids = Object.keys(pointers).map(Number);

      if (ids.length === 1) {
        return { state: { phase: 'single', pointers, pinch: null }, effect: { type: 'none' } };
      }

      if (ids.length === 2 && state.phase !== 'pinch') {
        const [a, b] = ids as [number, number];
        const pinch = {
          pairIds: [a, b] as [number, number],
          startCamera: action.camera,
          startDistance: distanceBetween(pointers[a], pointers[b]),
          startMid: midpoint(pointers[a], pointers[b]),
        };
        const effect: TouchGestureEffect =
          state.phase === 'single' ? { type: 'cancel-single' } : { type: 'none' };
        return { state: { phase: 'pinch', pointers, pinch }, effect };
      }

      // A third+ finger, or a second finger while already pinching: tracked
      // for counting only — the active pinch pair/camera math is untouched.
      return { state: { ...state, pointers }, effect: { type: 'none' } };
    }

    case 'pointermove': {
      if (!(action.id in state.pointers)) return { state, effect: { type: 'none' } };
      const pointers = { ...state.pointers, [action.id]: action.point };

      if (state.phase === 'pinch' && state.pinch) {
        const [a, b] = state.pinch.pairIds;
        const isPairMove = action.id === a || action.id === b;
        if (!isPairMove || !(a in pointers) || !(b in pointers)) {
          return { state: { ...state, pointers }, effect: { type: 'none' } };
        }
        const nextState = { ...state, pointers };
        if (state.pinch.startDistance <= 0) return { state: nextState, effect: { type: 'none' } };
        const distance = distanceBetween(pointers[a], pointers[b]);
        const nextScale = clampZoomInput(
          state.pinch.startCamera.scale * (distance / state.pinch.startDistance),
        );
        const mid = midpoint(pointers[a], pointers[b]);
        const camera = anchoredZoom(state.pinch.startCamera, nextScale, state.pinch.startMid, mid, bounds);
        return { state: nextState, effect: { type: 'camera', camera } };
      }

      // 'single'/'suppressed'/'idle': just keep the point fresh for a
      // possible future pinch anchor; no effect for the caller.
      return { state: { ...state, pointers }, effect: { type: 'none' } };
    }

    case 'pointerup':
    case 'pointercancel': {
      const pointers = withoutPointer(state.pointers, action.id);
      const count = Object.keys(pointers).length;

      if (count === 0) {
        return { state: { phase: 'idle', pointers, pinch: null }, effect: { type: 'none' } };
      }
      if (state.phase === 'pinch' && count === 1) {
        return { state: { phase: 'suppressed', pointers, pinch: null }, effect: { type: 'none' } };
      }
      return { state: { ...state, pointers }, effect: { type: 'none' } };
    }

    default:
      return { state, effect: { type: 'none' } };
  }
}
