/**
 * `select` — dropdown, one answer from a pool.
 *
 * Reports the selected ITEM ID, never its position or its visible text.
 * `pools.quantifiers` may hold `{ id: "i_honey", text: "honey" }`; reporting the
 * text would grade `["honey"]` against an answer of `["i_honey"]` and fail a
 * correct learner silently (docs/exercise-model.md, "Stable ids, never
 * positions").
 *
 * A NATIVE `<select>` on purpose, not a custom listbox. Zero dependencies,
 * keyboard and screen-reader behaviour for free, and on mobile it opens the OS
 * picker — which no hand-rolled menu matches. The cost is styling: native
 * control chrome does not inherit our dark tokens, so it is handled explicitly
 * below.
 */
import { Label } from '@/components/ui/label';
import { splitLabelAtBlank } from '@/lib/exercisePayload';
import BlankSentence from './BlankSentence';
import { CONTROL_SCALE, PROMPT_MEASURE, PROMPT_SCALE } from './scale';
import type { MechanicRendererProps } from './types';

/**
 * Visual tokens shared by both layouts, so a spliced dropdown and a stacked one
 * on the same page cannot drift apart.
 *
 * `font-sans` OPTS THIS CONTROL OUT OF THE EXERCISE DISPLAY FACE, and it is the
 * one mechanic that has to. A native `<select>` renders its closed state with a
 * SINGLE font — the element's own — so it cannot show the placeholder in one
 * face and the chosen answer in another. Its default state is the placeholder,
 * which is Spanish chrome ("Elegir una opción"), and ChunkFive has no accented
 * glyphs at all: the `ó` alone would fall back to Raleway mid-word, inside a
 * control the learner is looking straight at.
 *
 * The cost is real and accepted: an inline dropdown reads in the UI face while
 * the sentence around it reads in the display face. That is the same seam the
 * `drop` mechanic already shows on its empty-box hint, so the rule is at least
 * consistent — CONTENT gets the display face, a CONTROL'S CHROME does not.
 */
const SELECT_BASE =
  'font-sans rounded-md border border-input bg-card px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Inline: `w-auto` so the control is only as wide as its longest option — a
 * fixed width next to two-letter quantifiers reads as a form field, not a gap.
 * `max-w-full` keeps a long option from forcing horizontal scroll on a phone.
 *
 * `CONTROL_SCALE` makes `w-auto` mean the right thing at display size: the
 * intrinsic width of a native select is derived from its option TEXT, so the
 * font-size is what decides whether the gap looks like part of the sentence or
 * like a body-size widget dropped into a headline.
 */
const SELECT_INLINE = `mx-1 inline-block w-auto max-w-full align-baseline ${CONTROL_SCALE}`;

/**
 * Stacked: no sentence to inherit from, so it is sized directly — one step below
 * the prompt above it.
 */
const SELECT_STACKED = 'w-full max-w-md text-xl';

/**
 * Fallback for the empty option when the island passes no localized copy.
 *
 * Language-neutral so a standalone render is never accidentally English in a
 * Spanish page. The island supplies real copy in practice.
 */
const DEFAULT_PLACEHOLDER = '—';

export default function SelectRenderer({
  slot,
  items,
  value,
  onChange,
  disabled = false,
  placeholder = DEFAULT_PLACEHOLDER,
  focusRef,
}: MechanicRendererProps) {
  // Single-answer mechanic: the array carries at most one id. `''` selects the
  // placeholder, which keeps the control CONTROLLED and keeps "nothing chosen"
  // representable.
  const selected = value[0] ?? '';

  // Scoped by slot id: the same pool may back several slots on one page.
  const selectId = `${slot.id}-select`;

  // `null` means the author wrote no gap — a real style, not a broken label.
  const parts = splitLabelAtBlank(slot.label);

  const box = (
      <select
        // The one focusable control this mechanic owns.
        ref={focusRef}
        id={selectId}
        value={selected}
        disabled={disabled}
        // Inline only, and deliberately NOT `aria-labelledby` pointing at the
        // sentence. Under the accessible-name algorithm a referenced subtree
        // containing a `combobox` folds that combobox's OWN selected option into
        // the computed name, so the question would mutate into the learner's
        // current answer as they answer it. An `aria-label` is a flat string with
        // no subtree to recurse into, and it reproduces the stacked layout's
        // accessible name exactly.
        aria-label={parts ? slot.label : undefined}
        onChange={(event) => {
          const next = event.target.value;
          // The placeholder CLEARS the answer. Reporting `['']` would submit an
          // empty-string id that matches no pool item, so grading would mark it
          // WRONG rather than unanswered — and it would unlock submit, undoing
          // the non-attempt guard.
          onChange(next.length > 0 ? [next] : []);
        }}
        // `color-scheme: dark` is the only thing that reaches the parts of a
        // native select we cannot style: the dropdown popup the OS draws, and
        // the disclosure arrow. Without it, Chrome on Windows paints a light
        // popup and this theme's light text lands on it unreadably. Inline
        // rather than a utility class so it does not depend on a Tailwind
        // version shipping a `scheme-*` utility.
        style={{ colorScheme: 'dark' }}
        className={`${SELECT_BASE} ${parts ? SELECT_INLINE : SELECT_STACKED}`}
      >
        {/* An explicit empty option, so "nothing chosen yet" is a real state.
            Without it the browser preselects the first pool item and answers on
            the learner's behalf — a wrong answer that looks deliberate. */}
        <option value="" className="bg-card text-foreground">
          {placeholder}
        </option>

        {items.map((item) => (
          // `bg-card` on each option too: on Windows the popup list takes its
          // colours from the OPTION, not from the select.
          <option key={item.id} value={item.id} className="bg-card text-foreground">
            {item.text ?? item.id}
          </option>
        ))}
      </select>
  );

  // No gap to splice into: keep the stacked layout exactly as it was. A real
  // `<label htmlFor>` beats any ARIA attribute when the DOM allows one.
  if (!parts) {
    return (
      <div className="flex flex-col gap-4">
        <Label
          htmlFor={selectId}
          className={`${PROMPT_SCALE} ${PROMPT_MEASURE} font-medium text-zinc-100`}
        >
          {slot.label}
        </Label>
        {box}
      </div>
    );
  }

  return (
    <BlankSentence slotId={slot.id} before={parts.before} after={parts.after}>
      {box}
    </BlankSentence>
  );
}
