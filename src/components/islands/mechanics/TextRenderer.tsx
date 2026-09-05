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
import { splitLabelAtBlank } from '@/lib/exercisePayload';
import BlankSentence from './BlankSentence';
import type { MechanicRendererProps } from './types';

/**
 * Visual tokens shared by both layouts. Only FLOW differs between them, so the
 * border, background and focus ring cannot drift apart between a spliced blank
 * and a stacked one on the same page.
 */
const FIELD_BASE =
  'rounded-md border border-input bg-input/30 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Inline: sized in `ch` so the gap looks like a gap in a sentence rather than a
 * form field, `max-w-full` so it can never force horizontal scroll on a phone,
 * and `align-baseline` so the typed text sits on the same line as the words
 * around it instead of riding above them.
 */
const FIELD_INLINE = 'mx-1 inline-block w-[12ch] max-w-full align-baseline';

/** Stacked: unchanged from before this feature. */
const FIELD_STACKED = 'w-full max-w-sm';

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

  // `null` means the author wrote no gap — a real style, not a broken label.
  const parts = splitLabelAtBlank(slot.label);

  const field = (
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
      // Inline only. Splicing the field into the sentence breaks the
      // `<label htmlFor>` relationship — the sentence now CONTAINS the control,
      // and a label containing its own control folds that control's value into
      // its own accessible name. The full authored sentence, marker included,
      // rides on the attribute instead, so the name is byte-identical to the one
      // the stacked layout produced. On the stacked path this stays undefined and
      // the real `<label>` below does the work, which is strictly better.
      aria-label={parts ? slot.label : undefined}
      onChange={(event) => {
        const next = event.target.value;
        // An emptied field is a NON-ANSWER, not the answer `""`. Reporting
        // `['']` is an array of length 1, which `hasSubmittableAnswer` reads
        // as "answered" — re-arming the bug where submit graded an untouched
        // exercise as Incorrect. Only the empty string maps to `[]`; no
        // character is ever altered, so this is not normalization.
        onChange(next.length > 0 ? [next] : []);
      }}
      className={`${FIELD_BASE} ${parts ? FIELD_INLINE : FIELD_STACKED}`}
    />
  );

  // No gap to splice into: keep the stacked layout exactly as it was. A real
  // `<label htmlFor>` beats any ARIA attribute when the DOM allows one.
  if (!parts) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId} className="text-base font-medium text-zinc-100">
          {slot.label}
        </Label>
        {field}
      </div>
    );
  }

  return (
    <BlankSentence slotId={slot.id} before={parts.before} after={parts.after}>
      {field}
    </BlankSentence>
  );
}
