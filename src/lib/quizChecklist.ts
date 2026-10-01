/**
 * quizChecklist — the "Listo para enviar" checklist a quiz block's redesigned
 * card editor shows in its header (owner build item 5): a compact, clickable
 * list of what still blocks a submit-ready quiz block, mirroring
 * `activities/blocks.ts`'s own `findIncompleteSlot` rules so the checklist
 * and the real `enviar.ts` rejection reason can never disagree about what
 * "complete" means for a question.
 *
 * Pure, zero I/O, works straight off the authoring `Draft` — no `Payload`
 * round-trip needed, since every rule here only reads `slots`/`pools`.
 */
import type { Draft } from './authoringDraft';
import type { PoolItem, Slot } from './exercisePayload';

/** Mechanics whose answer is one id drawn from a shared pool — same set `SlotAnswerEditor.tsx`/`blocks.ts` already use. */
const POOLED_INPUTS: ReadonlySet<string> = new Set(['choice', 'select', 'drop']);

export type ChecklistReason = 'quiz_no_answer' | 'quiz_too_few_options' | 'quiz_answer_not_in_pool';

/** One still-incomplete question, with its 1-based display position. */
export interface ChecklistItem {
  slotId: string;
  /** 1-based position in `draft.blocks`' question order — matches the number the card itself shows. */
  index: number;
  reason: ChecklistReason;
}

function incompleteReason(slot: Slot, pools: Record<string, PoolItem[] | undefined>): ChecklistReason | null {
  if (slot.answer.length === 0) return 'quiz_no_answer';
  if (slot.pool !== undefined) {
    const items = pools[slot.pool] ?? [];
    if (POOLED_INPUTS.has(slot.input) && items.length < 2) return 'quiz_too_few_options';
    const ids = new Set(items.map((item) => item.id));
    if (!slot.answer.every((answer) => ids.has(answer))) return 'quiz_answer_not_in_pool';
  }
  return null;
}

/**
 * Every question still missing what `'submit'` mode requires, in question
 * (card) order — a quiz block with zero questions yields `[]`, same as a
 * fully complete one; the empty-list case is distinguished by the caller
 * (there are no cards to point to either way).
 */
export function listIncompleteQuestions(draft: Draft): ChecklistItem[] {
  const questionOrder = draft.blocks.flatMap((block) => (block.kind === 'row' ? [block.slotId] : []));
  const items: ChecklistItem[] = [];
  questionOrder.forEach((slotId, i) => {
    const slot = draft.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const reason = incompleteReason(slot, draft.pools);
    if (reason) items.push({ slotId, index: i + 1, reason });
  });
  return items;
}
