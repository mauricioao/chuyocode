/**
 * `drop` mechanic state — pure, no React, no dnd-kit.
 *
 * The whole behaviour of a drag-and-drop exercise is decided here so it can be
 * tested without a layout engine. jsdom has no geometry and does not do pointer
 * events realistically, so anything reasoned inside a drag handler is untestable
 * by construction. Everything below is a plain function over plain data.
 *
 * ONE IDEA CARRIES THIS FILE: consumption is DERIVED, never stored.
 *
 * A tile is "in the pool" precisely when no slot's answer names it. There is no
 * second list of remaining tiles to keep in sync with the answers — which is the
 * bug this design removes rather than guards against. A stored pool would drift
 * the moment a slot is cleared by the retry path, and the learner would be shown
 * a tile that is already placed, or lose one that is not.
 *
 * Consequence worth stating plainly: "return the displaced tile to the pool" is
 * not code, it is arithmetic. Overwriting a slot's answer makes the old tile
 * unclaimed on the very next render (docs/exercise-model.md, "Payload shape").
 */
import type { ExerciseResponse, Payload, PoolItem } from './exercisePayload';

/** The mechanic discriminator this module serves. */
export const DROP_INPUT = 'drop';

/**
 * Tile ids held by drop slots OTHER than `exceptSlotId`.
 *
 * Scoped to `drop` slots on purpose. Pools are SHARED across slots and a pool
 * may back two different mechanics at once — the model's own worked example has
 * one `drop` slot and one `select` slot reading different pools, but nothing
 * forbids them reading the SAME one. Counting a `select` answer as a consumed
 * tile would make picking a dropdown option silently delete a draggable tile
 * from an unrelated question.
 *
 * Walks `payload.slots` rather than `response` so the result is stable and
 * ordered by the document, not by whichever slot the learner happened to answer
 * first.
 */
export function claimedTileIds(
  payload: Payload,
  response: ExerciseResponse,
  exceptSlotId: string,
): string[] {
  const claimed: string[] = [];
  for (const slot of payload.slots) {
    if (slot.input !== DROP_INPUT) continue;
    if (slot.id === exceptSlotId) continue;
    for (const id of response[slot.id] ?? []) claimed.push(id);
  }
  return claimed;
}

/**
 * The tiles still available to this slot: the pool, minus what this slot already
 * holds, minus what every other drop slot holds.
 *
 * Subtracting THIS slot's own tile is what makes placement look like a move
 * rather than a copy — without it the tile would sit in the box and in the pool
 * simultaneously, and the learner could place the same answer twice.
 *
 * Preserves pool order. The pool is authored, and reordering it under the
 * learner mid-exercise would move a tile they were reaching for.
 */
export function availableTiles(
  items: PoolItem[],
  placed: string[],
  claimed: readonly string[],
): PoolItem[] {
  const taken = new Set<string>([...placed, ...claimed]);
  return items.filter((item) => !taken.has(item.id));
}

/**
 * The tile currently in this slot's box, or `null`.
 *
 * `null` when the slot is empty AND when it names an id that is in no pool — a
 * dangling reference degrades to an empty box rather than throwing, matching
 * `getSlotItems`, which returns `[]` for a pool that does not exist.
 */
export function placedTile(items: PoolItem[], value: string[]): PoolItem | null {
  const id = value[0];
  if (id === undefined) return null;
  return items.find((item) => item.id === id) ?? null;
}

/** The outcome of dropping a tile into a box. */
export interface Placement {
  /** The slot's next answer. Always at most one id. */
  value: string[];
  /**
   * The tile pushed out of the box, or `null` when it was empty. Reported for
   * the screen-reader announcement — the state change is already implicit in
   * `value`, but a sighted learner sees the tile fly back and a blind one must
   * be told.
   */
  displaced: string | null;
}

/**
 * Place `tileId` into a box currently holding `current`.
 *
 * OCCUPIED-BOX RULE: the incoming tile wins and the resident tile RETURNS TO THE
 * POOL. Not a swap.
 *
 * A swap needs two boxes to exchange contents, but the incoming tile does not
 * always come from a box — it usually comes from the pool, which has no slot to
 * receive the displaced tile in return. So "swap" is undefined for the common
 * case and would need a second, different rule for it. Returning the resident
 * tile to the pool is the ONE rule that reads identically no matter where the
 * incoming tile came from, and it never destroys an answer: the displaced tile
 * is immediately available again, one square away.
 *
 * The alternative — reject the drop while the box is occupied — was rejected. It
 * makes the learner hunt for the remove control before they can correct a
 * mistake, and a drop that visibly lands and then silently does nothing is worse
 * than either.
 *
 * Re-placing the tile already in the box is a no-op that still reports
 * `displaced: null`: nothing left the box, so nothing returned to the pool.
 */
export function placeTile(current: string[], tileId: string): Placement {
  const resident = current[0] ?? null;
  if (resident === tileId) return { value: [tileId], displaced: null };
  return { value: [tileId], displaced: resident };
}

/**
 * Empty the box, returning its tile to the pool.
 *
 * `[]` rather than `['']`: an empty-string id matches no pool item, so grading
 * would mark the slot WRONG rather than unanswered, and a non-empty array would
 * satisfy the island's non-attempt guard — letting an untouched exercise be
 * submitted. Same rule `SelectRenderer` follows for its placeholder option.
 */
export function clearTile(): string[] {
  return [];
}
