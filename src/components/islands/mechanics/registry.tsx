/**
 * Mechanic registry — the single extension point of the exercise model.
 *
 * Adding a mechanic is one file plus one line here. No migration, no table
 * change, no change to the grading function, no change to existing exercises
 * (docs/exercise-model.md, "Adding a mechanic").
 *
 * Dispatch is PER SLOT, not per exercise, which is what lets one exercise mix
 * mechanics and what makes an unknown `input` degrade that slot alone.
 */
import { Suspense, lazy } from 'react';
import type { Comparator } from '@/lib/exerciseGrading';
import { comparatorFor } from '@/lib/exerciseGrading';
import { Skeleton } from '@/components/ui/skeleton';
import ChoiceRenderer from './ChoiceRenderer';
import SelectRenderer from './SelectRenderer';
import TextRenderer from './TextRenderer';
import type { MechanicRenderer, MechanicRendererProps } from './types';

const LazyDropRenderer = lazy(() => import('./DropRenderer'));

/**
 * `drop` is the only mechanic that needs `@dnd-kit` (~69 kB / 23 kB gzip),
 * which every other curated exercise — most slots are `choice`/`select`/`text`
 * — paid for anyway, since this registry used to import all four renderers
 * eagerly in one module. `React.lazy` defers that import to the first exercise
 * that actually has a `drop` slot; the `Suspense` boundary lives HERE rather
 * than at each call site (`ExerciseIsland.tsx`, `QuizBlockPractice.tsx`), so
 * `rendererFor('drop')` still hands back one ordinary component callers drop
 * into JSX exactly like the other three, with no caller change. The fallback
 * mirrors `DropRenderer`'s own shape (a prompt line, a row of pool tiles)
 * instead of `null`, so the chunk loading in does not visibly snap the layout.
 */
function DropRendererLazy(props: MechanicRendererProps) {
  return (
    <Suspense
      fallback={
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      }
    >
      <LazyDropRenderer {...props} />
    </Suspense>
  );
}

/**
 * `slot.input` -> renderer. One line per shipped mechanic.
 *
 * `order` and `hotspot` are deliberately ABSENT — no renderer and no comparator
 * either. They degrade per slot.
 */
const MECHANICS: Record<string, MechanicRenderer> = {
  choice: ChoiceRenderer,
  drop: DropRendererLazy,
  select: SelectRenderer,
  text: TextRenderer,
};

/**
 * Resolve the renderer for a mechanic, or `null` when it has not shipped.
 *
 * `null` is a supported outcome, not an error: content and code deploy through
 * different pipelines and will drift, so the caller degrades this slot and
 * carries on.
 */
export function rendererFor(input: string): MechanicRenderer | null {
  return MECHANICS[input] ?? null;
}

/**
 * Resolve the comparator for a mechanic ONLY IF that mechanic is also rendered.
 *
 * This closes a real correctness hole. The comparator map can be WIDER than the
 * renderer registry, because a comparator is cheap and a renderer is not, so
 * one routinely lands first. Grading with the comparator map alone would show
 * the learner no input for such a slot and then mark it `incorrect`: permanently
 * wrong, for an answer they were never given the chance to give. Nothing throws,
 * nothing logs.
 *
 * As of this slice the two maps happen to cover the same three mechanics, so the
 * resolver is currently a no-op in practice. That is exactly why it stays: it
 * re-arms automatically the next time a comparator ships ahead of its renderer,
 * with no one having to remember this hole existed.
 *
 * Routing grading through the registry makes the invariant STRUCTURAL rather
 * than a promise: a slot can only be graded by a mechanic that was actually
 * drawn. Every future mechanic inherits the guarantee for free — including the
 * ones whose comparator lands before their renderer.
 *
 * Pass this to `check()` as its comparator resolver.
 */
export function comparatorForRenderable(input: string): Comparator | null {
  return rendererFor(input) ? comparatorFor(input) : null;
}
