/**
 * Stopwatch state for an exercise — pure, no React, no `setInterval`.
 *
 * The island owns the interval; this module owns every DECISION the interval
 * makes. That split exists because a clock buried in an effect is only testable
 * by advancing fake timers through a rendered component, where a wrong stop
 * condition or an off-by-one boundary is invisible under the noise of React's
 * scheduling. Here each rule is one function over one value.
 *
 * IT MEASURES, IT DOES NOT LIMIT. There is nothing to configure and nothing to
 * author: every exercise gets the same clock, it starts at zero when the
 * exercise is ready to be answered, and it reports how long the learner took.
 * The countdown this replaced was the opposite — an authored budget that ended
 * the exercise by itself — and none of its rules survive the inversion, which is
 * why this is a reshaped module rather than a second one beside it.
 *
 * Zero I/O. Nothing here reads a clock: real time enters only as "another tick
 * happened", which is what makes the whole thing deterministic.
 */
import type { GradeResult } from './exerciseGrading';

/** Milliseconds between ticks. One second — the unit the learner is shown. */
export const TICK_MS = 1000;

/**
 * Where every attempt begins, and where a fresh attempt returns to.
 *
 * A named constant rather than a bare `0` because two places must agree on it —
 * the initial state and the reset on retry — and "the stopwatch starts at zero"
 * is a rule, not a coincidence of two literals.
 */
export const START_SECONDS = 0;

/**
 * One more second on the clock.
 *
 * No ceiling. A learner who leaves the tab open for an hour genuinely took an
 * hour, and `60:00` is the honest reading; capping it would invent a maximum
 * that nothing else in the product enforces. A backgrounded tab that flushes
 * queued intervals on return simply catches the display up to the time that
 * really passed — which is the opposite of the countdown, where the same flush
 * had to be clamped to keep the display off `-1:59`.
 */
export function tick(elapsed: number): number {
  return elapsed + 1;
}

/**
 * Is the exercise solved? `null` means "not submitted yet", which is not solved.
 *
 * Named separately from {@link shouldTick} because it is the FINISH LINE, and
 * the finish line is a fact about the exercise rather than about the clock.
 * `correct` is already "every gradeable slot is correct" (`exerciseGrading.ts`),
 * so an exercise whose only wrong slot was `unavailable` finishes here too —
 * the learner did everything that was asked of them.
 */
export function isSolved(result: GradeResult | null): boolean {
  return result !== null && result.correct;
}

/**
 * Should the interval be running right now?
 *
 * ONE stop condition: a fully correct submission. Everything else keeps the
 * clock moving, including the whole correction cycle — an incorrect verdict on
 * screen, the learner reading it, and the retry that clears the wrong answers.
 *
 * IT DOES NOT PAUSE ON A WRONG VERDICT, and that is a deliberate reversal of the
 * countdown's rule. The countdown was a BUDGET being spent, so draining it while
 * the learner read feedback punished them for looking at the thing we asked them
 * to look at — pausing protected them from a penalty. A stopwatch has no budget
 * and imposes no penalty; it reports elapsed time. Freezing it while a wrong
 * verdict is up would make it report something else: two learners who took the
 * same real time would see different numbers depending on how long they stared
 * at the verdict, and a three-minute struggle could read `0:40`. Reading why you
 * were wrong is not a break in the attempt — on a wrong answer it IS the work.
 *
 * The structural argument points the same way: with one stop condition there is
 * no resume, so the clock cannot be restarted by any later state, and the
 * machine terminates on the one event that means "finished".
 */
export function shouldTick(result: GradeResult | null): boolean {
  return !isSolved(result);
}

/**
 * `mm:ss` for display.
 *
 * Minutes are ZERO-PADDED, unlike the countdown this replaces: a stopwatch is
 * read as a duration from a fixed start, and `00:00` is how one reads before it
 * is started. Padding also keeps the width stable as the first minute rolls
 * over, so the top-right corner of the card does not shift under a `tabular-nums`
 * column that was chosen precisely to stop it shifting.
 *
 * Minutes are NOT capped at 60: an hour reads as `60:00`, which is unambiguous,
 * where an `h:mm:ss` branch would exist for a case nothing produces and would
 * therefore never be exercised.
 */
export function formatElapsed(seconds: number): string {
  // Defensive flooring and clamping: this is the last thing before the DOM, and
  // a fractional or negative value must render as a time, not as `NaN:aN`.
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
