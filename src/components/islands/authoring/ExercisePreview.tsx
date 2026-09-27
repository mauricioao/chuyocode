/**
 * ExercisePreview — mounts the REAL `ExerciseIsland` against the current
 * draft (slice 15, design.md §8: "WYSIWYG preview").
 *
 * `ExerciseIsland` is pure-prop: no fetch, no storage, no identity. So this
 * is the whole preview — there is no second renderer to keep in sync, which
 * is what makes the authoring surface WYSIWYG by construction rather than
 * by discipline.
 */
import ExerciseIsland, { type ExerciseBadge } from '@/components/islands/ExerciseIsland';
import type { Payload } from '@/lib/exercisePayload';

export interface ExercisePreviewProps {
  lang: string;
  payload: Payload;
  badges?: readonly ExerciseBadge[];
}

export default function ExercisePreview({ lang, payload, badges }: ExercisePreviewProps) {
  return (
    <div data-testid="exercise-preview">
      <ExerciseIsland lang={lang} payload={payload} badges={badges} />
    </div>
  );
}
