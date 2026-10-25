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
import { isDropGap } from '@/lib/quizQuestionType';
import { deriveClozeGameSentences } from './clozeSentences';
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
 * (Verdadero o falso) and `openbox` (Caja sorpresa) are the Wordwall-style
 * "switch template" games added in batch 1, alongside the original
 * `cards`/`match`. `groupsort` ("Ordenar por grupos") is the big drag-each-
 * item-into-its-group board.
 */
export type GameMode =
  | 'quiz'
  | 'cards'
  | 'match'
  | 'reorder'
  | 'speak'
  | 'wheel'
  | 'anagram'
  | 'hangman'
  | 'truefalse'
  | 'openbox'
  | 'cloze'
  | 'groupsort';

/**
 * Game modes that carry their OWN "Comprobar"/check affordance, built right
 * into the game screen itself (`match`'s big board, its own
 * `matching-check` button; `reorder`'s own per-sentence check). The
 * page-level combined Comprobar (`ActivityPracticeIsland`'s footer, and
 * `QuizLivePreview`'s own editor preview) must never show a SECOND one next
 * to it — build item 2, "One Comprobar".
 */
export const SELF_CHECKING_GAME_MODES: ReadonlySet<GameMode> = new Set([
  'match',
  'reorder',
  'cloze',
  'groupsort',
]);

/** `cards` is worth flipping through from a single item. */
const MIN_CARDS_ITEMS = 1;

/**
 * `match` needs at least this many pairs — fewer makes the last pair a
 * guaranteed, un-losable match. Also `MatchPairsEditor.tsx`'s own
 * "more challenging" tip threshold (exported): the SAME bar for "worth
 * offering as an alternative to Básico" and for "comfortably challenging to
 * play" happens to coincide, so there is only the one constant.
 */
export const MIN_MATCH_ITEMS = 3;

/** `reorder` needs at least one sentence worth reordering. */
const MIN_REORDER_ITEMS = 1;

/** A sentence must have at least this many words to be worth reordering — a single word has nothing to reorder. Exported: `ReorderEditor.tsx`'s own hint/tip copy reuses this exact bar rather than re-stating "2" as a magic number. */
export const MIN_REORDER_WORDS = 2;

/** `speak` (Cartas) is worth dealing from a single item, same as `cards`. */
const MIN_SPEAK_ITEMS = 1;

/** `wheel` (Ruleta) needs at least two segments — one segment is not a spin. */
const MIN_WHEEL_ITEMS = 2;

/** `anagram`/`hangman` need only one eligible single-word answer to be worth offering. */
const MIN_ANAGRAM_ITEMS = 1;
const MIN_HANGMAN_ITEMS = 1;

/** `truefalse` needs at least two eligible statements — one is a guaranteed "verdadero". */
const MIN_TRUEFALSE_ITEMS = 2;

/** `openbox` (Caja sorpresa) needs at least two boxes — one box is not a grid. */
const MIN_OPENBOX_ITEMS = 2;

/** `cloze` needs at least one drag-and-drop gap to fill in. */
const MIN_CLOZE_ITEMS = 1;

/** `groupsort` needs at least this many groups — one group has nothing to sort against. Exported: `GroupSortEditor.tsx`'s own tip/footnote copy reuses this bar rather than a duplicate local constant. */
export const MIN_GROUPSORT_GROUPS = 2;

/** Each group needs at least this many items — a 1-item group is a guaranteed, un-missable match. Exported — the single source of truth `groupSort.ts`/`GroupSortEditor.tsx` both used to duplicate locally. */
export const MIN_GROUPSORT_ITEMS_PER_GROUP = 2;

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

/** Whitespace-separated word count in `text` — the simplest honest measure, blank-tolerant (`"".split(/\s+/)` would otherwise count as one). */
function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/** Items whose answer is a full SENTENCE (>= {@link MIN_REORDER_WORDS} words) — playable as `reorder` (drag the words back into order). */
export function reorderEligible(items: readonly GameItem[]): GameItem[] {
  return items.filter((item) => wordCount(item.answer) >= MIN_REORDER_WORDS);
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
 * How many of a payload's slots are drag-and-drop gaps (`cloze`'s own
 * eligibility test — every blank of a `template: 'cloze'` block is one such
 * slot, see `clozeSentences.ts`'s own header, but a plain Básico block with
 * a `drop`-type gap question is just as eligible, same as `reorder`'s own
 * "any long-enough answer qualifies" rule).
 */
function clozeEligibleCount(payload: Payload): number {
  return payload.slots.filter((slot) => isDropGap(slot.input)).length;
}

