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
import type { QuizTemplate } from './blocks';

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

/**
 * A playable mode for a quiz block. `speak` (Cartas/speaking cards), `wheel`
 * (Ruleta), `anagram` (Anagrama), `hangman` (Ahorcado), `truefalse`
 * (Verdadero o falso) and `openbox` (Abre la caja) are the Wordwall-style
 * "switch template" games added in batch 1, alongside the original
 * `cards`/`match`.
 */
export type GameMode = 'quiz' | 'cards' | 'match' | 'speak' | 'wheel' | 'anagram' | 'hangman' | 'truefalse' | 'openbox';

/**
 * Game modes that carry their OWN "Comprobar"/check affordance, built right
 * into the game screen itself (today: `match`'s big board, its own
 * `matching-check` button). The page-level combined Comprobar
 * (`ActivityPracticeIsland`'s footer, and `QuizLivePreview`'s own editor
 * preview) must never show a SECOND one next to it — build item 2, "One
 * Comprobar". Growing this set is the ONLY step a future self-checking
 * template (`reorder`, `cloze`, `groupsort` — see `QuizTemplate`) needs to
 * plug into that rule.
 */
export const SELF_CHECKING_GAME_MODES: ReadonlySet<GameMode> = new Set(['match']);

/** `cards` is worth flipping through from a single item. */
const MIN_CARDS_ITEMS = 1;

/** `match` needs at least this many pairs — fewer makes the last pair a guaranteed, un-losable match. */
const MIN_MATCH_ITEMS = 3;

/** `speak` (Cartas) is worth dealing from a single item, same as `cards`. */
const MIN_SPEAK_ITEMS = 1;

/** `wheel` (Ruleta) needs at least two segments — one segment is not a spin. */
const MIN_WHEEL_ITEMS = 2;

/** `anagram`/`hangman` need only one eligible single-word answer to be worth offering. */
const MIN_ANAGRAM_ITEMS = 1;
const MIN_HANGMAN_ITEMS = 1;

/** `truefalse` needs at least two eligible statements — one is a guaranteed "verdadero". */
const MIN_TRUEFALSE_ITEMS = 2;

/** `openbox` (Abre la caja) needs at least two boxes — one box is not a grid. */
const MIN_OPENBOX_ITEMS = 2;

/** `anagram` tiles stay readable and quick to solve within this letter-count range. */
const ANAGRAM_MIN_LEN = 3;
const ANAGRAM_MAX_LEN = 12;

/** `hangman` allows slightly longer words than `anagram` — no tile grid to keep compact. */
const HANGMAN_MIN_LEN = 3;
const HANGMAN_MAX_LEN = 14;

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
 * A single word, letters-only (no spaces, digits or punctuation), whose
 * length falls in `[min, max]` — what `anagram`/`hangman` need from an
 * answer to be playable as tiles or a guessed word.
 */
export function isSingleWord(answer: string, min: number, max: number): boolean {
  const trimmed = answer.trim();
  return /^[A-Za-z]+$/.test(trimmed) && trimmed.length >= min && trimmed.length <= max;
}

/** Items whose answer is playable as an `anagram` (letters shuffled into tiles). */
export function anagramEligible(items: readonly GameItem[]): GameItem[] {
  return items.filter((item) => isSingleWord(item.answer, ANAGRAM_MIN_LEN, ANAGRAM_MAX_LEN));
}

/** Items whose answer is playable as a `hangman` word. */
export function hangmanEligible(items: readonly GameItem[]): GameItem[] {
  return items.filter((item) => isSingleWord(item.answer, HANGMAN_MIN_LEN, HANGMAN_MAX_LEN));
}

/** One `truefalse` statement: a slot's prompt with its gap filled by either its correct answer or a wrong pool option. */
export interface TrueFalseItem {
  id: string;
  statement: string;
  isTrue: boolean;
}

/** A pool's own display texts (same fallback chain as {@link resolveFirstAnswer}), skipping any item with neither. */
function poolOptionTexts(payload: Payload, poolName: string): string[] {
  const pool = payload.pools[poolName] ?? [];
  return pool.map((item) => item.text ?? item.media).filter((value): value is string => Boolean(value));
}

/** A slot's pool options other than its own correct answer — the candidates for a "falso" filler. */
function wrongOptionsFor(payload: Payload, slot: Slot, correctAnswer: string): string[] {
  if (!slot.pool) return [];
  return poolOptionTexts(payload, slot.pool).filter(
    (text) => normalizeAnswer(text) !== normalizeAnswer(correctAnswer),
  );
}

