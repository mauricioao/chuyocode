/**
 * SlotExplanationEditor — the optional "¿Por qué?" (D5) field for one slot
 * (curated-exercise authoring; mirrors activities' own quiz-block field,
 * `QuizBlockEditor.tsx`'s `explanationLabel`/`explanationPlaceholder`/
 * `explanationHint`, so the two authoring surfaces read the same way).
 *
 * A SEPARATE component from `SlotAnswerEditor`, same reasoning
 * `RowBlockEditor.tsx`'s own header gives for keeping answer editing out of
 * the sentence editor: one responsibility per file. `ExerciseAuthorIsland`
 * mounts this alongside `SlotAnswerEditor`, both inside `RowBlockEditor`'s
 * generic `answerEditor` slot.
 *
 * Fully controlled, no local echo: unlike `RowBlockEditor`'s label field
 * (which keeps local state for its live gap-math preview), this has no
 * derived preview to keep in sync, so it binds straight to `slot.explanation`
 * — the same plain-controlled shape `QuizBlockEditor`'s and
 * `WorksheetZoneEditor`'s own explanation fields already use.
 *
 * COPY IS LOCAL, same rule as every other island in this codebase.
 */
import { MAX_SLOT_EXPLANATION_LENGTH, type Slot } from '@/lib/exercisePayload';
import { Textarea } from '@/components/ui/textarea';

export const COPY = {
  es: {
    explanationLabel: '¿Por qué? (explicación)',
    explanationPlaceholder: 'Explicación opcional',
    explanationHint: 'Se muestra al alumno si se equivoca',
  },
  en: {
    explanationLabel: 'Why? (explanation)',
    explanationPlaceholder: 'Optional explanation',
    explanationHint: 'Shown to the learner if they get it wrong',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface SlotExplanationEditorProps {
  slot: Slot;
  lang: string;
  onExplanationChange: (explanation: string) => void;
}

export default function SlotExplanationEditor({
  slot,
  lang,
  onExplanationChange,
}: SlotExplanationEditorProps) {
  const t = copyFor(lang);
  const fieldId = `${slot.id}-explanation`;

  return (
    <div className="flex flex-col gap-1" data-testid={`slot-explanation-editor-${slot.id}`}>
      <label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
        {t.explanationLabel}
      </label>
      <Textarea
        id={fieldId}
        data-testid={`slot-explanation-input-${slot.id}`}
        value={slot.explanation ?? ''}
        maxLength={MAX_SLOT_EXPLANATION_LENGTH}
        placeholder={t.explanationPlaceholder}
        onChange={(event) => onExplanationChange(event.target.value)}
        rows={2}
        className="resize-none"
      />
      <span className="text-xs text-muted-foreground">{t.explanationHint}</span>
    </div>
  );
}
