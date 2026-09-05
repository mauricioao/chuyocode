/**
 * The degraded state for a slot whose mechanic has no renderer.
 *
 * This is the safety valve that keeps a content/code drift from taking the page
 * down: the unknown slot alone degrades, and the rest of the exercise still
 * renders and still grades (docs/exercise-model.md, "Why this cannot break
 * existing exercises", point 3).
 *
 * It deliberately offers NO control. A slot we cannot render is a slot we
 * cannot grade, so showing an input would invite an answer we would then have
 * to mark wrong — penalizing the learner for our deployment gap.
 *
 * Not a {@link MechanicRendererProps} component on purpose: it takes localized
 * copy and no `onChange`, because there is nothing to change.
 */
import type { Slot } from '@/lib/exercisePayload';

export interface UnavailableRendererProps {
  slot: Slot;
  /** Localized explanation, owned by the island's COPY map. */
  message: string;
}

export default function UnavailableRenderer({
  slot,
  message,
}: UnavailableRendererProps) {
  return (
    <div className="flex flex-col gap-2">
      {slot.label.length > 0 && (
        <p className="text-base font-medium text-zinc-100">{slot.label}</p>
      )}
      <p
        role="status"
        data-testid={`slot-unavailable-${slot.id}`}
        className="rounded-lg border border-dashed border-base-muted bg-base-muted/40 p-3 text-sm text-zinc-400"
      >
        {message}
      </p>
    </div>
  );
}
