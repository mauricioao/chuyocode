/**
 * Exercise grading — ONE function, every mechanic (docs/exercise-model.md).
 *
 * Eight answer mechanics collapse onto a handful of comparators, which is the
 * whole reason adding a mechanic needs a renderer and not a migration. The
 * comparator is not the axis that grows; the renderer is.
 *
 * Zero I/O, zero React, fully deterministic — grading is stateless and instant
 * by design, so it runs on the client with the answer key in the payload. There
 * is no score to protect (docs/exercise-model.md, "Decisions worth remembering").
 *
 * Two invariants carry most of the weight here:
 *   1. Answers compare STABLE IDS, never array positions, so options can be
 *      shuffled on every render without silently failing a correct learner.
 *   2. Every slot grades INDEPENDENTLY, which is what lets one exercise mix
 *      mechanics — and what keeps an unshipped renderer from poisoning the rest.
 */
import type { ExerciseResponse, Payload, Slot } from './exercisePayload';

/** How a slot's response is compared against its accepted answers. */
export type Comparator = 'set' | 'text';

/**
 * Mechanic (`slot.input`) -> comparator. Reuse an existing comparator whenever
 * possible: this map staying much smaller than its own key set is the property
 * that keeps grading from branching once per mechanic.
 *
 * `sequence` (ordering) and `proximity` (hotspot) join this map with their
 * renderers; they are deliberately absent while no renderer exists.
 */
export const COMPARATORS: Record<string, Comparator> = {
  choice: 'set',
  select: 'set',
  text: 'text',
};

/** Resolve a mechanic's comparator, or `null` when the mechanic has not shipped. */
export function comparatorFor(input: string): Comparator | null {
  return COMPARATORS[input] ?? null;
}

/** Outcome for a single slot. `unavailable` means it could not be graded at all. */
export type SlotOutcome = 'correct' | 'incorrect' | 'unavailable';

/** Grading result: the headline verdict plus per-slot feedback. */
export interface GradeResult {
  /** True when every GRADEABLE slot is correct. Unavailable slots do not count. */
  correct: boolean;
  /** Outcome per slot id, for the post-answer feedback UI. */
  slots: Record<string, SlotOutcome>;
}

/**
 * Normalize a free-text answer: trim the edges and case-fold.
 *
 * Inner spacing is deliberately PRESERVED — collapsing it would make
 * `"is sitting"` and `"is  sitting"` indistinguishable, and a learner who
 * double-spaced deserves to know.
 */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

/** Set equality over ids: order-independent, duplicate-tolerant. */
function sameSet(expected: string[], given: string[]): boolean {
  const wanted = new Set(expected);
  const got = new Set(given);
  if (wanted.size !== got.size) return false;
  for (const id of wanted) {
    if (!got.has(id)) return false;
  }
  return true;
}

/**
 * Text match: `expected` is a list of ACCEPTED alternatives (`["sits", "is
 * sitting"]`), not a required set, so any one of them satisfies the slot.
 */
function matchesText(expected: string[], given: string[]): boolean {
  const answer = given[0];
  if (typeof answer !== 'string') return false;
  const normalized = normalizeAnswer(answer);
  return expected.some((candidate) => normalizeAnswer(candidate) === normalized);
}

/** Grade one slot with the comparator its mechanic declares. */
function gradeSlot(
  slot: Slot,
  given: string[],
  comparator: Comparator,
): SlotOutcome {
  const matched =
    comparator === 'text'
      ? matchesText(slot.answer, given)
      : sameSet(slot.answer, given);
  return matched ? 'correct' : 'incorrect';
}

/**
 * Grade a learner's `response` against a `payload`.
 *
 * A slot whose mechanic has no comparator is reported `unavailable` and
 * EXCLUDED from the verdict. Content and code deploy through different
 * pipelines and will drift, so an exercise authored for a renderer that has not
 * shipped must degrade that slot alone — penalizing the learner for our
 * deployment gap would be the worse bug.
 *
 * @param comparatorFn - Injected comparator resolver. Defaults to the shipped
 *   mechanic map; override it to grade against a narrower registry.
 */
export function check(
  payload: Payload,
  response: ExerciseResponse,
  comparatorFn: (input: string) => Comparator | null = comparatorFor,
): GradeResult {
  const slots: Record<string, SlotOutcome> = {};
  let correct = true;

  for (const slot of payload.slots) {
    const comparator = comparatorFn(slot.input);
    if (!comparator) {
      slots[slot.id] = 'unavailable';
      continue;
    }
    const outcome = gradeSlot(slot, response[slot.id] ?? [], comparator);
    slots[slot.id] = outcome;
    if (outcome !== 'correct') correct = false;
  }

  return { correct, slots };
}
