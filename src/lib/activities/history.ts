/**
 * Pure undo/redo history reducer for the activity editor's state (creator
 * polish round 2, owner request #7: "implement an undo/redo history of
 * editor state"). Zero I/O, zero DOM — same posture as every other module in
 * this directory: the editor component only calls these functions in
 * response to real events, never does the bookkeeping itself.
 *
 * TRANSACTIONS: a continuous gesture (a zone drag) must land as ONE undo
 * step, not one per pointermove frame. {@link replacePresent} updates the
 * live value with NO new undo point (used for every intermediate frame of a
 * drag); {@link commitTransaction} then seals the whole gesture into a
 * single step, given the baseline captured before the gesture started. A
 * plain discrete change (add/delete/rename/reorder, or a text field's blur)
 * uses {@link pushHistory} directly, which is exactly `commitTransaction`
 * with the CURRENT present as its own baseline.
 */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** History keeps at most this many past states (owner request #7: "cap ~100 steps"). */
export const MAX_HISTORY = 100;

/** A fresh history with nothing to undo or redo yet. */
export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

/**
 * Record one discrete, already-final change: `history.present` becomes the
 * new past entry (trimmed to {@link MAX_HISTORY}), `next` becomes the new
 * present, and any redo stack is discarded (the standard undo/redo rule: a
 * new change after an undo abandons the redone-away future).
 *
 * A `next` that is reference-equal to the current present is a no-op — nothing
 * changed, so no history entry is recorded.
 */
export function pushHistory<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (next === history.present) return history;
  const past = [...history.past, history.present].slice(-MAX_HISTORY);
  return { past, present: next, future: [] };
}

/**
 * Update the live present with NO new undo point — one frame of an in-progress
 * gesture (a zone being dragged/resized). `past`/`future` are left untouched;
 * {@link commitTransaction} is what turns the whole gesture into one step.
 */
export function replacePresent<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  return { ...history, present: next };
}

/**
 * Seal an in-progress gesture into exactly one undo step: `baseline` (the
 * state captured before the gesture began, via {@link snapshotForTransaction})
 * becomes the new past entry, `history.present` (already updated by zero or
 * more {@link replacePresent} calls) is kept as-is, and the redo stack is
 * discarded. A gesture that never actually changed anything (`baseline ===
 * history.present`) records nothing.
 */
export function commitTransaction<T>(history: HistoryState<T>, baseline: T): HistoryState<T> {
  if (baseline === history.present) return history;
  const past = [...history.past, baseline].slice(-MAX_HISTORY);
  return { past, present: history.present, future: [] };
}

/** What to capture, at the start of a gesture, to later pass to {@link commitTransaction}. */
export function snapshotForTransaction<T>(history: HistoryState<T>): T {
  return history.present;
}

/** Step back to the previous state, or return `history` unchanged if there is nothing to undo. */
export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1]!;
  const past = history.past.slice(0, -1);
  const future = [history.present, ...history.future];
  return { past, present: previous, future };
}

/** Step forward to the next (previously undone) state, or return `history` unchanged if there is nothing to redo. */
export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0]!;
  const future = history.future.slice(1);
  const past = [...history.past, history.present];
  return { past, present: next, future };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}
