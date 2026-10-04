/**
 * RowBlockEditor — the sentence textarea for one `row` block's slot, with
 * LIVE gap feedback (slice 15, design.md §8;
 * specs/exercise-authoring/spec.md, "Authoring Uses a Plain Textarea with
 * Live Gap Parsing").
 *
 * A PLAIN `<textarea>`, live-parsed with the SAME `splitLabelAtBlank` the
 * real renderers use (`exercisePayload.ts`) — no second parser to drift
 * from the one that will actually render this sentence. `contenteditable`
 * was rejected for the reasons design §8 states: unsolved cross-browser
 * cursor/IME behavior, with accented Spanish input the most exposed
 * population.
 *
 * Answer/mechanic editing (`SlotAnswerEditor`) is a SEPARATE component,
 * slice 16 — this editor owns only the sentence and its gap, matching the
 * design's own file table.
 */
import { useState } from 'react';
import { splitLabelAtBlank, type Slot } from '@/lib/exercisePayload';
import { Textarea } from '@/components/ui/textarea';

export const COPY = {
  es: {
    label: 'Enunciado (usa ___ para el espacio en blanco)',
    remove: 'Quitar esta parte del ejercicio',
    gapBefore: 'Antes del espacio:',
    gapAfter: 'Después del espacio:',
    noGap: 'Sin espacio en blanco detectado todavía.',
  },
  en: {
    label: 'Sentence (use ___ for the blank)',
    remove: 'Remove this part of the exercise',
    gapBefore: 'Before the gap:',
    gapAfter: 'After the gap:',
    noGap: 'No blank detected yet.',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface RowBlockEditorProps {
  slot: Slot;
  lang: string;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
  /** Slice 16 mounts `SlotAnswerEditor` here for this same slot. */
  answerEditor?: React.ReactNode;
}

export default function RowBlockEditor({
  slot,
  lang,
  onLabelChange,
  onRemove,
  answerEditor,
}: RowBlockEditorProps) {
  const t = copyFor(lang);
  // Local state drives the textarea AND the live preview from the same
  // value on every render — there is no separate "parse" step to invoke.
  const [label, setLabel] = useState(slot.label);
  const parts = splitLabelAtBlank(label);
  const fieldId = `${slot.id}-label`;

  function handleChange(value: string) {
    setLabel(value);
    onLabelChange(value);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
          {t.label}
        </label>
        <button
          type="button"
          aria-label={t.remove}
          data-testid={`remove-row-${slot.id}`}
          className="text-sm text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          &times;
        </button>
      </div>

      <Textarea
        id={fieldId}
        data-testid={`row-label-${slot.id}`}
        value={label}
        onChange={(event) => handleChange(event.target.value)}
        rows={2}
      />

      {/* THE LIVE FEEDBACK — no reload, no explicit "parse" button. Reads the
          SAME `label` state the textarea itself is bound to, so it can never
          lag a keystroke behind. */}
      <p data-testid={`row-gap-preview-${slot.id}`} className="text-sm text-muted-foreground">
        {parts ? (
          <>
            <span className="font-medium">{t.gapBefore}</span> "{parts.before}" —{' '}
            <span className="font-medium">{t.gapAfter}</span> "{parts.after}"
          </>
        ) : (
          t.noGap
        )}
      </p>

      {answerEditor}
    </div>
  );
}
