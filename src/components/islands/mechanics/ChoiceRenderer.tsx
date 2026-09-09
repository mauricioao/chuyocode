/**
 * `choice` — multiple choice, one answer from a pool.
 *
 * Reports the selected ITEM ID, never its position. Positional answers break
 * silently the moment options are reordered or shuffled: the learner answers
 * correctly and is told they are wrong, with nothing thrown and nothing logged
 * (docs/exercise-model.md, "Stable ids, never positions").
 *
 * OPTIONS ARE TILES IN A GRID, NOT A THIN VERTICAL LIST. A list of four short
 * options at body scale reads as a settings form; a grid of large tiles reads as
 * an activity you are meant to solve. Two columns from `sm` up, one on a phone —
 * side-by-side tiles at 320px would either overflow or truncate the option text,
 * and an unreadable option is worse than a scrolled one.
 *
 * STILL REAL RADIOS. The `RadioGroup` primitive is untouched: this is a restyle,
 * not a rebuild. Roving tab order, arrow-key navigation and the `radio` role all
 * come from Radix and would have to be re-implemented (badly) by any hand-rolled
 * tile. What changed is the box the radio sits in.
 */
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { PROMPT_MEASURE, PROMPT_SCALE } from './scale';
import type { MechanicRendererProps } from './types';

/**
 * One answer tile.
 *
 * THE SELECTED STATE IS DRIVEN BY `:has([data-state="checked"])`. Radix writes
 * `data-state` on the radio itself, so the tile — the radio's PARENT — cannot
 * carry that attribute and has to reach down for it. `data-state` is the same
 * attribute `radio-group.tsx` styles the dot against, deliberately: this repo
 * already shipped the bug where the generator emitted `data-checked:` variants,
 * which Tailwind compiles to `[data-checked]` — an attribute Radix never writes.
 * Nothing failed; the control simply looked identical checked or not.
 *
 * `:has()` DEGRADES SAFELY. Where it is unsupported the tile keeps its neutral
 * border and the radio's own amber dot still marks the answer, so the selection
 * is dimmer, never invisible. The dot is the source of truth; the tile amplifies
 * it.
 *
 * `min-h-20` is the tile's floor, not its height: a two-word option and a
 * clause-long one sit on the same grid row and must not be two different sizes.
 */
const TILE =
  'flex min-h-20 items-center gap-4 rounded-lg border-2 border-border bg-base-soft p-4 transition-colors sm:p-5 ' +
  'has-data-[state=checked]:border-accent has-data-[state=checked]:bg-accent/10 ' +
  'has-[:focus-visible]:border-accent';

export default function ChoiceRenderer({
  slot,
  items,
  value,
  onChange,
  disabled = false,
  focusRef,
}: MechanicRendererProps) {
  // Single-answer mechanic: the array carries at most one id.
  const selected = value[0] ?? '';

  return (
    <fieldset className="flex flex-col gap-4" disabled={disabled}>
      <legend
        className={`mb-4 ${PROMPT_SCALE} ${PROMPT_MEASURE} font-semibold text-zinc-100`}
      >
        {slot.label}
      </legend>

      <RadioGroup
        value={selected}
        onValueChange={(next) => onChange([next])}
        disabled={disabled}
        // Overrides the primitive's single-column `grid gap-2`. Two columns from
        // `sm` up; one below it, where a second column would shrink each tile
        // past the width its own text needs.
        className="grid gap-3 sm:grid-cols-2 sm:gap-4"
      >
        {items.map((item, index) => {
          // Scoped by slot id: the same pool may back several slots on one page.
          const inputId = `${slot.id}-${item.id}`;
          return (
            <div key={item.id} className={TILE}>
              <RadioGroupItem
                id={inputId}
                value={item.id}
                // The group's focus entry point is its FIRST option, matching
                // where a keyboard user lands when nothing is selected. Radix
                // only auto-selects on focus while an arrow key is held (see
                // @radix-ui/react-radio-group dist/index.mjs L369-373), so a
                // programmatic focus here never answers for the learner.
                ref={index === 0 ? focusRef : undefined}
                // The dot does not grow with the tile. It is a state INDICATOR
                // beside the answer, not the target you aim at — the whole tile
                // is the target, via the label below.
                className="shrink-0"
              />
              {/* `flex-1` is what makes the TILE clickable rather than just the
                  16px dot: the label stretches across the rest of the tile, and
                  a click anywhere on it is forwarded to the control it names.
                  A sibling `htmlFor` label, NOT a label wrapping the control —
                  same reason the spliced blanks carry `aria-label` instead of
                  `aria-labelledby` (1g): a label containing its own control
                  folds that control into its own accessible name. */}
              <Label
                htmlFor={inputId}
                className="flex-1 cursor-pointer text-lg font-medium text-zinc-100 sm:text-xl"
              >
                {item.text ?? item.id}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
