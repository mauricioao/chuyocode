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
 * registry.
 */
export interface Slot {
  id: string;
  label: string;
  /** Mechanic discriminator, e.g. `choice`. Unknown values degrade this slot only. */
  input: string;
  /** Name of the pool this slot draws from. Absent when the learner types. */
  pool?: string;
  /** Accepted answers: item ids, or literal strings for `text` slots. */
  answer: string[];
}

/**
 * Where a mechanic's item pool sits relative to the prompt it answers.
 *
 * PRESENTATION ONLY. Grading never sees this, and no comparator changes shape
 * because of it — it decides where the tiles are drawn, nothing else.
 */
export type PoolPlacement = 'bottom' | 'top' | 'left' | 'right';

/** The accepted values, in one place, so parsing and typing cannot drift. */
const POOL_PLACEMENTS: readonly string[] = ['bottom', 'top', 'left', 'right'];

/**
 * OPTIONAL per-exercise layout hints.
 *
 * Payload data rather than a column: it is an authoring choice that most
 * exercises will never make, and `jsonb` costs nothing for the ones that omit
 * it. A column would put a nullable enum on every row to describe a rare case,
 * and would need a migration the first time the shape grows a second hint.
 */
export interface Layout {
  pool: PoolPlacement;
}

/** The full render payload for one exercise. */
export interface Payload {
  media?: { audio?: string };
  pools: Record<string, Pool>;
  slots: Slot[];
  /** Absent unless the author overrode the derived default. */
  layout?: Layout;
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
 * Parse an optional {@link Layout}, or `null` for "derive the default".
 *
 * DEGRADES, NEVER REJECTS. A typo in an optional presentation hint must not turn
 * real, answerable content into a 404. Every exercise authored so far omits this
 * field entirely, and every one of them renders correctly from the derived
 * default, so "unreadable hint" and "no hint" can safely be the same outcome.
 *
 * Contrast {@link parseSlot}, which returns `null` and kills the whole payload:
 * a broken slot is UNGRADEABLE, so drawing it would lie to the learner. A broken
 * layout hint just means the tiles sit where they would have sat anyway.
 *
 * An unknown STRING is rejected rather than passed through. The value reaches a
 * lookup table of class names, and an unrecognised key there would render a pool
 * with no layout classes at all — a visibly broken exercise instead of a
 * default one.
 */
function parseLayout(value: unknown): Layout | null {
  if (!isRecord(value)) return null;
  const pool = value.pool;
  if (typeof pool !== 'string') return null;
  if (!POOL_PLACEMENTS.includes(pool)) return null;
  return { pool: pool as PoolPlacement };
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
  // Every other authored key is dropped here, deliberately. A slot is rebuilt
  // field by field rather than spread, so a key nothing reads cannot survive
  // the boundary and cannot be mistaken downstream for a feature that works.
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

  // Set only when USABLE, so `payload.layout` is absent — not present and
  // meaningless — for an exercise that omitted it AND for one that misspelled
  // it. `poolPlacement` then has one condition, not two.
  const layout = parseLayout(value.layout);
  if (layout) payload.layout = layout;

  return payload;
}

/**
 * Where this exercise's pool goes: the authored value, or a DERIVED default.
 *
 * Derived from the one fact the content already gives us — how many things there
 * are to answer:
 *
 *   1 slot   -> `bottom`. The sentence leads and the options sit under it, which
 *               is the reading order of every worksheet ever printed.
 *   2+ slots -> `top`. The pool is SHARED between slots, so it must be reachable
 *               from any of them; anchoring it above the prompt keeps it in one
 *               fixed place instead of moving as prompts of different heights
 *               come and go.
 *
 * `left` and `right` are deliberately EXPLICIT-ONLY. A side pool is only usable
 * when there is a large block on the other side to balance it, and nothing in
 * the payload tells us whether there is — an author can see that, a slot count
 * cannot. Guessing it would produce a column of tiles beside a six-word
 * sentence, which is worse than the default it replaced.
 *
 * A pure function of the payload, exactly like {@link hasAudio}: derived at
 * render time, never stored, so it cannot fall out of sync with the content.
 */
export function poolPlacement(payload: Payload): PoolPlacement {
  if (payload.layout) return payload.layout.pool;
  return payload.slots.length === 1 ? 'bottom' : 'top';
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
