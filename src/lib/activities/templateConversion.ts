/**
 * "Cambiar de molde" (R2, `UX-INGLES.md` §11/§11.1, decision 3 of §8): a
 * teacher who wants a different game for content they already wrote never
 * retypes it — every quiz mold stores "a question with its answer" one way
 * or another, so switching molds is a RESHAPE of the same `Payload`, not a
 * blank slate. Pure, zero I/O, zero React — same posture as every other
 * module in this directory (`clozeSentences.ts`, `groupSort.ts`).
 *
 * THE FIVE MOLDS: `undefined` ("Varios juegos", the plain question list —
 * `QuizTemplate`'s own "Básico" predates this name) plus the four named
 * templates (`match`, `reorder`, `cloze`, `groupsort`). Every mold's content
 * is read/written through `authoringDraft.ts`'s `Draft` (the same `payload
 * <-> Draft` round trip `QuizBlockEditor.tsx` already uses), and the
 * `cloze`/`groupsort` pool names are derived from the block id with the
 * EXACT SAME convention `QuizBlockEditor.tsx` uses inline
 * (`` `${blockId}-cloze-pool` ``/`` `${blockId}-groupsort-pool` ``) — a
 * converted block's pool must land under the name the editor will look it
 * up by, or the freshly-converted content would render as empty.
 *
 * ONLY FOUR PAIRS HAVE A REAL MAPPING (§11.1's table):
 *
 *   - `undefined` <-> `match`: a pair IS a plain text question already (same
 *     underlying shape), so this direction is a reshape with nothing lost.
 *   - `reorder` <-> `cloze`: a sentence is a sentence either way; into
 *     `cloze` it lands as a still-bracket-less (0-blank) placeholder the
 *     author marks later, out of `cloze` it loses its brackets back to plain
 *     text (and any "extra words" that fit no blank, reported as dropped).
 *   - `groupsort` -> `match`: each item pairs with its own group's name
 *     ("cat" -> "Animals"), unconditionally.
 *   - `match` -> `groupsort`: only pairs that SHARE an answer with at least
 *     one other pair can form a group; a pair whose answer is unique has
 *     nowhere to land and is dropped.
 *
 * EVERY OTHER PAIR is "combinaciones sin sentido" (§11.1's own example:
 * "parejas -> oraciones") — there is no shape-preserving mapping, so
 * {@link conversionOptions} marks it unavailable with a reason key, and
 * {@link convertBlock} (if asked to perform it anyway) produces an EMPTY
 * block of the target mold and reports every original unit as dropped —
 * never silently losing text, even for a combination the UI never offers.
 *
 * EMPTY BLOCK, EVERY MOLD (§11.1 "Empty block -> every mold available"):
 * nothing to lose, so every target is offered and converts into an empty
 * block of that mold with nothing dropped.
 */
import type { QuizBlock, QuizTemplate, PromptImageRef } from './blocks';
import { createEmptyDraft, draftToPayload, payloadToDraft, type Draft } from '../authoringDraft';
import type { PoolItem } from '../exercisePayload';
import {
  applyClozeSentenceText,
  deriveClozeSentences,
  deriveDistractorsText,
  parseClozeText,
  plainSentence,
} from './clozeSentences';
import { deriveGroupSortRows } from './groupSort';

/** Every mold a quiz block can be authored as — `undefined` is "Varios juegos" ("Básico"). */
export type Mold = QuizTemplate | undefined;

/** The five molds, in the order they are offered (matches `BlockTypePicker.tsx`'s own gallery order). */
export const MOLDS: readonly Mold[] = [undefined, 'match', 'reorder', 'cloze', 'groupsort'];

/** Why a mold is not offered for this block's current content — a short key, not prose, so the UI owns the wording. */
export type ConversionReason = 'needs_sentences' | 'needs_repeated_answers' | 'not_supported';

export interface ConversionOption {
  template: Mold;
  available: boolean;
  /** This IS the block's own current mold — never shown as a choice, only as "Actual". */
  current: boolean;
  /** Present only when `available` is `false`. */
  reason?: ConversionReason;
}

/** One kind of content a conversion could not carry over, plus how many — `dropped: []` means nothing was lost. */
export interface DroppedItem {
  kind: 'options' | 'answers' | 'pairs' | 'words' | 'questions' | 'sentences' | 'groups' | 'images';
  count: number;
}

