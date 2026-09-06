/**
 * `choice` — multiple choice, one answer from a pool.
 *
 * Reports the selected ITEM ID, never its position. Positional answers break
 * silently the moment options are reordered or shuffled: the learner answers
 * correctly and is told they are wrong, with nothing thrown and nothing logged
 * (docs/exercise-model.md, "Stable ids, never positions").
 */
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { MechanicRendererProps } from './types';

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
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-base font-medium text-zinc-100">
        {slot.label}
      </legend>

      <RadioGroup
        value={selected}
        onValueChange={(next) => onChange([next])}
        disabled={disabled}
      >
        {items.map((item, index) => {
          // Scoped by slot id: the same pool may back several slots on one page.
          const inputId = `${slot.id}-${item.id}`;
          return (
            <div key={item.id} className="flex items-center gap-3">
              <RadioGroupItem
                id={inputId}
                value={item.id}
                // The group's focus entry point is its FIRST option, matching
                // where a keyboard user lands when nothing is selected. Radix
                // only auto-selects on focus while an arrow key is held (see
                // @radix-ui/react-radio-group dist/index.mjs L369-373), so a
                // programmatic focus here never answers for the learner.
                ref={index === 0 ? focusRef : undefined}
              />
              <Label htmlFor={inputId} className="cursor-pointer text-zinc-300">
                {item.text ?? item.id}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