/**
 * A slot is playable as `truefalse` only when it has a gap to fill (the
 * statement IS the label with the gap filled — nothing to fill in a
 * gap-less label) AND at least one pool option other than the correct
 * answer to offer as a "falso" filler.
 */
function eligibleForTrueFalse(payload: Payload, slot: Slot): boolean {
  if (slot.answer.length === 0 || !slot.pool) return false;
  if (!splitLabelAtBlank(slot.label)) return false;
  return wrongOptionsFor(payload, slot, resolveFirstAnswer(payload, slot)).length > 0;
}

/** How many of a payload's slots are eligible for `truefalse` — `availableGameModes`'s own check, independent of any seed. */
export function trueFalseEligibleCount(payload: Payload): number {
  return payload.slots.filter((slot) => eligibleForTrueFalse(payload, slot)).length;
}

/**
 * Derive every playable {@link TrueFalseItem}, one per eligible slot, in
 * authored order. Each statement is seeded 50/50 between its correct answer
 * (a true statement) and a random wrong pool option (a false one) — the SAME
 * `seed` always reproduces the same set of statements, matching every other
 * seeded derivation in this module.
 */
export function deriveTrueFalseItems(payload: Payload, seed: number): TrueFalseItem[] {
  const random = mulberry32(seed);
  return payload.slots.flatMap((slot): TrueFalseItem[] => {
    if (!eligibleForTrueFalse(payload, slot)) return [];
    const correctAnswer = resolveFirstAnswer(payload, slot);
    const wrongOptions = wrongOptionsFor(payload, slot, correctAnswer);
    const isTrue = random() < 0.5;
    const filler = isTrue ? correctAnswer : wrongOptions[Math.floor(random() * wrongOptions.length)]!;
    const parts = splitLabelAtBlank(slot.label)!;
    return [{ id: slot.id, statement: `${parts.before}${filler}${parts.after}`, isTrue }];
  });
}

/**
 * Which modes a block can offer, from its own derived items. `quiz` is
 * always first — the block's native, always-authored form — and every other
 * mode appears only once there is enough eligible content to make it
 * meaningful (design brief, "the same questions ... can be played as
 * different games"). `payload` is optional and only needed for `truefalse`
 * (the one mode that reads pool data `GameItem` alone does not carry) — a
 * caller that only has `items` still gets every other mode's availability.
 */
export function availableGameModes(items: readonly GameItem[], payload?: Payload): GameMode[] {
  const modes: GameMode[] = ['quiz'];
  if (items.length >= MIN_CARDS_ITEMS) modes.push('cards');
  if (items.length >= MIN_MATCH_ITEMS && hasUniqueAnswers(items)) modes.push('match');
  if (items.length >= MIN_SPEAK_ITEMS) modes.push('speak');
  if (items.length >= MIN_WHEEL_ITEMS) modes.push('wheel');
  if (anagramEligible(items).length >= MIN_ANAGRAM_ITEMS) modes.push('anagram');
  if (hangmanEligible(items).length >= MIN_HANGMAN_ITEMS) modes.push('hangman');
  if (payload && trueFalseEligibleCount(payload) >= MIN_TRUEFALSE_ITEMS) modes.push('truefalse');
  if (items.length >= MIN_OPENBOX_ITEMS) modes.push('openbox');
  return modes;
}

/**
 * Which {@link GameMode} a template WANTS to start in — `'match'` for the
 * `'match'` template ("Une las parejas"); the other template names have no
 * shipped game yet, so they (and `undefined`, "Básico") want `'quiz'`.
 */
const TEMPLATE_DEFAULT_MODE: Record<QuizTemplate, GameMode> = {
  match: 'match',
  reorder: 'quiz',
  cloze: 'quiz',
  groupsort: 'quiz',
};

/**
 * A quiz block's own STARTING game mode (template plumbing, build item 2):
 * the template's wanted mode (see {@link TEMPLATE_DEFAULT_MODE}) when the
 * caller is actually eligible for it right now, `'quiz'` otherwise — a
 * template never forces a mode the current content cannot play (e.g. fewer
 * than `MIN_MATCH_ITEMS` unique answers), it only PREFERS one. The player
 * can still switch away via `QuizGameModeSwitcher` once practising; this
 * only decides where a fresh render starts.
 */
export function initialGameMode(
  template: QuizTemplate | undefined,
  items: readonly GameItem[],
  payload?: Payload,
): GameMode {
  if (!template) return 'quiz';
  const wanted = TEMPLATE_DEFAULT_MODE[template];
  if (wanted === 'quiz') return 'quiz';
  return availableGameModes(items, payload).includes(wanted) ? wanted : 'quiz';
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