export interface ConversionResult {
  block: QuizBlock;
  dropped: DroppedItem[];
}

// ---------------------------------------------------------------------------
// Pool naming — MUST mirror QuizBlockEditor.tsx's own inline convention.
// ---------------------------------------------------------------------------

function clozePoolName(blockId: string): string {
  return `${blockId}-cloze-pool`;
}

function groupsortPoolName(blockId: string): string {
  return `${blockId}-groupsort-pool`;
}

// ---------------------------------------------------------------------------
// Counting a block's own content, by mold — used both for the "empty block"
// rule and for the drop-everything fallback's own reported count.
// ---------------------------------------------------------------------------

function rowCount(draft: Draft): number {
  return draft.blocks.filter((b) => b.kind === 'row').length;
}

function unitKind(from: Mold): DroppedItem['kind'] {
  switch (from) {
    case 'match':
      return 'pairs';
    case 'reorder':
      return 'sentences';
    case 'cloze':
      return 'sentences';
    case 'groupsort':
      return 'groups';
    default:
      return 'questions';
  }
}

function unitCount(draft: Draft, from: Mold, blockId: string): number {
  if (from === 'cloze') return deriveClozeSentences(draft).length;
  if (from === 'groupsort') return deriveGroupSortRows(draft, groupsortPoolName(blockId)).length;
  return rowCount(draft);
}

function isEmptySource(draft: Draft, from: Mold, blockId: string): boolean {
  return unitCount(draft, from, blockId) === 0;
}

// ---------------------------------------------------------------------------
// `match`'s own pairs, read generically off any plain text row — shared by
// `matchFromBasic`'s reverse (trivial) and by the `groupsort` rules below.
// ---------------------------------------------------------------------------

interface SimplePair {
  slotId: string;
  question: string;
  answer: string;
}

function matchPairsOf(draft: Draft): SimplePair[] {
  return draft.blocks.flatMap((b): SimplePair[] => {
    if (b.kind !== 'row') return [];
    const slot = draft.slots.find((s) => s.id === b.slotId);
    if (!slot) return [];
    return [{ slotId: slot.id, question: slot.label, answer: slot.answer[0] ?? '' }];
  });
}

