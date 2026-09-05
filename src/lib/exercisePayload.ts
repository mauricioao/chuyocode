/**
 * Exercise payload contract — three concepts, and that is the whole model
 * (docs/exercise-model.md, "Payload shape").
 *
 *   media  the stimulus the learner perceives (optional; audio makes it "listening")
 *   pools  named sets of selectable items, SHARED across slots
 *   slots  the things to answer, each carrying its own `answer`
 *
 * The answer is nested INSIDE the slot on purpose. An earlier draft kept a
 * separate `key: { slotId: [...] }` map, which allows a key entry whose id
 * matches no slot — an exercise that looks gradeable but silently is not.
 * Nesting removes that entire class of bug.
 *
 * Zero I/O. `payload` reaches us as raw `jsonb`, so {@link parsePayload} is the
 * one gate that turns `unknown` into something a renderer may trust.
 */

/**
 * A selectable option. `text` for words, `media` for an image URL — a pool item
 * may carry either. The `id` is the only field grading ever compares, and a
 * published id is PERMANENT.
 */
export interface PoolItem {
  id: string;
  text?: string;
  media?: string;
}

/** A named set of selectable items, referenced by one or more slots. */
export type Pool = PoolItem[];

/**
 * One thing to answer. `input` is the mechanic discriminator matched against the
 * registry; `ordered` switches this slot to the `sequence` comparator.
 */
export interface Slot {
  id: string;
  label: string;
  /** Mechanic discriminator, e.g. `choice`. Unknown values degrade this slot only. */
  input: string;
  /** Name of the pool this slot draws from. Absent when the learner types. */
  pool?: string;
  ordered?: boolean;
  /** Accepted answers: item ids, or literal strings for `text` slots. */
  answer: string[];
}

/** The full render payload for one exercise. */
export interface Payload {
  media?: { audio?: string };
  pools: Record<string, Pool>;
  slots: Slot[];
}

/** A learner's answers, keyed by slot id. Always an array, even for one value. */
export type ExerciseResponse = Record<string, string[]>;

/** Narrow `unknown` to a plain object without trusting its keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep only well-formed `{ id, text?, media? }` entries; drop the rest. */
function parsePool(value: unknown): Pool {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): PoolItem[] => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
      return [];
    }
    const item: PoolItem = { id: raw.id };
    if (typeof raw.text === 'string') item.text = raw.text;
    if (typeof raw.media === 'string') item.media = raw.media;
    return [item];
  });
}

/**
 * Parse a slot, or `null` if it could never be graded.
 *
 * An UNKNOWN `input` is deliberately accepted: content and code deploy through
 * different pipelines and will drift, so an exercise authored for a renderer
 * that has not shipped yet must degrade at dispatch — not be rejected here.
 */
function parseSlot(value: unknown): Slot | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.input !== 'string' || value.input.length === 0) return null;

  const answer = Array.isArray(value.answer)
    ? value.answer.filter((a): a is string => typeof a === 'string')
    : [];
  // A slot with no accepted answer is an ungradeable exercise, not a valid one.
  if (answer.length === 0) return null;

  const slot: Slot = {
    id: value.id,
    label: typeof value.label === 'string' ? value.label : '',
    input: value.input,
    answer,
  };
  if (typeof value.pool === 'string') slot.pool = value.pool;
  if (value.ordered === true) slot.ordered = true;
  return slot;
}

/**
 * Validate raw `jsonb` into a {@link Payload}, or `null` when it is unusable.
 *
 * FAIL-SAFE by design: the caller turns `null` into a 404. Every rejection here
 * is a payload no renderer could have drawn and no comparator could have
 * graded, so failing at the boundary beats failing mid-render.
 */
export function parsePayload(value: unknown): Payload | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.slots) || value.slots.length === 0) return null;

  const slots: Slot[] = [];
  for (const raw of value.slots) {
    const slot = parseSlot(raw);
    if (!slot) return null;
    slots.push(slot);
  }

  const pools: Record<string, Pool> = {};
  if (isRecord(value.pools)) {
    for (const [name, raw] of Object.entries(value.pools)) {
      pools[name] = parsePool(raw);
    }
  }

  const payload: Payload = { pools, slots };
  if (isRecord(value.media) && typeof value.media.audio === 'string') {
    payload.media = { audio: value.media.audio };
  }
  return payload;
}

/**
 * Is this exercise playable as listening? Derived from the row we ALREADY have
 * — never an HTTP request. Forty listening cards must not mean forty HEAD
 * requests before the page paints (docs/exercise-model.md, "Media availability").
 */
export function hasAudio(payload: Payload): boolean {
  return (payload.media?.audio ?? '').length > 0;
}

/**
 * The items a slot offers, or `[]` when it has no pool (the learner types) or
 * names a pool that does not exist. Never throws: a dangling pool reference
 * degrades one slot, it does not take the page down.
 */
export function getSlotItems(payload: Payload, slot: Slot): PoolItem[] {
  if (!slot.pool) return [];
  return payload.pools[slot.pool] ?? [];
}
