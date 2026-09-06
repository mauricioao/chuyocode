/**
 * skillIcons — the decorative glyph that sits beside the skill label on a card.
 *
 * Zero I/O, zero dependencies, no locale awareness. One job: map a skill to the
 * SVG path geometry that draws it, and map anything else to nothing.
 *
 * WHY THIS IS DATA AND NOT A COMPONENT IMPORT. `lucide-react` v1.27.0 is already
 * a dependency and exports `HeadphonesIcon` / `BookOpenIcon` / `PenLineIcon`,
 * but every one of them is a REACT component. Putting a React component inside
 * `ExerciseCard.astro` would cost two things that matter more than the import:
 *
 *   1. `AstroContainer` cannot render a React component without the
 *      `@astrojs/react` server renderer — the exact wall that forced the
 *      `it.skip`s in `src/pages/[lang]/libros/libros.test.ts:47` and the skipped
 *      200-path test in `src/pages/[lang]/ingles/ingles.test.ts:309`. The card
 *      is the FIRST markup in this section a test can actually read; a React
 *      import would throw that away to save copying three strings.
 *   2. The listing route currently mounts no React at all. Keeping it that way
 *      means the card is provably zero-JavaScript by CONSTRUCTION rather than by
 *      an argument about which directives hydrate.
 *
 * The raw geometry IS exported by the package (`__iconNode`), but only from
 * per-icon deep paths like `lucide-react/dist/esm/icons/headphones.mjs`, and
 * those ship no `.d.ts` — importing one costs a new `astro check` error. So the
 * `d` strings below are copied VERBATIM from the installed package, with the
 * source file named per entry so a reviewer can diff them:
 *
 *   node_modules/lucide-react/dist/esm/icons/{headphones,book-open,pen-line}.mjs
 *   lucide-react v1.27.0 — ISC licensed.
 *
 * TRADEOFF, STATED PLAINLY: copied geometry does not follow a `lucide-react`
 * upgrade. For three decorative glyphs whose shapes are stable that is the
 * cheaper risk, but it IS a manual sync point if the icons ever look wrong.
 *
 * All three icons are drawn purely from `<path>` nodes, which is why a plain
 * list of `d` strings is a faithful representation. An icon that needed a
 * `<circle>` or `<line>` would not fit this shape and would force it to change.
 */
import { isSkill, type Skill } from '@lib/exerciseTaxonomy';

/**
 * `d` attributes per skill, in draw order, on lucide's 24x24 viewBox.
 *
 * `Record<Skill, ...>` is load-bearing: adding a fourth skill to `SKILLS`
 * without adding its glyph here is a COMPILE error, so the gap surfaces while
 * someone is editing the taxonomy rather than as a bare label in production.
 */
export const SKILL_ICON_PATHS: Record<Skill, readonly string[]> = {
  // headphones.mjs — the audio stimulus that defines a listening exercise.
  listening: [
    'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
  ],
  // book-open.mjs — an open book reads as "reading" where a closed one reads as
  // "a book", which is a different idea.
  reading: [
    'M12 5v16',
    'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
  ],
  // pen-line.mjs — a pen ON a line reads as the ACT of writing; a bare pen reads
  // as an object.
  writing: [
    'M13 21h8',
    'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
  ],
};

/**
 * The path geometry for `skill`, or an EMPTY ARRAY for anything else.
 *
 * The guard is not defensive theatre. `src/lib/exercises.ts` builds every row
 * with `skill: row.skill as Skill` — an UNCHECKED cast — so a value that never
 * passed `isSkill` can reach a template while TypeScript still calls it a
 * `Skill`. A future or misspelled skill therefore renders the label with no
 * glyph beside it, which is a smaller failure than a broken icon and a much
 * smaller one than the literal word `undefined` in the badge.
 *
 * Returns `[]` and NEVER `undefined`, mirroring `pickStable` in
 * `@lib/exerciseCopy`: an empty array maps to zero `<path>` elements, while
 * `undefined` would have to be guarded again at every call site.
 */
export function skillIconPaths(skill: unknown): readonly string[] {
  if (!isSkill(skill)) return [];
  return SKILL_ICON_PATHS[skill] ?? [];
}