/**
 * `groupsort` ("Ordenar por grupos") models each GROUP as one slot: `label`
 * is the group's name, `input: 'group'` is its own mechanic discriminator
 * (unknown to the shared mechanic registry, so Básico degrades it to
 * `UnavailableRenderer` rather than breaking — see `QuizBlockPractice.tsx`'s
 * own header), and `answer` holds every item id that belongs in that group,
 * all drawn from ONE pool shared by the whole block (every group's items
 * together). This reuses `exercisePayload.ts`'s existing `Slot`/`Pool` shape
 * as-is — no new field anywhere — because `parseSlot` already accepts any
 * non-empty `input` string and already allows `answer` to carry more than
 * one id.
 */
function isGroupSortSlot(slot: Slot): boolean {
  return slot.input === 'group';
}

/** One group, as the editor/game/presentation/print all derive it from a quiz block's own slots. */
export interface GroupSortGroup {
  id: string;
  label: string;
  /** Every pool item id that belongs in this group, in authored order. */
  itemIds: string[];
}

/** Every authored group, in authored slot order. */
export function deriveGroupSortGroups(payload: Payload): GroupSortGroup[] {
  return payload.slots
    .filter(isGroupSortSlot)
    .map((slot) => ({ id: slot.id, label: slot.label, itemIds: slot.answer }));
}

/** The one pool name every group slot shares, or `undefined` for a block with no group yet. */
export function groupSortPoolName(payload: Payload): string | undefined {
  return payload.slots.find(isGroupSortSlot)?.pool;
}

/**
 * Is this block's content actually playable as `groupsort`? At least {@link
 * MIN_GROUPSORT_GROUPS} groups, EVERY ONE of them with at least {@link
 * MIN_GROUPSORT_ITEMS_PER_GROUP} items — a lone group, or a 1-item group,
 * would make sorting trivial or meaningless.
 */
function groupSortEligible(payload: Payload): boolean {
  const groups = deriveGroupSortGroups(payload);
  if (groups.length < MIN_GROUPSORT_GROUPS) return false;
  return groups.every((group) => group.itemIds.length >= MIN_GROUPSORT_ITEMS_PER_GROUP);
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
  if (reorderEligible(items).length >= MIN_REORDER_ITEMS) modes.push('reorder');
  if (items.length >= MIN_SPEAK_ITEMS) modes.push('speak');
  if (items.length >= MIN_WHEEL_ITEMS) modes.push('wheel');
  if (anagramEligible(items).length >= MIN_ANAGRAM_ITEMS) modes.push('anagram');
  if (hangmanEligible(items).length >= MIN_HANGMAN_ITEMS) modes.push('hangman');
  if (payload && trueFalseEligibleCount(payload) >= MIN_TRUEFALSE_ITEMS) modes.push('truefalse');
  if (items.length >= MIN_OPENBOX_ITEMS) modes.push('openbox');
  if (payload && clozeEligibleCount(payload) >= MIN_CLOZE_ITEMS) modes.push('cloze');
  if (payload && groupSortEligible(payload)) modes.push('groupsort');
  return modes;
}

/**
 * Locked modes whose gap to {@link availableGameModes} can be expressed as a
 * plain "how many more eligible items" shortfall — `nearestLockedMode`'s own
 * candidate list. `match` (blocked only by a duplicate answer, never fixed by
 * adding MORE items) and `groupsort` (needs GROUP-shaped content no plain
 * question ever creates) are excluded: more questions alone cannot close
 * either gap, so neither is ever a meaningful "agrega N preguntas más" hint.
 */
const UNLOCK_GAP_CANDIDATES: readonly GameMode[] = [
  'cards',
  'match',
  'reorder',
  'speak',
  'wheel',
  'anagram',
  'hangman',
  'truefalse',
  'openbox',
  'cloze',
];

/**
 * How many more eligible items `mode` needs to clear its own threshold in
 * {@link availableGameModes} — reusing that function's own constants and
 * eligibility helpers, never re-deriving them. `null` when `mode`'s gap
 * cannot be expressed this way (`match` blocked by a duplicate answer rather
 * than a count, or a mode needing `payload` that was not supplied).
 */
