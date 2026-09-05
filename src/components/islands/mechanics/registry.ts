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
import type { Comparator } from '@/lib/exerciseGrading';
import { comparatorFor } from '@/lib/exerciseGrading';
import ChoiceRenderer from './ChoiceRenderer';
import TextRenderer from './TextRenderer';
import type { MechanicRenderer } from './types';

/**
 * `slot.input` -> renderer. One line per shipped mechanic.
 *
 * `select`, `drop`, `order` and `hotspot` are deliberately ABSENT: `select` has
 * a comparator but no renderer yet, the other three have neither.
 */
const MECHANICS: Record<string, MechanicRenderer> = {
  choice: ChoiceRenderer,
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
 * one routinely lands first — `select` is in exactly that state right now.
 * Grading with the comparator map alone would show the learner no input for such
 * a slot and then mark it `incorrect`: permanently wrong, for an answer they
 * were never given the chance to give. Nothing throws, nothing logs.
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
