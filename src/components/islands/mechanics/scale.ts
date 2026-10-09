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

/**
 * A stage root with a KNOWN, bounded HEIGHT (visual-polish-3 pass, owner bug:
 * an 8-pair match board — and group-sort's 4x4 ceiling — overflowed even
 * 1440x900 full screen, "Comprobar" reachable only via an inner scroll the
 * learner had to discover). {@link STAGE_CONTAINER} alone only ever measured
 * WIDTH (`container-type: inline-size`): every tile/box token below grew
 * off `cqw` alone, so a tall board at a wide-but-not-tall viewport (1280x720)
 * kept growing tiles toward their ceiling with no regard for how many ROWS
 * had to stack underneath them.
 *
 * `container-type: size` containment, both axes at once — unlocks `cqh`
 * (1% of the container's own block size) for the same tokens' `min(…cqw,
 * …cqh)` terms below, so a tile's growth is bounded by whichever axis is
 * tighter.
 *
 * ONLY FOR A ROOT WHOSE HEIGHT COMES FROM OUTSIDE ITS OWN CONTENT —
 * `ActivityPracticeIsland`'s two stage wrappers qualify: each is a
 * `flex-1` flex item (`flex: 1 1 0%`, so its hypothetical main size is `0`,
 * never its content) inside a column flex chain that bottoms out at a
 * viewport-bound ancestor ("modo enfoque"'s `fixed inset-0`, or the desk
 * window's own fixed-height body) — so its used height is fully resolved by
 * the flex algorithm before layout ever looks at what is inside it, exactly
 * the condition `container-type: size` needs to avoid collapsing to a
 * zero-height box. `QuizLivePreview`'s own column is NOT one of these: it
 * grows to fit its content (no `flex-1`/bounded ancestor), so it keeps the
 * plain {@link STAGE_CONTAINER} (width only) — giving it this token instead
 * would starve its own height to zero, same failure mode this doc warns
 * against.
 */
export const STAGE_CONTAINER_SIZE = '[container-type:size]';

/** Tile/slot/blank/prompt text — ~20px on a narrow stage, up to the owner's own "readable from the back of the room" ~44px on a wide/full-screen one; the `cqh` term keeps a tall board (8 pairs, a 4x4 group-sort) from outgrowing a SHORT viewport the way the `cqw`-only ramp used to. */
export const TILE_TEXT_SCALE = 'text-[clamp(1.1rem,0.9rem+min(2.5cqw,1.4cqh),2.75rem)]';

/** Tile/slot/blank horizontal padding — grows alongside {@link TILE_TEXT_SCALE} so the shape stays the same recipe at every size, just bigger. */
export const TILE_PADDING_X_SCALE = 'px-[clamp(0.75rem,0.5rem+min(1.6cqw,0.9cqh),1.75rem)]';

/** Tile/slot/blank vertical padding — see {@link TILE_PADDING_X_SCALE}. */
export const TILE_PADDING_Y_SCALE = 'py-[clamp(0.375rem,0.25rem+min(1.2cqw,0.6cqh),1.25rem)]';

/** Tile/slot/blank minimum height — keeps the touch target big even a moment before the text clamp visually catches up. */
export const TILE_MIN_HEIGHT_SCALE = 'min-h-[clamp(2.25rem,2rem+min(2cqw,1.1cqh),5.5rem)]';

/** A multi-tile container's own floor (the reorder line, a group-sort box) — bigger than one tile's own floor since it holds several. */
export const STAGE_BOX_MIN_HEIGHT_SCALE = 'min-h-[clamp(5rem,4.5rem+min(4cqw,2.2cqh),11rem)]';

/**
 * A board with MANY rows (`QuizMatching`'s own "Une las parejas" — visual-
 * polish-2 pass, owner bug: a 5-pair board already overflowed 1440x900 full
 * screen, "Comprobar" cut off below the fold, and 8 pairs is the authored
 * ceiling). One column stays the rule for a short board or a narrow stage (a
 * phone, the small practice window); a wide stage gets a second column once
 * the board actually needs it, roughly halving how many rows tall it grows.
 *
 * `@lg` (a container-query breakpoint, not a viewport one) so this tracks
 * the STAGE's own width — the same `STAGE_CONTAINER` ancestor {@link
 * TILE_TEXT_SCALE} already reads `cqw` from — not the window outside it;
 * same reasoning that module's own header gives for `cqw` over a viewport
 * breakpoint. `grid-cols-1` is the floor so this still renders correctly
 * (one column) with no `STAGE_CONTAINER` ancestor.
 */
export const STAGE_TWO_COL_GRID = 'grid-cols-1 @lg:grid-cols-2';

/**
 * FLOATING COMPROBAR (owner spec, build item 5: "nuestro botón de comprobar
 * siempre flotante en la parte inferior derecha"). Every game's own
 * check/retry control anchors here — bottom-right, fixed to the nearest
 * positioned/transformed ancestor, which in this app is always the desk
 * window chrome itself (`DeskWindow.astro`'s own header: a dragged window's
 * CSS `translate` already makes it the containing block for every `fixed`
 * descendant) — so in practice this reads as "fixed to the window", the
 * SAME corner in every game and every context (the four templates, Básico,
 * worksheets; practice, full-screen focus mode, preview, the editor's own
 * live preview), never the in-flow bottom of a scrolling board any more.
 *
 * Offset left of the DOCKED side toolbar at `lg:` (`EditorSideToolbar`'s own
 * default docked slot, right-center of the window) only where that toolbar
 * can actually be present — the editor's own live preview
 * (`QuizLivePreview`, via its `editorOffset` prop) — see
 * {@link FLOATING_CHECK_BAR_EDITOR_OFFSET}. Every other context (practice,
 * full-screen, standalone preview) has no such toolbar and uses the plain
 * value below unchanged.
 *
 * Every caller that renders this inside a SCROLLABLE stage must also give
 * that scroll container `STAGE_BOTTOM_RESERVE_CLASS` (below), so the
 * floating bar can never cover the last visible row/tile.
 *
 * `floating-check-bar` styles nothing by itself: it is the hook
 * `global.css` uses inside the template editor (`TemplateEditorKit.tsx`) —
 * on desktop it moves the bar 16px inside the stage card's own
 * bottom-right corner; on phones, where the authoring sheet sits above the
 * stage, it sticks to the bottom of the game instead of floating over the
 * sheet.
 */
export const FLOATING_CHECK_BAR_CLASS =
  'floating-check-bar fixed bottom-4 right-4 z-40 flex flex-wrap items-center justify-end gap-2';

/** Added to {@link FLOATING_CHECK_BAR_CLASS} only inside the activity editor — see that token's own header. */
export const FLOATING_CHECK_BAR_EDITOR_OFFSET = 'lg:right-20';

/** Bottom padding reserved on a scrollable stage so {@link FLOATING_CHECK_BAR_CLASS} can never cover its last visible row/tile. */
export const STAGE_BOTTOM_RESERVE_CLASS = 'pb-20';
