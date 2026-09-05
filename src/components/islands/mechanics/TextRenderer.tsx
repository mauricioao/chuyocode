/**
 * `text` — fill in the blank. The learner types; there is no pool.
 *
 * `slot.answer` holds the ACCEPTED alternatives as literal strings
 * (`["sits", "is sitting"]`), not pool ids — the one place in the model where
 * an answer is not an id (docs/exercise-model.md, "Authoring checklist").
 *
 * This renderer reports the typed string VERBATIM. Trimming and case-folding
 * belong to the `text` comparator in exerciseGrading.ts, which already does both
 * and is tested there. Normalizing here too would give the codebase two
 * definitions of "equal answer", only one of which is under test, and they would
 * drift the first time either side changes its mind about inner whitespace.
 */
import { Label } from '@/components/ui/label';
import type { MechanicRendererProps } from './types';

export default function TextRenderer({
  slot,
  value,
  onChange,
  disabled = false,
}: MechanicRendererProps) {
  // Single-answer mechanic: the array carries at most one string. Coalescing to
  // `''` keeps the input CONTROLLED — `undefined` would make React switch it to
  // uncontrolled mid-life and warn.
  const typed = value[0] ?? '';

  // Scoped by slot id: one page may carry several blanks.
  const inputId = `${slot.id}-text`;

  return (
    <div className="flex flex-col gap-2">
      {/* The label is rendered AS AUTHORED, `___` included. Splicing the field
          into the sentence is a separate feature; guessing at it here would
          silently reinterpret authored content. */}
      <Label htmlFor={inputId} className="text-base font-medium text-zinc-100">
        {slot.label}
      </Label>

      <input
        id={inputId}
        type="text"
        value={typed}
        disabled={disabled}
        autoComplete="off"
        // Browser assistance actively fights a language exercise: it would
        // correct the very mistakes the exercise is testing for.
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          // An emptied field is a NON-ANSWER, not the answer `""`. Reporting
          // `['']` is an array of length 1, which `hasSubmittableAnswer` reads
          // as "answered" — re-arming the bug where submit graded an untouched
          // exercise as Incorrect. Only the empty string maps to `[]`; no
          // character is ever altered, so this is not normalization.
          onChange(next.length > 0 ? [next] : []);
        }}
        className="w-full max-w-sm rounded-md border border-input bg-input/30 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
