/**
 * The shared "chip" look for every draggable/selectable answer token across
 * the drag-based mechanics (`drop`, `match`, `reorder`, `groupsort`,
 * `cloze`) — ONE recipe (UI-kit refactor, owner spec: "muy cuadrada" — the
 * matching board's bordered rectangles were the one mechanic the `drop`
 * tile's own grey-glass-capsule pass never reached) instead of five
 * near-identical `rounded-md border border-input bg-card` strings that
 * silently drift apart the moment an edit touches only one of them — the
 * same argument `scale.ts`'s own header makes about the size ramp.
 *
 * REST: a grey glass capsule (the owner's `#d1d2d6` family, softly
 * translucent, `shadow-elevation-1`). PLACED/PICKED/SELECTED: white and
 * more raised (`shadow-elevation-2`) — {@link CHIP_PLACED} layers on top of
 * the rest material, never a new palette. Correct/incorrect stay each
 * caller's OWN `success`/`destructive` tokens, applied as a ring or a tint
 * over this shape — never restated here, so this module never grows a
 * second colour system next to the semantic one. The one exception is
 * {@link stageChipColorClass} below: a caller that opts in gets a chip
 * filled from the shared position-based tile palette (`palette.ts`) instead
 * of the grey rest material — still never red/green, the ✓/✕ mark stays the
 * only correctness signal.
 *
 * Each mechanic still supplies its own SIZE: `drop`'s inline control sits at
 * `1em` beside a sentence ({@link CHIP_INLINE}); the four big-stage games
 * (`QuizMatching`/`QuizReorder`/`QuizCloze`/`QuizGroupSort`) share ONE fixed
 * size ({@link CHIP_STAGE}'s own header). Only the shape and the rest/placed
 * material live here.
 */
import { cn } from '@/lib/utils';
import { CONTROL_SCALE } from './scale';
import { optionColorClass } from './palette';

/**
 * The bare SHAPE every tile shares — flex/radius/border-width/backdrop/
 * disabled state, deliberately with NO fill, shadow or focus-ring colour of
 * its own. {@link CHIP_MATERIAL} below layers the grey-glass REST look on
 * top for the default chip; {@link stageChipColorClass} layers its own
 * colour-filled look on top of this SAME shape instead — composed straight
 * from here, never from {@link CHIP_MATERIAL}, so a colour-filled chip can
 * never inherit a grey-glass `shadow-elevation-1`/focus ring that
 * `tailwind-merge` would not know how to override (it has no built-in
 * notion that `shadow-elevation-1`, a project theme token, conflicts with an
 * arbitrary-value `shadow-[...]` utility).
 */