function unlockGapFor(mode: GameMode, items: readonly GameItem[], payload?: Payload): number | null {
  switch (mode) {
    case 'cards':
      return Math.max(0, MIN_CARDS_ITEMS - items.length);
    case 'match':
      return hasUniqueAnswers(items) ? Math.max(0, MIN_MATCH_ITEMS - items.length) : null;
    case 'reorder':
      return Math.max(0, MIN_REORDER_ITEMS - reorderEligible(items).length);
    case 'speak':
      return Math.max(0, MIN_SPEAK_ITEMS - items.length);
    case 'wheel':
      return Math.max(0, MIN_WHEEL_ITEMS - items.length);
    case 'anagram':
      return Math.max(0, MIN_ANAGRAM_ITEMS - anagramEligible(items).length);
    case 'hangman':
      return Math.max(0, MIN_HANGMAN_ITEMS - hangmanEligible(items).length);
    case 'truefalse':
      return payload ? Math.max(0, MIN_TRUEFALSE_ITEMS - trueFalseEligibleCount(payload)) : null;
    case 'openbox':
      return Math.max(0, MIN_OPENBOX_ITEMS - items.length);
    case 'cloze':
      return payload ? Math.max(0, MIN_CLOZE_ITEMS - clozeEligibleCount(payload)) : null;
    default:
      return null;
  }
}

/**
 * The still-locked mode closest to unlocking, with how many more eligible
 * questions would close that gap — `null` once every expressible mode is
 * already unlocked. Ties break by {@link UNLOCK_GAP_CANDIDATES}' own order
 * (the same order `availableGameModes` pushes modes in). Built for "Varios
 * juegos"' own status line (owner R3, "the status line tells what the
 * content unlocks") — it reuses `availableGameModes`'s own rules rather than
 * re-deriving them, so the two can never disagree about what is locked.
 */
export function nearestLockedMode(
  items: readonly GameItem[],
  payload?: Payload,
): { mode: GameMode; gap: number } | null {
  const unlocked = new Set(availableGameModes(items, payload));
  let best: { mode: GameMode; gap: number } | null = null;
  for (const mode of UNLOCK_GAP_CANDIDATES) {
    if (unlocked.has(mode)) continue;
    const gap = unlockGapFor(mode, items, payload);
    if (gap === null || gap <= 0) continue;
    if (!best || gap < best.gap) best = { mode, gap };
  }
  return best;
}

/**
 * ONE TEMPLATE, ONE GAME (owner spec 2026-10-08: "vamos a enfocarnos en que
 * cada opción de construcción cumpla un solo propósito y sea pulcro, no
 * combinemos"). While `false`, a TEMPLATED block (`match`/`reorder`/`cloze`/
 * `groupsort`) never offers the generic alternate games (cards/speak/wheel/
 * anagram/…) nor even plain "Básico" — it plays ONLY its own game,
 * everywhere (editor live preview, practice, full-screen focus mode,
 * presentation). "Básico" (`template === undefined`) is completely
 * untouched either way — every one of its games stays exactly as before.
 *
 * A single, clearly named switch rather than deleting the mode-switching
 * code (owner: "por el momento coméntalas"): flip this back to `true` to
 * restore the previous "any eligible mode" behaviour for every template —
 * `modesForBlock` below is the one and only place that reads it.
 */
export const TEMPLATE_GAME_SWITCHING_ENABLED = false;

/**
 * `groupsort`'s own additional restriction on top of {@link
 * availableGameModes} — unlike every OTHER template (`blocks.ts`'s own
 * `QuizTemplate` doc: "a template never restricts `availableGameModes`"),
 * because every other game mode here is built from `deriveGameItems`, which
 * collapses a slot down to ONE answer — for a `groupsort` block's own
 * GROUP slots that means just the group's FIRST item, silently dropping
 * every other item it holds. That is not a legitimate alternate way to
 * play a group-sort activity, it is a misleading, incomplete one (e.g.
 * "Anagrama" would scramble only the group's first item's letters,
 * completely unrelated to sorting) — so a `groupsort`-templated block is
 * restricted to `quiz` (Básico, itself degrading per group — see
 * `QuizBlockPractice.tsx`'s own header) and `groupsort` only. Every OTHER
 * template's modes are returned unchanged. Only reached while
 * {@link TEMPLATE_GAME_SWITCHING_ENABLED} is back on — see below.
 */
function modesForBlockWithSwitching(modes: readonly GameMode[], template: QuizTemplate | undefined): GameMode[] {
  if (template !== 'groupsort') return [...modes];
  return modes.filter((mode) => mode === 'quiz' || mode === 'groupsort');
}

/**
 * Does `template`'s own board actually have something to show RIGHT NOW —
 * the one "has-something-to-show" rule the editor's live preview, the
 * editor's own template stage, and the practice page all share (polish
 * batch T1 decision: "molded activity previews show the real board, never
 * the generic Básico layout"). Each case reads its own template's board at
 * the SAME granularity that board itself renders at — `match`/`reorder`
 * read `items` (`deriveGameItems`'s own output, one GameItem per slot);
 * `cloze`/`groupsort` read `payload` directly, the same raw shape their own
 * derivation helpers ({@link deriveClozeGameSentences}/{@link
 * deriveGroupSortGroups}) already take, never collapsed through
 * `deriveGameItems` (see {@link modesForBlockWithSwitching}'s own header on
 * why that collapse is lossy for `groupsort` specifically).
 *
 * Deliberately NOT the bar {@link availableGameModes} holds a mode to (e.g.
 * `match`'s own {@link MIN_MATCH_ITEMS} floor of 3 pairs — "is this worth
 * OFFERING as an alternative to Básico") — a molded block has no Básico to
 * fall back to in the first place (ONE TEMPLATE, ONE GAME), so it only ever
 * needs SOMETHING playable, never a minimum worth switching for.
 */
