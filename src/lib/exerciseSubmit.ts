/**
 * When an exercise may be submitted for grading — pure, no React.
 *
 * Lives beside `exerciseStepper.ts` and `exerciseDrop.ts` for the same reason:
 * the rule is a predicate over two plain values, and a predicate is trivial to
 * prove against a function and awkward to prove against a component. The island
 * then has one boolean to render instead of a rule to re-derive.
 *
 * THE RESOLVER IS INJECTED, NOT IMPORTED. Deciding whether a mechanic shipped
 * means asking the renderer registry, and the registry imports React components
 * — so importing it here would drag the whole mechanic tree into `src/lib`,
 * which is deliberately framework-free. Passing the resolver in is the same
 * pattern `check(payload, response, comparatorForRenderable)` already uses in
 * `exerciseGrading.ts`, and it is what lets these tests run with a one-line
 * fake instead of a DOM.
 */
import type { ExerciseResponse, Payload, Slot } from '@/lib/exercisePayload';

/**
 * Did this mechanic actually ship a renderer? Supplied by the caller.
 *
 * In production this is `rendererFor(input) !== null`. A slot answering `false`
 * was never DRAWN, so the learner could not have answered it.
 */
export type RenderableResolver = (input: string) => boolean;

/**
 * The slots the learner was actually OFFERED — those whose mechanic shipped.
 *
 * Same structural invariant `comparatorForRenderable` enforces for grading: a
 * slot we could not draw must not drive the UI either. Content and code deploy
 * through different pipelines, so an exercise WILL eventually reference a
 * mechanic this build does not have, and that slot has to fall out of every
 * rule rather than freeze the exercise.
 */
export function answerableSlots(
  payload: Payload,
  isRenderable: RenderableResolver,
): Slot[] {
  return payload.slots.filter((slot) => isRenderable(slot.input));
}

/**
 * Has this slot got a real answer behind it?
 *
 * An EMPTY ARRAY is not an answer. Renderers report `[]` for "nothing chosen"
 * — a cleared text field, a dropdown back on its placeholder, an empty drop box
 * — so length is the whole test. `TextRenderer` is explicit about never
 * reporting `['']` precisely so this stays true.
 */
export function isSlotAnswered(
  response: ExerciseResponse,
  slotId: string,
): boolean {
  return (response[slotId]?.length ?? 0) > 0;
}

/**
 * May the learner submit this exercise for grading?
 *
 * EVERY ANSWERABLE SLOT MUST BE ANSWERED — not just one.
 *
 * This replaces an earlier "at least one" rule. That rule let a learner press
 * Check after answering one question of five and be marked `Incorrect` on the
 * four they had simply not reached yet, which reads as a punishment for our own
 * pacing rather than as feedback. The stepper made it worse: the unanswered
 * slots are off screen, so the verdict arrived for questions the learner had
 * never even seen. Requiring all of them makes the button mean one thing —
 * "I have finished" — and keeps every `Incorrect` a real mistake.
 *
 * TWO GUARDS, AND THE SECOND ONE IS THE SUBTLE ONE:
 *
 *  1. `length > 0` — an exercise whose every mechanic is unshipped has NOTHING
 *     the learner could answer. `Array.prototype.every` is vacuously TRUE on an
 *     empty array, so without this line such an exercise would offer an enabled
 *     button that grades a payload nobody was shown.
 *  2. `every` — an unanswerable slot is skipped by {@link answerableSlots}
 *     before it gets here, so a slot whose mechanic never rendered can never
 *     block submission forever. That is the whole reason the gate is expressed
 *     over the OFFERED slots rather than over `payload.slots`.
 */
export function isSubmittable(
  payload: Payload,
  response: ExerciseResponse,
  isRenderable: RenderableResolver,
): boolean {
  const offered = answerableSlots(payload, isRenderable);
  if (offered.length === 0) return false;
  return offered.every((slot) => isSlotAnswered(response, slot.id));
}
