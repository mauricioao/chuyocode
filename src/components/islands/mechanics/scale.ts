/**
 * The exercise's display scale, defined ONCE for every mechanic.
 *
 * An exercise page is not an article: the learner is meant to read the prompt
 * and solve it at a glance, the way a classroom activity tool works. Body-text
 * scale inside a narrow column makes the exercise the smallest thing on a screen
 * that has nothing else on it.
 *
 * WHY A SHARED MODULE AND NOT A CLASS STRING PER RENDERER. This is the same
 * argument `BlankSentence` already makes about flow: a duplicated size ramp is
 * how two prompts on one page end up at two different sizes after one edit
 * touches only one renderer. Four mechanics render a prompt; one of them is
 * always the one nobody remembers to update.
 *
 * Tailwind scans source TEXT, so these must stay whole, literal class names —
 * never a template built from a variable (see `TITLE_SIZE` in
 * `ExerciseCard.astro` for the same rule).
 */

/**
 * Font-size ramp for the prompt — the sentence or question being answered.
 *
 * MOBILE FIRST. `text-xl` (20px) at 320px is already a step above body copy and
 * still leaves room for an inline control on the same line; the display sizes
 * are opt-in at `sm` and `lg`, so a phone never inherits a desktop headline.
 */
export const PROMPT_SCALE = 'text-xl sm:text-2xl lg:text-3xl';

/**
 * Readability cap for the prompt. Deliberately in `em`, not `rem` or a
 * breakpoint-specific pixel width.
 *
 * A full-width line at display size is genuinely hard to read: comfortable prose
 * runs 45-75 characters per line, with ~66 the classic target. Average glyph
 * width in a humanist sans is about 0.5em, so `32em` is roughly 64 characters.
 *
 * Because the cap is expressed in `em` it resolves against the prompt's OWN
 * font-size, so it stays ~64 characters at `text-xl`, at `text-2xl` and at
 * `text-3xl` alike. One number, correct at every breakpoint — a pixel cap would
 * have to be re-derived for each step of {@link PROMPT_SCALE} and would silently
 * stop matching the first time that ramp changed.
 *
 * This caps PROSE only. The answer tiles are not prose and deliberately use the
 * full width of the page container.
 */
export const PROMPT_MEASURE = 'max-w-[32em]';

/**
 * A control spliced INTO a sentence: exactly the size of the words around it.
 *
 * `1em` is the parent's font-size, so an inline input or dropdown tracks
 * {@link PROMPT_SCALE} automatically instead of restating the ramp. A fixed
 * `text-base` here is what made the control shrink to body size inside a
 * display-size sentence — legible, but visibly not part of the line it sits on.
 *
 * The `length:` hint is required: `text-[1em]` alone is ambiguous to Tailwind,
 * which also resolves `text-*` as a colour utility.
 */
export const CONTROL_SCALE = 'text-[length:1em]';
