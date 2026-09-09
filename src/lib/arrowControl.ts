/**
 * THE PREV/NEXT ARROW CONTROL — the parts two different renderers can share.
 *
 * Two places in this codebase need the same round chevron button: the home
 * page's {@link EditorialRow} (a static `.astro` component with a tiny inline
 * script) and the exercise stepper (JSX inside a hydrated React island).
 *
 * ONE `.astro` COMPONENT CANNOT SERVE BOTH, and it is worth being precise about
 * why rather than half-trying. Astro components are server-only: they render to
 * a string at build time and have no client runtime. A React island is mounted
 * in the browser and its arrows are driven by client state — `disabled` tracks
 * the current step, `onClick` calls a React setter. There is no mechanism by
 * which an `.astro` component can be rendered *inside* a React island, and the
 * reverse (dragging the island into `EditorialRow`) would hydrate React on the
 * home page purely to draw two chevrons on a row that is otherwise zero-JS.
 *
 * So what is shared is the CONTRACT, not the markup:
 *   - the chevron GEOMETRY ({@link CHEVRON_PATH}) — icons are data in this
 *     project, not `lucide-react` imports (same rule as `skillIcons.ts`);
 *   - the SVG presentation attributes, so both arrows are the same weight;
 *   - the `buttonVariants` arguments ({@link ARROW_BUTTON_VARIANT} +
 *     {@link ARROW_BUTTON_SHAPE}), so both compile to the same shadcn button.
 *
 * Each side then composes those with its own concerns: `EditorialRow` needs an
 * HTML string for `set:html`, the island needs JSX with handlers. That is the
 * only duplication left, and it is the irreducible part.
 *
 * Framework-free on purpose — `src/lib` holds no React, exactly as
 * `exerciseSubmit.ts` and `exerciseStepper.ts` do.
 */

/** Which way the chevron points. */
export type ArrowDirection = 'prev' | 'next';

/**
 * The lucide `ChevronLeft` / `ChevronRight` path data, at the 24px viewBox the
 * shadcn Carousel controls use — so these arrows match every other icon button
 * on the site without shipping an icon library to the home page.
 */
export const CHEVRON_PATH: Record<ArrowDirection, string> = {
  prev: 'm15 18-6-6 6-6',
  next: 'm9 18 6-6-6-6',
};

/** Nominal glyph box. See the note on {@link chevronSvgMarkup} about `size-4`. */
export const CHEVRON_SIZE = 20;
export const CHEVRON_VIEW_BOX = '0 0 24 24';
export const CHEVRON_STROKE_WIDTH = 2;

/**
 * The shadcn variant both arrows are built from.
 *
 * Spread straight into `buttonVariants(...)` on the Astro side and onto
 * `<Button>` on the React side, so a retune of the arrow's weight happens once.
 */
export const ARROW_BUTTON_VARIANT = {
  variant: 'outline',
  size: 'icon',
} as const;

/**
 * The shape that makes it read as an arrow CONTROL rather than a small square
 * button. Kept separate from the variant because it is a className, not a cva
 * key, and the two sides pass it through different props.
 */
export const ARROW_BUTTON_SHAPE = 'rounded-full';

/**
 * The chevron as an HTML string, for the Astro side's `set:html`.
 *
 * `aria-hidden` is not optional: the glyph carries no name, so the accessible
 * name MUST come from an `aria-label` on the button. A bare chevron announces
 * nothing.
 *
 * NOTE on sizing: `buttonVariants`' base includes
 * `[&_svg:not([class*='size-'])]:size-4`, so the rendered glyph is 16px and the
 * width/height attributes act as the pre-CSS fallback. The React arrow omits a
 * size class for exactly the same reason — both land on 16px.
 */
export function chevronSvgMarkup(direction: ArrowDirection): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CHEVRON_SIZE}" height="${CHEVRON_SIZE}" ` +
    `viewBox="${CHEVRON_VIEW_BOX}" fill="none" stroke="currentColor" ` +
    `stroke-width="${CHEVRON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true"><path d="${CHEVRON_PATH[direction]}"/></svg>`
  );
}
