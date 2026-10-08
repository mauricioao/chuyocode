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
 * never a template built from a variable.
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
 *
 * `mx-auto` RIDES ALONG BECAUSE THE CAP IS WHAT MAKES CENTRING POSSIBLE. The
 * exercise card centres its prompt, and `text-center` alone cannot do it: the
 * prompt is a capped BLOCK, so without auto margins it stays pinned to the left
 * edge with its centred text sitting inside a left-aligned box. Putting the two
 * together here keeps the same one-place guarantee the measure already had —
 * four mechanics, one rule, no renderer that quietly forgets to centre.
 */
export const PROMPT_MEASURE = 'mx-auto max-w-[32em]';

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

/**
 * Shared "big stage" sizing for the four drag-and-drop games (`QuizMatching`,
 * `QuizReorder`, `QuizCloze`, `QuizGroupSort`) — visual-polish pass, owner ask:
 * "igual de grandes que Wordwall, que se lean desde el fondo del salón" (as
 * big as Wordwall, readable from the back of the classroom), AND consistent:
 * one tile shape/padding/radius/type-scale everywhere instead of the four
 * games separately hand-tuning their own (they used to each define their own
 * near-identical `TILE_BASE` string — a duplicated size ramp is exactly the
 * bug {@link PROMPT_SCALE}'s own header already warns about).
 *
 * CONTAINER-QUERY, NOT VIEWPORT: a tile must be exactly as big embedded in
 * the small practice window, in the editor's live preview column, and in
 * "modo enfoque" full screen — three very different VIEWPORT widths that
 * hand this stage three very different amounts of actual room. `cqw` (1% of
 * the nearest ancestor with `container-type: inline-size`) tracks the room
 * the stage ACTUALLY has, not the window outside it; `{@link STAGE_CONTAINER}`
 * is that ancestor, applied once per stage root (`ActivityPracticeIsland`'s
 * two stage wrappers, `QuizLivePreview`'s own column).
 *
 * `clamp()` over a stepped breakpoint ramp (unlike {@link PROMPT_SCALE})
 * because a drag tile's own touch target should track the stage CONTINUOUSLY
 * growing/shrinking, not jump at a few fixed container widths — there is no
 * "whole number of columns" constraint here the way there is for the start
 * gallery's own cards.
 *
 * Falls back to each clamp's own floor with no `STAGE_CONTAINER` ancestor
 * (`cqw` resolves to `0` with no containment context) — still fully usable,
 * just not grown, same as before this pass.
 */
export const STAGE_CONTAINER = '@container';

/** Tile/slot/blank/prompt text — ~20px on a narrow stage, up to the owner's own "readable from the back of the room" ~44px on a wide/full-screen one. */
export const TILE_TEXT_SCALE = 'text-[clamp(1.25rem,1rem+2.5cqw,2.75rem)]';

/** Tile/slot/blank horizontal padding — grows alongside {@link TILE_TEXT_SCALE} so the shape stays the same recipe at every size, just bigger. */
export const TILE_PADDING_X_SCALE = 'px-[clamp(1rem,0.6rem+1.6cqw,1.75rem)]';

/** Tile/slot/blank vertical padding — see {@link TILE_PADDING_X_SCALE}. */
export const TILE_PADDING_Y_SCALE = 'py-[clamp(0.75rem,0.4rem+1.2cqw,1.25rem)]';

/** Tile/slot/blank minimum height — keeps the touch target big even a moment before the text clamp visually catches up. */
export const TILE_MIN_HEIGHT_SCALE = 'min-h-[clamp(3.5rem,3rem+2cqw,5.5rem)]';

/** A multi-tile container's own floor (the reorder line, a group-sort box) — bigger than one tile's own floor since it holds several. */
export const STAGE_BOX_MIN_HEIGHT_SCALE = 'min-h-[clamp(6rem,5rem+4cqw,11rem)]';
