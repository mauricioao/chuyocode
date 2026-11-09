/**
 * `choose` template ("Elegir la respuesta") — the authoring round-trip, all
 * pure (no React, no I/O), same posture as `groupSort.ts`/`clozeSentences.ts`.
 * `chooseQuestion.ts` is the player's side of the same data.
 *
 * ONE QUESTION = ONE `row` BLOCK + ONE Básico multiple-choice `Slot`
 * (`chooseQuestion.ts`'s own header): `slot.label` is the sentence with its
 * `___` blanks, `input: 'choice'`, its OWN pool named `${slotId}-options`
 * (the same name `QuizBlockEditor`'s duplicate already gives a copied choice
 * question), `answer[0]` the correct option's id, and the optional
 * `explanation` ("¿Por qué?").
 *
 * THE FIRST OPTION IS THE CORRECT ONE (owner screen H): the author writes it
 * first, the player shuffles. Every option commit here rewrites the pool in
 * displayed order (correct first, see {@link deriveChooseRows}) and points
 * `answer[0]` at that first option, so `answer` can never drift away from
 * what the editor shows. A question always keeps between
 * {@link MIN_CHOOSE_OPTIONS} and {@link MAX_CHOOSE_OPTIONS} option fields;
 * an empty field is not an option yet (`deriveChooseQuestions` skips it).
 */
import { setPool, type Draft } from '../authoringDraft';
import type { PoolItem, RowBlock, Slot } from '../exercisePayload';

/** A question always shows at least this many option fields. */
export const MIN_CHOOSE_OPTIONS = 2;
/** At most this many option cards — four big cards still fit one row of the board. */
export const MAX_CHOOSE_OPTIONS = 4;

/** One option field, as the editor shows it. */
export interface ChooseOptionInput {
  id: string;
  text: string;
}

/** One question card, as the editor's whole view model. */
export interface ChooseQuestionRow {
  rowId: string;
  slotId: string;
  sentence: string;
  /** In display order: the correct option first. */
  options: ChooseOptionInput[];
  explanation: string;
}

/** What a new question starts with (the empty-list example's first keystroke, or a pasted line). */
export interface ChooseQuestionContent {
  sentence?: string;
  /** In order, the correct one first. Padded to {@link MIN_CHOOSE_OPTIONS}, cut at {@link MAX_CHOOSE_OPTIONS}. */
  options?: readonly string[];
}

function optionsPoolName(slotId: string): string {
  return `${slotId}-options`;
}

/** The slot's pool items in display order: the correct one (`answer[0]`) first, the rest as stored. */
function orderedItems(draft: Draft, slot: Slot): PoolItem[] {
  const items = slot.pool ? (draft.pools[slot.pool] ?? []) : [];
  const correct = items.find((item) => item.id === slot.answer[0]);
  return correct ? [correct, ...items.filter((item) => item !== correct)] : items;
}

/** Every question in authored (row) order. */
export function deriveChooseRows(draft: Draft): ChooseQuestionRow[] {
  return draft.blocks.flatMap((block): ChooseQuestionRow[] => {
    if (block.kind !== 'row') return [];
    const slot = draft.slots.find((s) => s.id === block.slotId);
    if (!slot) return [];
    return [
      {
        rowId: block.id,
        slotId: slot.id,
        sentence: slot.label,
        options: orderedItems(draft, slot).map((item) => ({ id: item.id, text: item.text ?? '' })),
        explanation: slot.explanation ?? '',
      },
    ];
  });
}

/** The option texts a new question starts with: padded to the minimum, cut at the maximum. */
function startingTexts(options: readonly string[] = []): string[] {
  const texts = options.slice(0, MAX_CHOOSE_OPTIONS);
  while (texts.length < MIN_CHOOSE_OPTIONS) texts.push('');
  return texts;
}

/**
 * Write `items` as `slotId`'s options, in this order: its own pool (named
 * `${slotId}-options` unless it already has one), `input: 'choice'`, and
 * `answer[0]` = the first item. The one place every option commit goes
 * through.
 */
function writeOptions(draft: Draft, slotId: string, items: PoolItem[]): Draft {
  const slot = draft.slots.find((s) => s.id === slotId);
  if (!slot) return draft;
  const poolName = slot.pool ?? optionsPoolName(slotId);
  const withPool = setPool(draft, poolName, items);
  const first = items[0];
  return {
    ...withPool,
    slots: withPool.slots.map((s) =>
      s.id === slotId ? { ...s, input: 'choice', pool: poolName, answer: first ? [first.id] : [] } : s,
    ),
  };
}

function newQuestion(rowId: string, slotId: string, mint: (prefix: string) => string, content: ChooseQuestionContent) {
  const items: PoolItem[] = startingTexts(content.options).map((text) => ({ id: mint('item'), text }));
  const slot: Slot = {
    id: slotId,
    label: content.sentence ?? '',
    input: 'choice',
    pool: optionsPoolName(slotId),
    answer: [items[0]!.id],
  };
  const row: RowBlock = { kind: 'row', id: rowId, slotId };
  return { row, slot, items };
}

