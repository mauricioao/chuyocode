/**
 * SlotExplanation — the D5 "¿Por qué?" note, shown only once a slot has been
 * graded `incorrect` (never before checking, never for a correct answer).
 *
 * SHARED between `ExerciseIsland` (curated exercises) and `QuizBlockPractice`
 * (activities' quiz block) — both read the SAME `Slot.explanation` field
 * (`exercisePayload.ts`) and show it the SAME way: inline, under the
 * question, because both have the room a worksheet zone's tiny drawn
 * rectangle does not (`WorksheetPlayer.tsx`'s own popover is the version for
 * THAT space constraint, not this one).
 *
 * `role="status"` so the note is announced politely the moment it appears —
 * the caller decides WHEN to mount it (its own `slot.explanation && outcome
 * === 'incorrect'` check), this component only draws it once asked to, so
 * "how" stays in one place no matter how many callers end up with a "when".
 */
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';

export interface SlotExplanationProps {
  /** The authored explanation text. Expected non-empty — callers only mount
   * this once `slot.explanation` is truthy. */
  text: string;
  /** The caller's own testid, so each existing suite keeps its exact string. */
  testId: string;
}

export default function SlotExplanation({ text, testId }: SlotExplanationProps) {
  return (
    <div
      data-testid={testId}
      role="status"
      className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground"
    >
      <LightbulbIcon aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
      <p>{text}</p>
    </div>
  );
}
