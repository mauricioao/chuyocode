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
 * second colour system next to the semantic one.
 *
 * Each mechanic still supplies its own SIZE: `drop`'s inline control sits at
 * `1em` beside a sentence ({@link CHIP_INLINE}); the four big-stage games
 * (`QuizMatching`/`QuizReorder`/`QuizCloze`/`QuizGroupSort`) share the
 * `cqw`/`cqh` "readable from the back of the room" ramp from `scale.ts`
 * ({@link CHIP_STAGE}). Only the shape and the rest/placed material live
 * here.
 */
import { cn } from '@/lib/utils';
import {
  CONTROL_SCALE,
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
} from './scale';

/**
 * The material + shape every tile shares, before either scale below is
 * layered on top.
 *
 * `focus-visible:ring-inset` (visual-polish pass, safe-inset system — see
 * `scale.ts`'s own `STAGE_SAFE_INSET_CLASS` header): a plain `ring-*` is a
 * `box-shadow`, painted OUTSIDE the border box, which a tile flush against
 * its scroll container's padding edge would have clipped. `-inset` keeps the
 * ring inside the box instead, same fix every other correct/incorrect/
 * selected ring in the big-stage games now uses.
 */
const CHIP_MATERIAL =
  'inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-[#d1d2d6]/80 backdrop-blur-sm shadow-elevation-1 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

/** `drop`'s own inline scale — a control spliced into a sentence at `1em` (see `scale.ts`'s `CONTROL_SCALE` header). */
export const CHIP_INLINE = cn(CHIP_MATERIAL, 'min-h-14 px-4 py-3', CONTROL_SCALE);

/**
 * The four big-stage games' shared "readable from the back of the room" scale.
 *
 * `min-w-11` (44px) is a FLOOR only, for a very short label ("sí", "ok") —
 * this chip otherwise hugs its own text via `CHIP_MATERIAL`'s `inline-flex`
 * plus the padding/height clamps, never a fixed width (owner bug: a tray of
 * answer chips used to share one wide fixed box regardless of how short or
 * long each word was, which is also what let a narrow phone's tray overflow
 * instead of wrapping — see each caller's own tray `<li>`, which must stay
 * unsized too for this to hug correctly).
 */
export const CHIP_STAGE = cn(
  CHIP_MATERIAL,
  'text-center font-medium min-w-11',
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
);

/** White, raised — a tile placed in a box/blank/group, or picked/tap-selected in its own tray. Never a new palette: just the rest material's own more-raised sibling. */
export const CHIP_PLACED = 'bg-card shadow-elevation-2';

/**
 * An empty drop target: a dashed capsule outline at ~50% ink, no box — the
 * only affordance for "something goes here" (same reasoning `DropRenderer`'s
 * own former `BOX_EMPTY` header gave: the dashes are the affordance, so they
 * are the one thing {@link BLANK_FILLED} below gives up, never this one).
 */
export const BLANK_EMPTY = 'rounded-full border-2 border-dashed border-foreground/50 transition-colors';

/**
 * Filled: the border goes solid-transparent rather than disappearing, so a
 * landing tile never changes the target's own footprint — see
 * `DropRenderer`'s own former `BOX_FILLED` header.
 */
export const BLANK_FILLED = 'rounded-full border-2 border-solid border-transparent transition-colors';
