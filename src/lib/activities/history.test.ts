import { describe, it, expect } from 'vitest';
import {
  MAX_HISTORY,
  initHistory,
  pushHistory,
  replacePresent,
  commitTransaction,
  snapshotForTransaction,
  undo,
  redo,
  canUndo,
  canRedo,
} from './history';

describe('initHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const h = initHistory('a');
    expect(h).toEqual({ past: [], present: 'a', future: [] });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });
});

describe('pushHistory', () => {
  it('records the previous present as a past entry', () => {
    const h = pushHistory(initHistory('a'), 'b');
    expect(h).toEqual({ past: ['a'], present: 'b', future: [] });
  });

  it('discards the future (redo stack) on a new change', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = pushHistory(h, 'c');
    expect(h.future).toEqual([]);
    expect(canRedo(h)).toBe(false);
  });

  it('is a no-op for a reference-equal next value', () => {
    const present = { x: 1 };
    const h = initHistory(present);
    expect(pushHistory(h, present)).toBe(h);
  });

  it('caps the past stack at MAX_HISTORY entries', () => {
    let h = initHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 10; i++) {
      h = pushHistory(h, i);
    }
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(10); // the oldest 10 entries were dropped
    expect(h.present).toBe(MAX_HISTORY + 10);
  });
});

describe('undo / redo', () => {
  it('undo moves the present back and pushes it onto the future', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    h = undo(h);
    expect(h).toEqual({ past: ['a'], present: 'b', future: ['c'] });
  });

  it('undo is a no-op with nothing in the past', () => {
    const h = initHistory('a');
    expect(undo(h)).toBe(h);
  });

  it('redo moves the present forward from the future', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = undo(h);
    h = redo(h);
    expect(h).toEqual({ past: ['a'], present: 'b', future: [] });
  });

  it('redo is a no-op with nothing in the future', () => {
    const h = initHistory('a');
    expect(redo(h)).toBe(h);
  });

  it('undo then a new change discards the redone branch permanently', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = undo(h); // present back to 'a', 'b' in future
    h = pushHistory(h, 'z');
    expect(h).toEqual({ past: ['a'], present: 'z', future: [] });
  });

  it('a full undo/redo round trip returns to the same state', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    const afterPushes = h;
    h = undo(undo(h));
    h = redo(redo(h));
    expect(h).toEqual(afterPushes);
  });
});

describe('canUndo / canRedo', () => {
  it('reflect the presence of past/future entries', () => {
    let h = initHistory('a');
    expect(canUndo(h)).toBe(false);
    h = pushHistory(h, 'b');
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    h = undo(h);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
  });
});

describe('replacePresent / commitTransaction (drag gestures collapse to one step)', () => {
  it('replacePresent updates the present without touching past/future', () => {
    let h = initHistory({ zones: [1] });
    h = pushHistory(h, { zones: [2] });
    const beforeReplace = h;
    h = replacePresent(h, { zones: [3] });
    expect(h.past).toEqual(beforeReplace.past);
    expect(h.future).toEqual(beforeReplace.future);
    expect(h.present).toEqual({ zones: [3] });
  });

  it('a whole drag (many replacePresent calls) commits as exactly ONE undo step', () => {
    let h = initHistory({ zones: [0, 0] });
    const baseline = snapshotForTransaction(h);

    // Simulate 50 pointermove frames — none of these may create a history entry.
    for (let i = 1; i <= 50; i++) {
      h = replacePresent(h, { zones: [i, i] });
    }
    expect(h.past).toHaveLength(0);

    // pointerup: seal the whole gesture into one step.
    h = commitTransaction(h, baseline);
    expect(h.past).toEqual([{ zones: [0, 0] }]);
    expect(h.present).toEqual({ zones: [50, 50] });

    // One undo restores the PRE-DRAG state, not frame 49.
    h = undo(h);
    expect(h.present).toEqual({ zones: [0, 0] });
  });

  it('commitTransaction with an unchanged baseline records nothing (a drag that never moved)', () => {
    let h = initHistory({ zones: [1] });
    const baseline = snapshotForTransaction(h);
    h = commitTransaction(h, baseline);
    expect(h.past).toHaveLength(0);
  });
});
