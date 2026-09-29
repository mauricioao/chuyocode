/**
 * gameModes — pure derivation of alternate GAMES ("Tarjetas"/flashcards,
 * "Parejas"/matching) from a quiz block's own slots (D1, "Una actividad,
 * muchos juegos" — Wordwall's "switch template"). A block's "Preguntas"
 * stays the single source of truth; every other mode is DERIVED from it
 * here, never authored separately, so switching modes can never lose or
 * duplicate a question and never needs the author to do anything extra.
 *
 * Zero I/O, zero React — same posture as `exerciseGrading.ts`: deterministic
 * and instant, so a mode switch never waits on anything.
 */
import { normalizeAnswer } from '@/lib/exerciseGrading';
import { splitLabelAtBlank, type Payload, type Slot } from '@/lib/exercisePayload';

/**
 * One playable game item, derived from a quiz slot — one question, one
 * accepted answer. `order-letters` and other alternate mechanics stay out of
 * scope for D1; only `quiz`/`cards`/`match` read this.
 */
export interface GameItem {
  id: string;
  /** The slot's label with its gap rendered as `____`, or the label itself when it has none. */
  prompt: string;
  /**
   * The slot's FIRST accepted answer, resolved to display text (a pool
   * item's `text`/`media` for a pool-backed slot, or the literal string for
   * a `text` slot).
   */
  answer: string;
  explanation?: string;
}

/** A playable mode for a quiz block. */
export type GameMode = 'quiz' | 'cards' | 'match';

/** `cards` is worth flipping through from a single item. */
const MIN_CARDS_ITEMS = 1;

/** `match` needs at least this many pairs — fewer makes the last pair a guaranteed, un-losable match. */
const MIN_MATCH_ITEMS = 3;

/**
 * Resolve one slot's FIRST accepted answer to display text.
 *
 * Same fallback chain as `moderationPreview.ts`'s `quizSlotAnswerSummary`
 * (pool item `text`, then `media`, then the raw id — never thrown, a
 * dangling pool reference degrades to the id itself), narrowed to the one
 * answer D1's games need instead of every accepted alternative.
 */
function resolveFirstAnswer(payload: Payload, slot: Slot): string {
  const answerId = slot.answer[0];
  if (answerId === undefined) return '';
  if (!slot.pool) return answerId;
  const pool = payload.pools[slot.pool] ?? [];
  const item = pool.find((candidate) => candidate.id === answerId);
  return item?.text ?? item?.media ?? answerId;
}

/** The slot's prompt: its label with the (one) gap swapped for a plain `____`, or the label as-is when it has none. */
function promptFor(slot: Slot): string {
  const parts = splitLabelAtBlank(slot.label);
  return parts ? `${parts.before}____${parts.after}` : slot.label;
}

/**
 * Derive every playable {@link GameItem} from a quiz block's slots, in
 * authored order. A slot with no accepted answer yet (a mid-drafting
 * `'draft'`-mode payload) is skipped — there is nothing yet to quiz, flip or
 * match it against.
 */
export function deriveGameItems(payload: Payload): GameItem[] {
  return payload.slots.flatMap((slot): GameItem[] => {
    if (slot.answer.length === 0) return [];
    const item: GameItem = { id: slot.id, prompt: promptFor(slot), answer: resolveFirstAnswer(payload, slot) };
    if (slot.explanation) item.explanation = slot.explanation;
    return [item];
  });
}

/**
 * Are every item's answers distinct, case-insensitively? `match` needs this:
 * two identical answers make that pair unpickable — either right-hand tile
 * would satisfy it.
 */
export function hasUniqueAnswers(items: readonly GameItem[]): boolean {
  const normalized = items.map((item) => normalizeAnswer(item.answer));
  return new Set(normalized).size === normalized.length;
}

/**
 * Which modes a block can offer, from its own derived items. `quiz` is
 * always first — the block's native, always-authored form — and `cards`/
 * `match` appear only once there is enough content to make them meaningful
 * (design brief, "the same questions ... can be played as different games").
 */
export function availableGameModes(items: readonly GameItem[]): GameMode[] {
  const modes: GameMode[] = ['quiz'];
  if (items.length >= MIN_CARDS_ITEMS) modes.push('cards');
  if (items.length >= MIN_MATCH_ITEMS && hasUniqueAnswers(items)) modes.push('match');
  return modes;
}

/**
 * A tiny seeded PRNG (mulberry32) — deterministic across renders and tests,
 * pulls in no dependency, plenty for shuffling a page's worth of tiles.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A small, stable numeric hash (FNV-1a) — turns a string (a block id, or a
 * block id plus a "reshuffle" counter) into a shuffle seed without pulling
 * in a dependency. Always a non-negative 32-bit integer.
 */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A deterministic Fisher-Yates shuffle: the same `items` plus the same
 * `seed` always produce the same order, so "Barajar"/the matching board's
 * right-hand column stay test-stable and reproducible from a bug report
 * while still varying from a fresh seed. Never mutates `items`.
 */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
