/**
 * layout.ts — shared row-alignment tokens for the activity editor and the
 * practice player (premium design system finishing pass).
 *
 * Owner complaint: "margins feel uneven and elements don't share a
 * horizontal line". The editor card header, each block header, the
 * worksheet canvas' own toolbar/canvas row, and the practice player's
 * header/tab row/footer are all SEPARATE elements at different nesting
 * depths, so nothing forced their horizontal inset to agree — one used
 * `p-3`, another `px-2`, another `px-1`. `ROW_PADDING_X` is the one
 * horizontal inset every one of those rows now shares, imported rather than
 * retyped, so they cannot drift apart again the way they did before this
 * pass. Vertical padding stays PER ROW (a compact block header is
 * deliberately shorter than the roomier card header) — only the horizontal
 * edge is unified.
 *
 * ONLY EVER USED UNPREFIXED. Tailwind's build-time scanner needs a utility's
 * exact class name literally in source text; it cannot assemble
 * `` `lg:${ROW_PADDING_X}` `` at runtime into the `lg:px-3` utility it would
 * need to generate. A caller that only wants this padding at `lg:` writes
 * the literal `lg:px-3` class directly instead (see `ActivityEditorIsland`'s
 * body/preview wrappers) — by hand, at the same value this token names.
 */
export const ROW_PADDING_X = 'px-3';
