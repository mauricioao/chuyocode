/**
 * VariosJuegosRow — one "Varios juegos" question as a simple Pregunta |
 * Respuesta row (R3, "the same building experience as the four templates"):
 * by default a plain TEXT question, same shape as a `MatchPairsEditor` pair,
 * with a per-row "Agregar opciones" toggle into multiple choice (and back)
 * driven by the SAME `onTypeChange` callback `QuestionCard` already took —
 * `changeQuestionSegment` (`quizQuestionType.ts`) does the preserving work
 * either way, so toggling never loses the question text or a text answer
 * already typed.
 *
 * PER-ROW ESCAPE ("Editor avanzado"): a `gap` question (select/drop) or a
 * `text` question with more than one accepted answer cannot be shown by this
 * simple row without silently dropping something on the next edit
 * (`quizQuestionType.ts`'s own `needsAdvancedEditor`) — those shapes render
 * the full {@link QuestionCard} automatically instead, so every shape the
 * old editor supported stays fully editable, never lost. The same old card
 * is also reachable VOLUNTARILY for any row (the only way, from this
 * simpler view, to set a question's optional "¿Por qué?" explanation).
 *
 * Props are exactly `QuestionCard`'s own, plus one addition
 * (`onPasteIntoRow`, bulk paste N5): this row only decides WHICH UI renders
 * for a slot, never a second way to mutate it.
 */
import { useState } from 'react';
import { needsAdvancedEditor, segmentForInput } from '@/lib/quizQuestionType';
import { cn } from '@/lib/utils';
import QuestionCard, { type QuestionCardProps } from './QuestionCard';
import { RowRemoveButton, TemplateField, TemplateRow } from './TemplateEditorKit';

export const COPY = {
  es: {
    questionLabel: 'Pregunta',
    answerLabel: 'Respuesta',
    questionPlaceholder: 'Escribe la pregunta',
    answerPlaceholder: 'Respuesta',
    removeRow: 'Eliminar pregunta',
    addOptions: 'Agregar opciones',
    removeOptions: 'Quitar opciones',
    openAdvanced: 'Editor avanzado',
    closeAdvanced: 'Cerrar editor avanzado',
    addOption: '+ Agregar opción',
    markCorrect: 'Marcar como correcta',
    removeOption: 'Quitar esta opción',
    optionPlaceholder: 'Opción',
  },
  en: {
    questionLabel: 'Question',
    answerLabel: 'Answer',
    questionPlaceholder: 'Write the question',
    answerPlaceholder: 'Answer',
    removeRow: 'Delete question',
    addOptions: 'Add options',
    removeOptions: 'Remove options',
    openAdvanced: 'Advanced editor',
    closeAdvanced: 'Close advanced editor',
    addOption: '+ Add option',
    markCorrect: 'Mark as correct',
    removeOption: 'Remove this option',
    optionPlaceholder: 'Option',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface VariosJuegosRowProps extends QuestionCardProps {
  /** A paste landed in this row's question or answer field — bulk-paste (N5), handled by the caller just like `MatchPairsEditor`'s own `onPastePairs`. `undefined` while escaped to {@link QuestionCard} (no bulk paste there, same as the old editor). */
  onPasteIntoRow?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
}

/** Pregunta | divider | Respuesta-or-opciones | "×" — same column shape `MatchPairsEditor.tsx`'s own `PAIR_GRID` uses. */
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)_2.25rem] items-start';

