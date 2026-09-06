/**
 * Countdown state for a timed exercise — pure, no React, no `setInterval`.
 *
 * The island owns the interval; this module owns every DECISION the interval
 * makes. That split exists because a countdown buried in an effect is only
 * testable by advancing fake timers through a rendered component, where a wrong
 * clamp or an off-by-one boundary is invisible under the noise of React's
 * scheduling. Here each rule is one function over one number.
 *
 * Zero I/O. Nothing here reads a clock: real time enters only as "another tick
 * happened", which is what makes the whole thing deterministic.
 */

/** Milliseconds between ticks. One second — the unit the learner is shown. */
export const TICK_MS = 1000;

/**
 * One second off the clock, floored at zero.
 *
 * CLAMPED, not merely decremented. Without the floor a late tick — one that
 * fires after expiry because the tab was backgrounded and the browser flushed a
 * queued interval — would drive the display negative, and `-1:59` is a bug the
 * learner sees before anyone else does.
 */
export function tick(remaining: number): number {
  return Math.max(0, remaining - 1);
}

/**
 * Has the clock run out?
 *
 * `<= 0` rather than `=== 0` so a payload that somehow reached a negative value
 * still reads as expired instead of counting down forever past zero.
 */
export function hasExpired(remaining: number): boolean {
  return remaining <= 0;
}

/**
 * Should the interval be running right now?
 *
 * Three ways to be idle, and each is a real state rather than a guard against a
 * bug: `null` is an untimed exercise (the normal case), `0` is a spent clock,
 * and `graded` is the pause while the learner reads their feedback.
 *
 * PAUSING WHILE GRADED IS DELIBERATE, and it resumes on retry. The clock
 * measures time spent ANSWERING; reading a verdict is not answering, and letting
 * it drain while the learner reads would punish them for looking at the feedback
 * we just asked them to look at. Resuming rather than stopping for good keeps
 * the limit meaningful across a correction pass — and it terminates, because
 * `remaining` only ever decreases and the island fires its automatic grade at
 * most once.
 */
export function shouldTick(remaining: number | null, graded: boolean): boolean {
  if (remaining === null) return false;
  if (graded) return false;
  return !hasExpired(remaining);
}

/**
 * `m:ss` for display.
 *
 * Minutes are NOT capped at 60: an hour-long limit reads as `60:00`, which is
 * unambiguous, where an `h:mm:ss` branch would exist for a case no author will
 * ever write and would therefore never be exercised.
 *
 * Seconds are zero-padded and minutes are not, matching how every stopwatch
 * writes it — `1:05`, never `1:5` and never `01:05`.
 */
export function formatRemaining(seconds: number): string {
  // Defensive flooring and clamping: this is the last thing before the DOM, and
  // a fractional or negative value must render as a time, not as `NaN:aN`.
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
