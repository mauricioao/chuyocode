/**
 * Stepping through the SLOTS OF ONE EXERCISE — pure, no React.
 *
 * The stepper walks the questions INSIDE a single exercise. It is not
 * navigation between exercises: there is no URL, no query and no page
 * transition involved, and nothing here knows that a route exists.
 *
 * Everything below is arithmetic over two numbers, kept out of the island for
 * the usual reason — a boundary condition is trivial to prove against a function
 * and awkward to prove against a component, and "the last slot" is exactly the
 * kind of off-by-one that ships quietly and strands a learner on a step they
 * cannot leave.
 *
 * STEPS ARE ZERO-BASED INSIDE, ONE-BASED ON SCREEN. The index addresses
 * `payload.slots`, so it must start at 0; the learner is told "2 de 5", so the
 * +1 belongs in exactly one place — {@link formatStep} — and nowhere else.
 */

/**
 * Fewer slots than this and the stepper is noise.
 *
 * A single-slot exercise gets NO controls at all: "1 de 1" beside two dead
 * arrows is chrome that describes itself and does nothing, and it appears on the
 * overwhelming majority of exercises.
 */
const MIN_STEPPABLE = 2;

/** Does this exercise have enough slots to be worth stepping through? */
export function showsStepper(total: number): boolean {
  return Number.isFinite(total) && total >= MIN_STEPPABLE;
}

/** The number of steps, floored and never below one. */
function safeTotal(total: number): number {
  if (!Number.isFinite(total) || total < 1) return 1;
  return Math.floor(total);
}

/**
 * The nearest valid step index for `total` slots.
 *
 * TOTAL, not partial: it answers for any input, including the ones a UI should
 * never produce (a negative index, a fraction, `NaN`, an empty exercise). The
 * alternative is a caller that must check before every call, and the one call
 * site that forgets is a crash on `payload.slots[undefined]`.
 *
 * Clamping rather than wrapping is deliberate. Wrapping would send a learner who
 * pressed "next" once too often back to question one, which reads as having lost
 * their place rather than as having reached the end.
 */
export function clampStep(step: number, total: number): number {
  if (!Number.isFinite(step)) return 0;
  const whole = Math.floor(step);
  if (whole < 0) return 0;
  const last = safeTotal(total) - 1;
  return whole > last ? last : whole;
}

/** Is there a slot before this one? False at the first step and out of range. */
export function hasPrevStep(step: number, total: number): boolean {
  return clampStep(step, total) > 0;
}

/** Is there a slot after this one? False at the last step and out of range. */
export function hasNextStep(step: number, total: number): boolean {
  return clampStep(step, total) < safeTotal(total) - 1;
}

/**
 * The learner-facing position: `"2 de 5"`.
 *
 * The connecting word is a PARAMETER rather than a lookup here, because copy
 * belongs to the island (islands keep their strings local so they do not pull
 * the Astro-side i18n module into the client bundle). This function owns the
 * only thing that can be wrong about the sentence — the arithmetic.
 *
 * The step is clamped first, so an out-of-range index is reported as a real
 * position instead of "0 de 5" or "6 de 5".
 */
export function formatStep(step: number, total: number, of: string): string {
  const count = safeTotal(total);
  return `${clampStep(step, count) + 1} ${of} ${count}`;
}