export default function VariosJuegosRow(props: VariosJuegosRowProps) {
  const {
    slot,
    index,
    lang,
    poolItems,
    dragHandle,
    highlighted = false,
    incompleteMessage = null,
    onLabelChange,
    onTypeChange,
    onMarkCorrect,
    onAddOption,
    onRemoveOption,
    onSetOptionText,
    onAnswerChange,
    onDelete,
    onPasteIntoRow,
  } = props;
  const t = copyFor(lang);
  const [manualAdvanced, setManualAdvanced] = useState(false);
  const forcedAdvanced = needsAdvancedEditor(slot.input, slot.answer.length);
  const showAdvanced = forcedAdvanced || manualAdvanced;
  const segment = segmentForInput(slot.input);

  if (showAdvanced) {
    return (
      <div data-testid={`varios-row-${slot.id}`} className="flex flex-col gap-1">
        {!forcedAdvanced && (
          <button
            type="button"
            data-testid={`varios-advanced-toggle-${slot.id}`}
            onClick={() => setManualAdvanced(false)}
            className="w-fit text-xs font-medium text-accent-ink hover:underline"
          >
            {t.closeAdvanced}
          </button>
        )}
        <QuestionCard {...props} />
      </div>
    );
  }

  return (
    <TemplateRow testId={`varios-row-${slot.id}`}>
      <div
        data-highlighted={highlighted ? 'true' : undefined}
        className={cn(ROW_GRID, highlighted && 'ring-2 ring-primary')}
      >
        <div className="flex min-w-0 flex-col gap-1 py-2 pl-4">
          {dragHandle}
          <TemplateField
            aria-label={`${t.questionLabel} ${index}`}
            placeholder={t.questionPlaceholder}
            data-testid={`varios-question-${slot.id}`}
            value={slot.label}
            onChange={(event) => onLabelChange(event.target.value)}
            onPaste={onPasteIntoRow}
          />
        </div>
        <span aria-hidden="true" className="h-7 w-px bg-foreground/[0.08]" />
        <div className="flex min-w-0 flex-col gap-2 py-2">
          {segment === 'choice' ? (
            <div className="flex flex-col gap-1.5" data-testid={`varios-options-${slot.id}`}>
              {poolItems.map((item) => {
                const correct = slot.answer[0] === item.id;
                return (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`${slot.id}-varios-correct`}
                      aria-label={t.markCorrect}
                      data-testid={`varios-option-correct-${slot.id}-${item.id}`}
                      checked={correct}
                      onChange={() => onMarkCorrect(item.id)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <TemplateField
                      aria-label={t.optionPlaceholder}
                      placeholder={t.optionPlaceholder}
                      data-testid={`varios-option-text-${slot.id}-${item.id}`}
                      value={item.text ?? ''}
                      onChange={(event) => onSetOptionText(item.id, event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={t.removeOption}
                      data-testid={`varios-option-remove-${slot.id}-${item.id}`}
                      onClick={() => onRemoveOption(item.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                data-testid={`varios-option-add-${slot.id}`}
                onClick={onAddOption}
                className="w-fit text-sm font-medium text-accent-ink hover:underline"
              >
                {t.addOption}
              </button>
            </div>
          ) : (
            <TemplateField
              aria-label={`${t.answerLabel} ${index}`}
              placeholder={t.answerPlaceholder}
              data-testid={`varios-answer-${slot.id}`}
              value={slot.answer[0] ?? ''}
              onChange={(event) => onAnswerChange(event.target.value.trim() === '' ? [] : [event.target.value])}
              onPaste={onPasteIntoRow}
            />
          )}

          {incompleteMessage && (
            <p data-testid={`question-incomplete-${slot.id}`} className="text-sm text-destructive">
              {incompleteMessage}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid={segment === 'choice' ? `varios-remove-options-${slot.id}` : `varios-add-options-${slot.id}`}
              onClick={() => onTypeChange(segment === 'choice' ? 'text' : 'choice', false)}
              className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              {segment === 'choice' ? t.removeOptions : t.addOptions}
            </button>
            <button
              type="button"
              data-testid={`varios-advanced-toggle-${slot.id}`}
              onClick={() => setManualAdvanced(true)}
              className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              {t.openAdvanced}
            </button>
          </div>
        </div>
        <div className="flex justify-end pr-3 pt-2">
          <RowRemoveButton label={`${t.removeRow} ${index}`} testId={`varios-remove-${slot.id}`} onRemove={onDelete} />
        </div>
      </div>
    </TemplateRow>
  );
}
