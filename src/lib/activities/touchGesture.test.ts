import { describe, expect, it } from 'vitest';
import {
  reduceTouchGesture,
  INITIAL_TOUCH_GESTURE_STATE,
  type TouchGestureState,
} from './touchGesture';
import { anchoredZoom, type Camera, type CameraBounds } from './canvasViewport';

const CAMERA: Camera = { scale: 1, x: 0, y: 0 };
const BOUNDS: CameraBounds = { image: { width: 800, height: 400 }, viewport: { width: 400, height: 200 } };

describe('reduceTouchGesture — single finger draw', () => {
  it('a first pointerdown starts the "single" phase with no effect (the caller owns draw/move/resize)', () => {
    const { state, effect } = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 10, y: 10 }, camera: CAMERA },
      BOUNDS,
    );
    expect(state.phase).toBe('single');
    expect(state.pointers).toEqual({ 1: { x: 10, y: 10 } });
    expect(effect).toEqual({ type: 'none' });
  });

  it('a move while single keeps the point fresh with no effect', () => {
    const after = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 10, y: 10 }, camera: CAMERA },
      BOUNDS,
    );
    const { state, effect } = reduceTouchGesture(
      after.state,
      { type: 'pointermove', id: 1, point: { x: 20, y: 30 } },
      BOUNDS,
    );
    expect(state.phase).toBe('single');
    expect(state.pointers).toEqual({ 1: { x: 20, y: 30 } });
    expect(effect).toEqual({ type: 'none' });
  });

  it('lifting the only finger returns to idle with no pointers left', () => {
    const down = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 10, y: 10 }, camera: CAMERA },
      BOUNDS,
    ).state;
    const { state, effect } = reduceTouchGesture(down, { type: 'pointerup', id: 1 }, BOUNDS);
    expect(state).toEqual({ phase: 'idle', pointers: {}, pinch: null });
    expect(effect).toEqual({ type: 'none' });
  });
});

