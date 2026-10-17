/**
 * Shared "colour by position" tile palette — ONE recipe (UI pass, owner
 * spec: "las cápsulas que sean de colores de nuestra paleta y siempre
 * variadas") instead of the presentation stage quietly keeping its own copy
 * while the drag chips stayed grey. Colour goes by the tile's own POSITION
 * (its stable index in whatever shuffled order the caller derives), never by
 * correctness — red and green stay reserved for the ✓/✕ marks, never a fill
 * here.
 *
 * Consumed by both the presentation stage's multiple-choice option cards
 * (`PresentationIsland.tsx`) and the big-stage drag chips' colour-filled
 * variant (`chip.ts`'s `stageChipColorClass`) — see that module's own header
 * for why the index a drag game passes in is the ITEM's stable position in
 * its shuffled tray order (so a chip keeps its own colour once placed),
 * never the slot/group it happens to render in.
 *
 * Values are the `--color-tile-1` … `--color-tile-6` tokens in `global.css`'s
 * `@theme` block — see that token's own comment for the exact white-text
 * contrast ratio each one clears.
 */
export const TILE_COLOR_CLASSES = [
  'bg-tile-1', // 1 — cobalt
  'bg-tile-2', // 2 — magenta
  'bg-tile-3', // 3 — orange
  'bg-tile-4', // 4 — teal
  'bg-tile-5', // 5 — violet
  'bg-tile-6', // 6 — sky-deep
] as const;

/**
 * `index` is 0-based — cycles through {@link TILE_COLOR_CLASSES}, so any run
 * of up to six consecutive positions never repeats a colour.
 */
export function optionColorClass(index: number): string {
  return TILE_COLOR_CLASSES[index % TILE_COLOR_CLASSES.length]!;
}

/**
 * The SAME six tokens as SVG `fill-*` utilities — for a caller that paints
 * shapes rather than boxes ("Ruleta"'s own wheel slices, `QuizWheel.tsx`).
 * Spelled out literally (never built from {@link TILE_COLOR_CLASSES} with a
 * string replace) so Tailwind's source scanner sees every class name.
 */
export const TILE_FILL_CLASSES = [
  'fill-tile-1',
  'fill-tile-2',
  'fill-tile-3',
  'fill-tile-4',
  'fill-tile-5',
  'fill-tile-6',
] as const;

/** {@link optionColorClass}'s SVG twin — same 0-based index, same colour. */
export function optionFillClass(index: number): string {
  return TILE_FILL_CLASSES[index % TILE_FILL_CLASSES.length]!;
}