/** Append a new question (row + choice slot + its own options pool). `mint` names its option items. */
export function addChooseQuestion(
  draft: Draft,
  rowId: string,
  slotId: string,
  mint: (prefix: string) => string,
  content: ChooseQuestionContent = {},
): Draft {
  const { row, slot, items } = newQuestion(rowId, slotId, mint, content);
  return {
    ...draft,
    blocks: [...draft.blocks, row],
    slots: [...draft.slots, slot],
    pools: { ...draft.pools, [slot.pool!]: items },
  };
}

/** Remove a question: its row, its slot, and the options pool only it uses. */
export function removeChooseQuestion(draft: Draft, rowId: string): Draft {
  const row = draft.blocks.find((b) => b.id === rowId);
  if (row?.kind !== 'row') return draft;
  const slot = draft.slots.find((s) => s.id === row.slotId);
  const pools = { ...draft.pools };
  if (slot?.pool) delete pools[slot.pool];
  return {
    ...draft,
    blocks: draft.blocks.filter((b) => b.id !== rowId),
    slots: draft.slots.filter((s) => s.id !== row.slotId),
    pools,
  };
}

function itemsOf(draft: Draft, slotId: string): PoolItem[] | null {
  const slot = draft.slots.find((s) => s.id === slotId);
  return slot ? orderedItems(draft, slot) : null;
}

/** Change one option's text (kept raw while typing; the player and the parser trim). */
export function setChooseOptionText(draft: Draft, slotId: string, itemId: string, text: string): Draft {
  const items = itemsOf(draft, slotId);
  if (!items) return draft;
  return writeOptions(
    draft,
    slotId,
    items.map((item) => (item.id === itemId ? { ...item, text } : item)),
  );
}

/** Append one empty option field — a no-op (same `draft`) once the question has {@link MAX_CHOOSE_OPTIONS}. */
export function addChooseOption(draft: Draft, slotId: string, mint: (prefix: string) => string): Draft {
  const items = itemsOf(draft, slotId);
  if (!items || items.length >= MAX_CHOOSE_OPTIONS) return draft;
  return writeOptions(draft, slotId, [...items, { id: mint('item'), text: '' }]);
}

/**
 * Remove one of the OTHER options — a no-op (same `draft`) for the correct
 * (first) option, or once only {@link MIN_CHOOSE_OPTIONS} are left.
 */
export function removeChooseOption(draft: Draft, slotId: string, itemId: string): Draft {
  const items = itemsOf(draft, slotId);
  if (!items || items.length <= MIN_CHOOSE_OPTIONS || items[0]?.id === itemId) return draft;
  if (!items.some((item) => item.id === itemId)) return draft;
  return writeOptions(
    draft,
    slotId,
    items.filter((item) => item.id !== itemId),
  );
}

/** A question with nothing typed in it yet — a paste may fill it instead of adding a new one after it. */
function isBlankQuestion(row: ChooseQuestionRow): boolean {
  return row.sentence.trim() === '' && row.options.every((option) => option.text.trim() === '');
}

/**
 * Bulk paste (owner spec N5, "paste a whole list"), the same "fill from the
 * focused row onward" rule `QuizBlockEditor`'s `insertRowsAfter` gives the
 * other templates: the question owning `fromSlotId` (`null` for the
 * empty-list example) is REUSED for the first pasted line while it is still
 * blank; every other line becomes a new question spliced right after it, in
 * order — never just appended at the end. One draft, so one commit upstream.
 */
export function pasteChooseRows(
  draft: Draft,
  fromSlotId: string | null,
  rows: readonly ChooseQuestionContent[],
  mint: (prefix: string) => string,
): Draft {
  if (rows.length === 0) return draft;
  let working = draft;
  let remaining = rows;
  let anchorRowId: string | null = null;

  const anchor = fromSlotId ? deriveChooseRows(working).find((row) => row.slotId === fromSlotId) : undefined;
  if (anchor) {
    anchorRowId = anchor.rowId;
    if (isBlankQuestion(anchor)) {
      const [first, ...rest] = remaining;
      working = {
        ...working,
        slots: working.slots.map((s) => (s.id === anchor.slotId ? { ...s, label: first!.sentence ?? '' } : s)),
      };
      working = writeOptions(
        working,
        anchor.slotId,
        startingTexts(first!.options).map((text) => ({ id: mint('item'), text })),
      );
      remaining = rest;
    }
  }

  if (remaining.length === 0) return working;

  const created = remaining.map((content) => newQuestion(mint('row'), mint('slot'), mint, content));
  const blocks = [...working.blocks];
  const spliceAt = anchorRowId ? blocks.findIndex((b) => b.id === anchorRowId) + 1 : blocks.length;
  blocks.splice(spliceAt, 0, ...created.map((q) => q.row));

  const pools = { ...working.pools };
  for (const q of created) pools[q.slot.pool!] = q.items;
  return { ...working, blocks, slots: [...working.slots, ...created.map((q) => q.slot)], pools };
}