describe('reduceTouchGesture — a second finger cancels the single-finger action', () => {
  function withOneFingerDown(): TouchGestureState {
    return reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 0, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
  }

  it('emits cancel-single and switches to the pinch phase', () => {
    const { state, effect } = reduceTouchGesture(
      withOneFingerDown(),
      { type: 'pointerdown', id: 2, point: { x: 100, y: 0 }, camera: CAMERA },
      BOUNDS,
    );
    expect(effect).toEqual({ type: 'cancel-single' });
    expect(state.phase).toBe('pinch');
    expect(state.pointers).toEqual({ 1: { x: 0, y: 0 }, 2: { x: 100, y: 0 } });
    expect(state.pinch).toMatchObject({ pairIds: [1, 2], startDistance: 100 });
  });

  it('anchors the pinch to the CURRENT camera at the moment the second finger lands', () => {
    const zoomedCamera: Camera = { scale: 2, x: -30, y: -10 };
    const { state } = reduceTouchGesture(
      withOneFingerDown(),
      { type: 'pointerdown', id: 2, point: { x: 100, y: 0 }, camera: zoomedCamera },
      BOUNDS,
    );
    expect(state.pinch?.startCamera).toEqual(zoomedCamera);
  });

  it('a third finger while pinching is tracked but does not disturb the active pinch pair', () => {
    const pinching = reduceTouchGesture(
      withOneFingerDown(),
      { type: 'pointerdown', id: 2, point: { x: 100, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
    const { state, effect } = reduceTouchGesture(
      pinching,
      { type: 'pointerdown', id: 3, point: { x: 50, y: 50 }, camera: CAMERA },
      BOUNDS,
    );
    expect(effect).toEqual({ type: 'none' });
    expect(state.phase).toBe('pinch');
    expect(state.pinch?.pairIds).toEqual([1, 2]);
    expect(state.pointers[3]).toEqual({ x: 50, y: 50 });
  });
});

describe('reduceTouchGesture — pinch updates the camera', () => {
  function withPinchStarted(startCamera: Camera = CAMERA) {
    const one = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 100, y: 100 }, camera: startCamera },
      BOUNDS,
    ).state;
    return reduceTouchGesture(
      one,
      { type: 'pointerdown', id: 2, point: { x: 200, y: 100 }, camera: startCamera },
      BOUNDS,
    ).state;
  }

  it('moving one finger of the pair applies the exact `anchoredZoom` result for that distance/midpoint change', () => {
    const pinching = withPinchStarted();
    const { state, effect } = reduceTouchGesture(
      pinching,
      { type: 'pointermove', id: 2, point: { x: 300, y: 100 } }, // distance 100 -> 200, doubles the zoom
      BOUNDS,
    );
    expect(effect.type).toBe('camera');
    const expected = anchoredZoom(CAMERA, 2, { x: 150, y: 100 }, { x: 200, y: 100 }, BOUNDS);
    expect(effect).toEqual({ type: 'camera', camera: expected });
    expect(state.pointers).toEqual({ 1: { x: 100, y: 100 }, 2: { x: 300, y: 100 } });
  });

  it('a pure two-finger pan (both fingers shift by the same delta) keeps the scale, only pans', () => {
    const pinching = withPinchStarted(); // fingers at (100,100) and (200,100), distance 100
    // Both shift by the same (-30, -40) — panning "into" the clampable
    // range (the opposite direction is already clamped at the camera's
    // starting x=0/y=0 boundary, since the 800x400 image is larger than the
    // 400x200 viewport at scale 1 — see `clampCameraAxis`).
    const afterFirst = reduceTouchGesture(
      pinching,
      { type: 'pointermove', id: 1, point: { x: 70, y: 60 } },
      BOUNDS,
    ).state;
    const { effect } = reduceTouchGesture(
      afterFirst,
      { type: 'pointermove', id: 2, point: { x: 170, y: 60 } },
      BOUNDS,
    );
    expect(effect.type).toBe('camera');
    if (effect.type === 'camera') {
      // Distance is unchanged (100 again) once both fingers have moved —
      // same scale, only panned.
      expect(effect.camera.scale).toBeCloseTo(1);
      expect(effect.camera.x).not.toBeCloseTo(CAMERA.x);
      expect(effect.camera.y).not.toBeCloseTo(CAMERA.y);
    }
  });

  it('ignores a move from a finger outside the active pinch pair', () => {
    const pinching = reduceTouchGesture(
      withPinchStarted(),
      { type: 'pointerdown', id: 3, point: { x: 0, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
    const { effect } = reduceTouchGesture(pinching, { type: 'pointermove', id: 3, point: { x: 10, y: 10 } }, BOUNDS);
    expect(effect).toEqual({ type: 'none' });
  });
});

describe('reduceTouchGesture — lifting to one finger does nothing', () => {
  function withPinchStarted() {
    const one = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 0, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
    return reduceTouchGesture(
      one,
      { type: 'pointerdown', id: 2, point: { x: 100, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
  }

  it('dropping the second finger moves to "suppressed", not back to "single"', () => {
    const pinching = withPinchStarted();
    const { state, effect } = reduceTouchGesture(pinching, { type: 'pointerup', id: 2 }, BOUNDS);
    expect(state.phase).toBe('suppressed');
    expect(state.pinch).toBeNull();
    expect(state.pointers).toEqual({ 1: { x: 0, y: 0 } });
    expect(effect).toEqual({ type: 'none' });
  });

  it('the remaining lone finger moving produces no camera update and no effect', () => {
    const pinching = withPinchStarted();
    const suppressed = reduceTouchGesture(pinching, { type: 'pointerup', id: 2 }, BOUNDS).state;
    const { state, effect } = reduceTouchGesture(
      suppressed,
      { type: 'pointermove', id: 1, point: { x: 999, y: 999 } },
      BOUNDS,
    );
    expect(effect).toEqual({ type: 'none' });
    expect(state.phase).toBe('suppressed');
  });

  it('a fresh second finger while suppressed does not re-cancel anything (nothing was drawing) but DOES start a new pinch', () => {
    const pinching = withPinchStarted();
    const suppressed = reduceTouchGesture(pinching, { type: 'pointerup', id: 2 }, BOUNDS).state;
    const { state, effect } = reduceTouchGesture(
      suppressed,
      { type: 'pointerdown', id: 3, point: { x: 50, y: 50 }, camera: CAMERA },
      BOUNDS,
    );
    expect(effect).toEqual({ type: 'none' });
    expect(state.phase).toBe('pinch');
    expect(state.pinch?.pairIds).toEqual([1, 3]);
  });
});

describe('reduceTouchGesture — all fingers up resets to idle', () => {
  it('resets from "suppressed" once the last finger lifts, ready for a genuinely new gesture', () => {
    const one = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 0, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
    const pinching = reduceTouchGesture(
      one,
      { type: 'pointerdown', id: 2, point: { x: 100, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
    const suppressed = reduceTouchGesture(pinching, { type: 'pointerup', id: 2 }, BOUNDS).state;
    const { state, effect } = reduceTouchGesture(suppressed, { type: 'pointerup', id: 1 }, BOUNDS);
    expect(state).toEqual({ phase: 'idle', pointers: {}, pinch: null });
    expect(effect).toEqual({ type: 'none' });

    // And the very next touch starts a brand new "single" phase.
    const restarted = reduceTouchGesture(
      state,
      { type: 'pointerdown', id: 7, point: { x: 5, y: 5 }, camera: CAMERA },
      BOUNDS,
    );
    expect(restarted.state.phase).toBe('single');
    expect(restarted.effect).toEqual({ type: 'none' });
  });

  it('pointercancel behaves the same as pointerup for resetting', () => {
    const one = reduceTouchGesture(
      INITIAL_TOUCH_GESTURE_STATE,
      { type: 'pointerdown', id: 1, point: { x: 0, y: 0 }, camera: CAMERA },
      BOUNDS,
    ).state;
    const { state } = reduceTouchGesture(one, { type: 'pointercancel', id: 1 }, BOUNDS);
    expect(state).toEqual({ phase: 'idle', pointers: {}, pinch: null });
  });
});