const CHIP_SHAPE =
  'inline-flex items-center justify-center gap-2 rounded-full border border-transparent backdrop-blur-sm outline-none disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The REST material on top of {@link CHIP_SHAPE} — a top-lit grey glass
 * capsule (activity-templates-polish pass, owner spec: "premium, tipo
 * Apple... mate, en tonos tinta" — proposal
 * `docs/PROPUESTA-PLANTILLAS-2026-10-23.md` §d): a two-stop gradient
 * (`--chip-rest-bg`, `global.css`'s `[data-theme='ingles']` block) plus a
 * matte layered shadow (`--shadow-chip-rest`) — one light direction, never a
 * flat fill. Deliberately no hover lift/transition of its OWN here: every
 * caller that wants one already appends its own (`gameTileTransitionClassName`
 * in the four big-stage games, or a one-off `hover:-translate-y-0.5` in
 * `QuizAnagram`/`QuizHangman`) — `tailwind-merge` treats a shared
 * `hover:-translate-y-*`/`transition-*` here as the SAME utility group as a
 * caller's own and silently drops whichever one is listed first, which used
 * to be this constant's (caught by `QuizAnagram.test.tsx`'s/
 * `QuizHangman.test.tsx`'s own "single-card kit look" checks).
 *
 * `focus-visible:ring-inset` (visual-polish pass, safe-inset system — see
 * `scale.ts`'s own `STAGE_SAFE_INSET_CLASS` header): a plain `ring-*` is a
 * `box-shadow`, painted OUTSIDE the border box, which a tile flush against
 * its scroll container's padding edge would have clipped. `-inset` keeps the
 * ring inside the box instead, same fix every other correct/incorrect/
 * selected ring in the big-stage games now uses.
 */
export const CHIP_MATERIAL = cn(
  CHIP_SHAPE,
  'bg-[image:var(--chip-rest-bg)] shadow-[var(--shadow-chip-rest)] text-foreground',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50',
);

/** The four big-stage games' shared chip SIZE, layered on either {@link CHIP_MATERIAL} ({@link CHIP_STAGE}) or straight onto {@link CHIP_SHAPE} ({@link stageChipColorClass}) — see {@link CHIP_STAGE}'s own header for the exact values. */
const CHIP_STAGE_SIZE =
  'text-center font-semibold min-w-11 py-2 min-h-[clamp(3rem,2.75rem+min(2cqw,1.1cqh),5.5rem)] px-[clamp(1.25rem,1rem+min(1.6cqw,0.9cqh),1.75rem)] text-[clamp(1.125rem,0.9rem+min(2.5cqw,1.4cqh),2.75rem)]';

/** `drop`'s own inline scale — a control spliced into a sentence at `1em` (see `scale.ts`'s `CONTROL_SCALE` header). */
export const CHIP_INLINE = cn(CHIP_MATERIAL, 'min-h-14 px-4 py-3', CONTROL_SCALE);

/**
 * The four big-stage games' shared chip size (UI pass, owner spec: "aumentar
 * un poco el tamaño y centrar dentro de las cápsulas el texto"): the same
 * `cqw`/`cqh` ramp as `scale.ts`'s tile tokens, with a raised FLOOR — 48px
 * tall, 18px semibold text, ~20px horizontal padding on a normal stage —
 * still growing to the owner's "readable from the back of the room" ~44px
 * text on a full-screen or projected one (a fixed size would shrink it there).
 *
 * `min-w-11` (44px) is a FLOOR only, for a very short label ("sí", "ok") —
 * this chip otherwise hugs its own text via `CHIP_MATERIAL`'s `inline-flex`
 * plus its own padding/height, never a fixed width (owner bug: a tray of
 * answer chips used to share one wide fixed box regardless of how short or
 * long each word was, which is also what let a narrow phone's tray overflow
 * instead of wrapping — see each caller's own tray `<li>`, which must stay
 * unsized too for this to hug correctly). `items-center justify-center`
 * (from {@link CHIP_MATERIAL}) centres the label both ways inside the
 * capsule.
 */
export const CHIP_STAGE = cn(CHIP_MATERIAL, CHIP_STAGE_SIZE);

/** White, raised — a tile placed in a box/blank/group, or picked/tap-selected in its own tray. Never a new palette: just the rest material's own more-raised sibling (`--shadow-chip-raised`, activity-templates-polish pass — was the generic `shadow-elevation-2`). */
export const CHIP_PLACED = 'bg-card shadow-[var(--shadow-chip-raised)]';

/**
 * The colour-filled variant of {@link CHIP_STAGE} — "Une las parejas" and
 * "Ordenar por grupos" own answer chips (owner spec: "las cápsulas que sean
 * de colores de nuestra paleta y siempre variadas"). `index` is the ITEM's
 * own stable position in its shuffled tray order (`palette.ts`'s own
 * header): colour belongs to the item, not the slot/group it happens to sit
 * in, so a chip keeps its own colour once placed — the student can still
 * track it by colour.
 *
 * Composed from {@link CHIP_SHAPE} directly (never {@link CHIP_STAGE}/
 * {@link CHIP_MATERIAL} — see {@link CHIP_SHAPE}'s own header for why): white
 * text (never the rest material's own ink `text-foreground`), a matte
 * "pressed-key" lip shadow (`--shadow-chip-color`, activity-templates-polish
 * pass — was a flat literal inset border) instead of the grey-glass
 * `shadow-elevation-1`, and a visible ink `outline` for focus instead of the
 * usual sky `ring-*` (which all but vanishes against a saturated fill).
 * Hover keeps the same lip and adds a touch more ambient lift
 * (`global.css`'s own `.chip-color:hover` rule — a plain CSS rule, not a
 * Tailwind arbitrary value, since that shadow is two comma-separated
 * layers). Never red/green — see `palette.ts`'s own header; the ✓/✕ mark
 * stays the one semantic signal for correctness, never this fill.
 */
export function stageChipColorClass(index: number): string {
  return cn(
    CHIP_SHAPE,
    CHIP_STAGE_SIZE,
    'chip-color text-white',
    optionColorClass(index),
    'shadow-[var(--shadow-chip-color)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
  );
}

/**
 * An empty drop target: a dashed capsule outline (activity-templates-polish
 * pass, proposal §d — a thinner 1.5px `border-input` dash, a faint ink wash
 * `--well-bg`, and a soft inset `--well-shadow`, rather than the flat
 * `border-foreground/50` this replaces) — the dashes stay the one
 * affordance for "something goes here" (same reasoning `DropRenderer`'s own
 * former `BOX_EMPTY` header gave: they are the one thing {@link BLANK_FILLED}
 * below gives up, never this one). `border-input` already clears 3:1 non-text
 * contrast on both `--background` and `--card` (`ingles-theme-contrast.test.ts`).
 */
export const BLANK_EMPTY =
  'rounded-full border-[1.5px] border-dashed border-input bg-[var(--well-bg)] shadow-[var(--well-shadow)] transition-colors';

/**
 * Filled: the border goes solid-transparent rather than disappearing, so a
 * landing tile never changes the target's own footprint — see
 * `DropRenderer`'s own former `BOX_FILLED` header. Same 1.5px width as
 * {@link BLANK_EMPTY} (activity-templates-polish pass) so a well's own box
 * never shifts size the moment it is filled.
 */
export const BLANK_FILLED = 'rounded-full border-[1.5px] border-solid border-transparent transition-colors';

/**
 * The one white "sheet" every big-stage mould's own board (tray + targets)
 * sits on (activity-templates-polish pass, proposal
 * `docs/PROPUESTA-PLANTILLAS-2026-10-23.md` §d) — the underlying class name
 * for `QuizBlockPractice.tsx`'s own `ActivitySheet` wrapper AND for each
 * mould's (`QuizMatching`/`QuizReorder`/`QuizCloze`/`QuizGroupSort`) own
 * inline wrapper div. Lives here, never imported component-to-component
 * between those files, to avoid a circular import — `QuizBlockPractice`
 * already imports every mould to render it. Styled in `global.css`'s
 * `.activity-sheet` rule.
 */
export const ACTIVITY_SHEET_CLASS = 'activity-sheet';
