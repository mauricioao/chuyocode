/**
 * quizQuestionType — the three author-facing question "types" the redesigned
 * Preguntas card editor shows, and the pure mapping between them and the
 * underlying `Slot.input` mechanic (`exercisePayload.ts`).
 *
 * The stored data model is NOT changed by this redesign (owner constraint):
 * a question is still exactly a `Slot` with `input` one of
 * `choice|select|text|drop`. This module exists only to give the UI a
 * friendlier three-way split —
 *
 *   'choice'  -> input 'choice'  (mark one option correct)
 *   'text'    -> input 'text'    (author types accepted answers directly)
 *   'gap'     -> input 'select' or 'drop' (a dropdown vs. draggable tiles
 *                toggle INSIDE the same segment, see {@link isDropGap})
 *
 * — and a single switch operation that PRESERVES the question text (always,
 * trivially — `label` is never touched here) and, where meaningful, the
 * options/answers already authored:
 *
 *   pooled <-> pooled (choice <-> gap, or toggling drop): the pool and its
 *     marked-correct answer survive untouched — only the mechanic string
 *     changes.
 *   pooled -> text: the correct option's own text (if it has one) becomes
 *     the sole accepted answer.
 *   text -> pooled: every non-blank accepted answer becomes a new option in
 *     a freshly named pool, the first one marked correct.
 *
 * Operates on the same `Draft` shape `authoringDraft.ts` already mutates,
 * reusing its own setters so this stays a thin recombination of already
 *-proven pure mutations rather than a second way to touch `slots`/`pools`.
 */
import type { Draft } from './authoringDraft';
import { setPool, setSlotAnswer, setSlotInput, setSlotPool } from './authoringDraft';
import type { PoolItem } from './exercisePayload';

/** The three author-facing segments the question-card type control offers. */
export type QuestionSegment = 'choice' | 'text' | 'gap';

/** Mechanics whose answer is one id drawn from a shared pool — same set `SlotAnswerEditor.tsx` already authors against. */
const POOLED_INPUTS: ReadonlySet<string> = new Set(['choice', 'select', 'drop']);

/** Which segment a slot's current `input` maps to. An unrecognized mechanic degrades to 'choice' — the segment whose shape (a pool + marked answer) is the closest fit, so switching away from it still has something to preserve. */
export function segmentForInput(input: string): QuestionSegment {
  if (input === 'text') return 'text';
  if (input === 'select' || input === 'drop') return 'gap';
  return 'choice';
}

/** Is this gap shown as draggable tiles (`drop`) rather than a dropdown (`select`)? Meaningless for a non-gap input, where it is always `false`. */
export function isDropGap(input: string): boolean {
  return input === 'drop';
}

function inputForSegment(segment: QuestionSegment, asDrop: boolean): string {
  if (segment === 'text') return 'text';
  if (segment === 'gap') return asDrop ? 'drop' : 'select';
  return 'choice';
}

/**
 * Switch one question's segment (and, for 'gap', its drop/dropdown flavor),
 * preserving the question text always and, where meaningful, its
 * options/answers — see this module's own header for the three preserve
 * cases. A no-op (returns `draft` unchanged) when the target shape is
 * already what the slot has, or the slot does not exist.
 *
 * `nextItemId` mints new pool-item ids on a text -> pooled switch — same
 * caller-supplies-ids rule `authoringDraft.ts`'s own header documents, so
 * this stays assertable with `toEqual` like every other pure mutation here.
 */
export function changeQuestionSegment(
  draft: Draft,
  slotId: string,
  segment: QuestionSegment,
  asDrop: boolean,
  nextItemId: () => string,
): Draft {
  const slot = draft.slots.find((s) => s.id === slotId);
  if (!slot) return draft;

  const nextInput = inputForSegment(segment, asDrop);
  if (nextInput === slot.input) return draft;

  const wasPooled = POOLED_INPUTS.has(slot.input);
  const willBePooled = POOLED_INPUTS.has(nextInput);

  if (wasPooled && willBePooled) {
    return setSlotInput(draft, slotId, nextInput);
  }

  if (wasPooled && !willBePooled) {
    const items: PoolItem[] = slot.pool ? (draft.pools[slot.pool] ?? []) : [];
    const correct = items.find((item) => item.id === slot.answer[0]);
    const nextAnswer = correct?.text?.trim() ? [correct.text.trim()] : [];
    let next = setSlotInput(draft, slotId, nextInput);
    next = setSlotPool(next, slotId, undefined);
    next = setSlotAnswer(next, slotId, nextAnswer);
    return next;
  }

  // !wasPooled && willBePooled (text -> choice/gap). text -> text is
  // impossible: it would mean `nextInput === slot.input`, already handled above.
  const poolName = slot.pool ?? `${slotId}-options`;
  const items: PoolItem[] = slot.answer
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text) => ({ id: nextItemId(), text }));
  let next = setSlotInput(draft, slotId, nextInput);
  next = setSlotPool(next, slotId, poolName);
  next = setPool(next, poolName, items);
  next = setSlotAnswer(next, slotId, items.length > 0 ? [items[0]!.id] : []);
  return next;
}