export function boardHasContent(template: QuizTemplate, items: readonly GameItem[], payload?: Payload): boolean {
  switch (template) {
    case 'match':
      return items.length > 0 && hasUniqueAnswers(items);
    case 'reorder':
      return reorderEligible(items).length > 0;
    case 'cloze':
      return payload !== undefined && deriveClozeGameSentences(payload).length > 0;
    case 'groupsort':
      return payload !== undefined && deriveGroupSortGroups(payload).length > 0;
  }
}

/**
 * Which modes a block actually OFFERS (and so, via `modes.length > 1`,
 * whether `QuizGameModeSwitcher` shows at all — `QuizBlockPractice.tsx`'s
 * own header) — gated by {@link TEMPLATE_GAME_SWITCHING_ENABLED}. `undefined`
 * (Básico) is always `[...modes]` unchanged, both ways, and never reads
 * `items`/`payload` at all. `items`/`payload` are read ONLY on the
 * ONE-TEMPLATE-ONE-GAME path below, through {@link boardHasContent} —
 * `modes` no longer gates that path at all (T1 follow-up: the old
 * `modes.includes(wanted)` check reused `availableGameModes`'s own "worth
 * offering" floor, which is why a templated block used to stay stuck on
 * Básico/the generic layout well after its own board already had something
 * to show).
 */
export function modesForBlock(
  modes: readonly GameMode[],
  template: QuizTemplate | undefined,
  items: readonly GameItem[],
  payload?: Payload,
): GameMode[] {
  if (!template || TEMPLATE_GAME_SWITCHING_ENABLED) return modesForBlockWithSwitching(modes, template);
  // ONE TEMPLATE, ONE GAME: collapse straight to the template's own wanted
  // mode (see {@link TEMPLATE_DEFAULT_MODE} below) as soon as its board has
  // something to show ({@link boardHasContent}) — falling back to `quiz`
  // alone (never a longer list) only while the board is still empty,
  // matching `initialGameMode`'s own fallback rather than rendering nothing.
  return boardHasContent(template, items, payload) ? [TEMPLATE_DEFAULT_MODE[template]] : ['quiz'];
}

/**
 * Which {@link GameMode} a template WANTS to start in — `'match'` for the
 * `'match'` template ("Une las parejas"), `'reorder'` for the `'reorder'`
 * template ("Reordenar"), `'cloze'` for `'cloze'` ("Completar la frase"),
 * `'groupsort'` for `'groupsort'` ("Ordenar por grupos"); `undefined`
 * ("Básico") wants `'quiz'`.
 */
const TEMPLATE_DEFAULT_MODE: Record<QuizTemplate, GameMode> = {
  match: 'match',
  reorder: 'reorder',
  cloze: 'cloze',
  groupsort: 'groupsort',
};

/**
 * A quiz block's own STARTING game mode (template plumbing, build item 2;
 * T1 follow-up, "molded previews show the real board"): the template's own
 * wanted mode (see {@link TEMPLATE_DEFAULT_MODE}) when {@link
 * modesForBlock} actually OFFERS it, else whatever that function offers
 * instead — `'quiz'` for Básico (`availableGameModes` always starts with
 * it) or for a templated block whose own board has nothing to show yet
 * ({@link boardHasContent}). Reuses `modesForBlock` rather than re-deriving
 * its own rule, so the two can never disagree about what a fresh render
 * should open in. A template never forces a mode the current content
 * cannot play, it only PREFERS one; the player can still switch away via
 * `QuizGameModeSwitcher` once practising (while {@link
 * TEMPLATE_GAME_SWITCHING_ENABLED}) — this only decides where a fresh
 * render starts.
 */
export function initialGameMode(
  template: QuizTemplate | undefined,
  items: readonly GameItem[],
  payload?: Payload,
): GameMode {
  const offered = modesForBlock(availableGameModes(items, payload), template, items, payload);
  const wanted = template ? TEMPLATE_DEFAULT_MODE[template] : undefined;
  return wanted && offered.includes(wanted) ? wanted : offered[0] ?? 'quiz';
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
