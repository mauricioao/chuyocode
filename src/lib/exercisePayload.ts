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

/**
 * An OPTIONAL countdown for the whole exercise.
 *
 * Payload data, not a column: a time limit is an authoring choice per exercise,
 * and the overwhelming majority of exercises will never carry one. A column
 * would put a nullable integer on every row to describe a rare case, and would
 * need a migration the first time the shape grows (a grace period, a per-slot
 * limit). `jsonb` costs nothing for the exercises that omit it.
 *
 * EXERCISE-LEVEL, never slot-level. Slots grade independently but they are
 * answered together, and a per-slot clock would mean several countdowns racing
 * on one page with nothing to tell the learner which one is about to fire.
 */
export interface Timer {
  /** Whole seconds, always >= 1. See {@link parsePayload}. */
  seconds: number;
}

/** The full render payload for one exercise. */
export interface Payload {
  media?: { audio?: string };
  pools: Record<string, Pool>;
  slots: Slot[];
  /** Absent on almost every exercise, and absence is the normal case. */
  timer?: Timer;
}

/** A learner's answers, keyed by slot id. Always an array, even for one value. */
export type ExerciseResponse = Record<string, string[]>;

/** The authored text on either side of a slot's blank. */
export interface LabelParts {
  /** Text before the blank. Empty when the label opens with the gap. */
  before: string;
  /** Text after the blank. Empty when the label ends with the gap. */
  after: string;
}

/**
 * The blank marker: a RUN of three or more underscores.
 *
 * Not "exactly three". Authors stretch the gap to hint at answer length
 * (`_____`), and under a strict three-underscore rule those labels would fall
 * back to the stacked layout with raw underscores left on screen — a failure
 * that throws nothing, logs nothing and is only visible in a browser.
 *
 * Three is still the FLOOR, so the marker cannot collide with ordinary content:
 * `snake_case` and `user_name` use single underscores between letters, and
 * `__dunder__` uses two. Both stay literal text.
 */
const BLANK_MARKER = /_{3,}/;

/**
 * Split a slot label at its blank, or `null` when it has none.
 *
 * `null` rather than `{ before: label, after: '' }` on purpose: "there is no
 * gap here" is a real authoring style (`"What did she say?"`), not a degenerate
 * split. Returning parts anyway would let a renderer splice its control onto the
 * end of a sentence that never asked for one, and nothing would report it.
 *
 * ONE blank per slot. A slot carries exactly one `answer`, so a second gap has
 * nothing to grade against; supporting N blanks needs an answer per blank, which
 * is a model change (docs/exercise-model.md, "Authoring rules"). Later markers
 * are therefore left as LITERAL text — visible to the author, instead of
 * silently swallowed.
 *
 * Zero I/O, no allocation beyond the two slices.
 */
export function splitLabelAtBlank(label: string): LabelParts | null {
  const match = BLANK_MARKER.exec(label);
  if (!match) return null;
  return {
    before: label.slice(0, match.index),
    after: label.slice(match.index + match[0].length),
  };
}

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
 * Parse an optional {@link Timer}, or `null` for "this exercise is untimed".
 *
 * DEGRADES, NEVER REJECTS. A malformed timer must not take the exercise down
 * with it: everything else in the payload is still perfectly answerable, and an
 * untimed exercise is a complete, correct experience — it is what every exercise
 * authored so far already is. Failing the whole payload here would turn a typo
 * in an optional field into a 404 on real content.
 *
 * That is the opposite of {@link parseSlot}, which returns `null` and kills the
 * payload — and the asymmetry is the point. A broken slot is UNGRADEABLE, so
 * rendering it would lie to the learner. A broken timer just means no clock.
 *
 * `seconds < 1` is rejected rather than clamped. A zero-second timer would fire
 * on mount and grade the exercise before the learner had read the first word —
 * an exercise nobody can answer. Silently dropping to "untimed" is strictly
 * better than shipping that. Fractions are floored first, so `0.4` is a zero and
 * is rejected on the same rule rather than by a separate one.
 */
function parseTimer(value: unknown): Timer | null {
  if (!isRecord(value)) return null;
  const raw = value.seconds;
  // `Number.isFinite` also rejects `NaN` and both infinities, each of which
  // would otherwise produce a countdown that never reaches zero.
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const seconds = Math.floor(raw);
  if (seconds < 1) return null;
  return { seconds };
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

  // Set only when usable, so `payload.timer` is absent — not present and
  // meaningless — for both an untimed exercise and a malformed one. The island
  // then has ONE condition to check instead of two.
  const timer = parseTimer(value.timer);
  if (timer) payload.timer = timer;

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