/** `match` -> `groupsort` is only offered once at least one answer repeats (§11.1). */
function hasRepeatedMatchAnswers(draft: Draft): boolean {
  const counts = new Map<string, number>();
  for (const pair of matchPairsOf(draft)) {
    const answer = pair.answer.trim();
    if (!answer) continue;
    counts.set(answer, (counts.get(answer) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n >= 2);
}

// ---------------------------------------------------------------------------
// conversionOptions
// ---------------------------------------------------------------------------

function unavailableReason(from: Mold, to: Mold, draft: Draft): ConversionReason | undefined {
  // `undefined` ("Varios juegos") <-> `match`.
  if ((from === undefined && to === 'match') || (from === 'match' && to === undefined)) return undefined;
  // `reorder` <-> `cloze`.
  if ((from === 'reorder' && to === 'cloze') || (from === 'cloze' && to === 'reorder')) return undefined;
  // `groupsort` -> `match`, unconditional.
  if (from === 'groupsort' && to === 'match') return undefined;
  // `match` -> `groupsort`, conditional on at least one repeated answer.
  if (from === 'match' && to === 'groupsort') {
    return hasRepeatedMatchAnswers(draft) ? undefined : 'needs_repeated_answers';
  }
  // Every other pair: "combinaciones sin sentido" (§11.1).
  if (to === 'reorder' || to === 'cloze') return 'needs_sentences';
  return 'not_supported';
}

/**
 * For each of the five molds: whether it is offered for this block's CURRENT
 * content, which one is the block's own current mold, and — when not offered
 * — why (a short reason key the caller localizes). An empty block (nothing
 * to lose) offers every mold (§11.1).
 */
export function conversionOptions(block: QuizBlock): ConversionOption[] {
  const draft = payloadToDraft(block.payload);
  const from: Mold = block.template;
  const empty = isEmptySource(draft, from, block.id);

  return MOLDS.map((to): ConversionOption => {
    const current = to === from;
    if (current) return { template: to, available: true, current: true };
    if (empty) return { template: to, available: true, current: false };
    const reason = unavailableReason(from, to, draft);
    return reason === undefined
      ? { template: to, available: true, current: false }
      : { template: to, available: false, current: false, reason };
  });
}

// ---------------------------------------------------------------------------
// convertBlock — mints its own fresh, deterministic ids (no external
// generator; a pure function cannot touch `Date.now`/`Math.random` and still
// be `toEqual`-testable, same reasoning `authoringDraft.ts`'s own header
// gives for why ITS callers supply ids instead).
// ---------------------------------------------------------------------------

function mintFactory(blockId: string, to: Mold): (prefix: string) => string {
  let counter = 0;
  const label = to ?? 'basic';
  return (prefix: string): string => {
    counter += 1;
    return `${blockId}-conv-${label}-${prefix}-${counter}`;
  };
}

/**
 * Rebuild `block` for mold `to` from `draft` — never carries over the
 * ORIGINAL's own `promptImages` (question context images, owner decision
 * 2026-10-16) directly: every branch above either keeps the same slot ids
 * (a no-op, handled before this is ever called) or mints FRESH ones
 * (`mintFactory`), which would silently orphan a `promptImages` key keyed
 * by an id that no longer exists. {@link convertBlock}'s own
 * {@link preservePromptImages} step decides, AFTER this returns, whether
 * any of the original's images still apply and reports the rest as
 * `dropped` — never silently.
 */
function buildBlock(block: QuizBlock, to: Mold, draft: Draft): QuizBlock {
  const next: QuizBlock = { ...block, payload: draftToPayload(draft) };
  if (to) next.template = to;
  else delete next.template;
  delete next.promptImages;
  // Plantillas: fondo (owner decision 2026-10-23): a `background` is a
  // block-level field, not keyed by slot id — unlike `promptImages`, the
  // `...block` spread above already carries it over UNCHANGED across a
  // mold-to-mold switch ("Cambiar de molde... lo conservan", §b of the
  // proposal), no reshape needed. Only dropped when `to` is mold-less
  // (`undefined`, "Varios juegos") — `parseQuizBlock` only ever allows a
  // background on a molded block, so a background can never have reached
  // here in the first place unless `from` already had a template, meaning
  // this is the ONLY lossy direction. Silently, same as `template` itself
  // losing no `dropped` entry on this exact transition.
  if (!to) delete next.background;
  return next;
}

function splitWords(text: string): string[] {
  return text
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

function pushRow(draft: Draft, rowId: string, slot: Draft['slots'][number]): Draft {
  return {
    ...draft,
    blocks: [...draft.blocks, { kind: 'row', id: rowId, slotId: slot.id }],
    slots: [...draft.slots, slot],
  };
}

/** `undefined` ("Varios juegos") -> `match`: one pair per question, keeping only ONE answer per pair. */
function matchFromBasic(block: QuizBlock, draft: Draft, mint: (prefix: string) => string): ConversionResult {
  let droppedOptions = 0;
  let droppedAnswers = 0;
  let next: Draft = createEmptyDraft();

  for (const b of draft.blocks) {
    if (b.kind !== 'row') continue;
    const slot = draft.slots.find((s) => s.id === b.slotId);
    if (!slot) continue;

    let answer = '';
    if (slot.pool) {
      const pool = draft.pools[slot.pool] ?? [];
      const correctItem = pool.find((item) => slot.answer.includes(item.id));
      answer = correctItem?.text ?? '';
      droppedOptions += Math.max(0, pool.length - (correctItem ? 1 : 0));
    } else {
      answer = slot.answer[0] ?? '';
      droppedAnswers += Math.max(0, slot.answer.length - 1);
    }

    const rowId = mint('row');
    const slotId = mint('slot');
    const newSlot: Draft['slots'][number] = { id: slotId, label: slot.label, input: 'text', answer: answer ? [answer] : [] };
    if (slot.explanation) newSlot.explanation = slot.explanation;
    next = pushRow(next, rowId, newSlot);
  }

  const dropped: DroppedItem[] = [];
  if (droppedOptions > 0) dropped.push({ kind: 'options', count: droppedOptions });
  if (droppedAnswers > 0) dropped.push({ kind: 'answers', count: droppedAnswers });
  return { block: buildBlock(block, 'match', next), dropped };
}

/** `match` -> `undefined` ("Varios juegos"): a pair is ALREADY a plain text question — pure reshape, nothing lost. */
function basicFromMatch(block: QuizBlock, draft: Draft): ConversionResult {
  return { block: buildBlock(block, undefined, draft), dropped: [] };
}

/** `groupsort` -> `match`: every item pairs with its own group's name, unconditionally. */
function matchFromGroupsort(
  block: QuizBlock,
  draft: Draft,
  mint: (prefix: string) => string,
): ConversionResult {
  const groups = deriveGroupSortRows(draft, groupsortPoolName(block.id));
  let next: Draft = createEmptyDraft();

  for (const group of groups) {
    for (const item of group.items) {
      const rowId = mint('row');
      const slotId = mint('slot');
      const newSlot: Draft['slots'][number] = {
        id: slotId,
        label: item.text,
        input: 'text',
        answer: group.label ? [group.label] : [],
      };
      next = pushRow(next, rowId, newSlot);
    }
  }

  return { block: buildBlock(block, 'match', next), dropped: [] };
}

/** `match` -> `groupsort`: pairs sharing an answer form one group each; a pair whose answer is unique is dropped. */
function groupsortFromMatch(
  block: QuizBlock,
  draft: Draft,
  mint: (prefix: string) => string,
): ConversionResult {
  const pairs = matchPairsOf(draft);
  const byAnswer = new Map<string, SimplePair[]>();
  let blankAnswers = 0;

  for (const pair of pairs) {
    const answer = pair.answer.trim();
    if (!answer) {
      blankAnswers += 1;
      continue;
    }
    const members = byAnswer.get(answer) ?? [];
    members.push(pair);
    byAnswer.set(answer, members);
  }

  const poolName = groupsortPoolName(block.id);
  let next: Draft = createEmptyDraft();
  let droppedPairs = blankAnswers;

  for (const [answer, members] of byAnswer) {
    if (members.length < 2) {
      droppedPairs += members.length;
      continue;
    }
    const rowId = mint('row');
    const slotId = mint('slot');
    const items: PoolItem[] = members.map((m) => ({ id: mint('item'), text: m.question }));
    const groupSlot: Draft['slots'][number] = {
      id: slotId,
      label: answer,
      input: 'group',
      pool: poolName,
      answer: items.map((item) => item.id),
    };
    next = {
      ...pushRow(next, rowId, groupSlot),
      pools: { ...next.pools, [poolName]: [...(next.pools[poolName] ?? []), ...items] },
    };
  }

  const dropped: DroppedItem[] = [];
  if (droppedPairs > 0) dropped.push({ kind: 'pairs', count: droppedPairs });
  return { block: buildBlock(block, 'groupsort', next), dropped };
}

/** `reorder` -> `cloze`: every sentence lands as a still-bracket-less (0-blank) placeholder — nothing lost. */
function clozeFromReorder(
  block: QuizBlock,
  draft: Draft,
  mint: (prefix: string) => string,
): ConversionResult {
  const poolName = clozePoolName(block.id);
  let next: Draft = createEmptyDraft();
  let seq = 0;

  for (const b of draft.blocks) {
    if (b.kind !== 'row') continue;
    const slot = draft.slots.find((s) => s.id === b.slotId);
    if (!slot) continue;
    const text = slot.answer[0] ?? slot.label;
    next = applyClozeSentenceText(next, seq, text, poolName, mint);
    seq += 1;
  }

  return { block: buildBlock(block, 'cloze', next), dropped: [] };
}

/** `cloze` -> `reorder`: every sentence loses its brackets back to plain text; any "extra words" fitting no blank are dropped. */
function reorderFromCloze(
  block: QuizBlock,
  draft: Draft,
  mint: (prefix: string) => string,
): ConversionResult {
  const poolName = clozePoolName(block.id);
  const sentences = deriveClozeSentences(draft);
  let next: Draft = createEmptyDraft();

  for (const row of sentences) {
    const plain = plainSentence(parseClozeText(row.text));
    const rowId = mint('row');
    const slotId = mint('slot');
    const newSlot: Draft['slots'][number] = { id: slotId, label: plain, input: 'text', answer: plain ? [plain] : [] };
    next = pushRow(next, rowId, newSlot);
  }

  const distractorCount = splitWords(deriveDistractorsText(draft, poolName)).length;
  const dropped: DroppedItem[] = [];
  if (distractorCount > 0) dropped.push({ kind: 'words', count: distractorCount });
  return { block: buildBlock(block, 'reorder', next), dropped };
}

/** No shape-preserving mapping exists for this pair — produce an empty block of the target mold, reporting everything original as dropped. */
function dropAllFallback(block: QuizBlock, draft: Draft, to: Mold, from: Mold): ConversionResult {
  const count = unitCount(draft, from, block.id);
  const dropped: DroppedItem[] = count > 0 ? [{ kind: unitKind(from), count }] : [];
  return { block: buildBlock(block, to, createEmptyDraft()), dropped };
}

/**
 * Decide what happens to `original`'s own `promptImages` (question context
 * images) across a conversion to `to` — called AFTER every branch above has
 * already produced its own `result` (whose `block.promptImages` is always
 * absent, per {@link buildBlock}'s own header).
 *
 * Only `'undefined'` ("Varios juegos") actually SHOWS a promptImage
 * anywhere (the editor's own `VariosJuegosRow`, presentation, practice,
 * print, moderation) — every other mold's own authoring surface has no
 * such affordance — and only when the ORIGINAL's own slot ids survive the
 * conversion UNCHANGED can an old `promptImages` key still mean anything.
 * The one branch where BOTH hold is `match -> undefined`
 * ({@link basicFromMatch}, which reuses the original `draft`/ids verbatim,
 * never minting fresh ones) — every other `to === undefined` path
 * (`isEmptySource`'s own fallback, or a hypothetical future mapping) mints
 * fresh ids via `mintFactory` and so cannot preserve a prior key either.
 * Anything not carried over is reported in `dropped` (kind `'images'`),
 * never silently lost.
 */
function preservePromptImages(original: QuizBlock, result: ConversionResult, to: Mold, from: Mold): ConversionResult {
  const images = original.promptImages;
  if (!images) return result;
  const keys = Object.keys(images);
  if (keys.length === 0) return result;

  const idsPreserved = from === 'match' && to === undefined;
  if (to === undefined && idsPreserved) {
    const validSlotIds = new Set(result.block.payload.slots.map((slot) => slot.id));
    const kept: Record<string, PromptImageRef> = {};
    let lost = 0;
    for (const [slotId, image] of Object.entries(images)) {
      if (validSlotIds.has(slotId)) kept[slotId] = image;
      else lost += 1;
    }
    const block = Object.keys(kept).length > 0 ? { ...result.block, promptImages: kept } : result.block;
    const dropped = lost > 0 ? [...result.dropped, { kind: 'images' as const, count: lost }] : result.dropped;
    return { block, dropped };
  }

  return { block: result.block, dropped: [...result.dropped, { kind: 'images' as const, count: keys.length }] };
}

/**
 * Convert `block` to mold `to`, carrying over everything representable and
 * reporting everything else in `dropped` — never silently losing text. A
 * no-op (same mold) returns `block` unchanged. See this file's own header
 * for which pairs have a real mapping; every other pair falls back to
 * {@link dropAllFallback}. Any `promptImages` (question context images,
 * owner decision 2026-10-16) the original carried are handled separately,
 * AFTER the mold-specific reshape — see {@link preservePromptImages}.
 */
export function convertBlock(block: QuizBlock, to: Mold): ConversionResult {
  const from: Mold = block.template;
  if (to === from) return { block, dropped: [] };

  const draft = payloadToDraft(block.payload);
  const mint = mintFactory(block.id, to);

  let result: ConversionResult;
  if (isEmptySource(draft, from, block.id)) {
    result = { block: buildBlock(block, to, createEmptyDraft()), dropped: [] };
  } else if (from === undefined && to === 'match') {
    result = matchFromBasic(block, draft, mint);
  } else if (from === 'match' && to === undefined) {
    result = basicFromMatch(block, draft);
  } else if (from === 'groupsort' && to === 'match') {
    result = matchFromGroupsort(block, draft, mint);
  } else if (from === 'match' && to === 'groupsort') {
    result = groupsortFromMatch(block, draft, mint);
  } else if (from === 'reorder' && to === 'cloze') {
    result = clozeFromReorder(block, draft, mint);
  } else if (from === 'cloze' && to === 'reorder') {
    result = reorderFromCloze(block, draft, mint);
  } else {
    result = dropAllFallback(block, draft, to, from);
  }

  return preservePromptImages(block, result, to, from);
}
