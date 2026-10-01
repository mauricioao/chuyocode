/**
 * QuestionCard — one question's self-contained editor (owner build item 1,
 * "Question cards (Google Forms-style)"): sentence, a plain-language type
 * control, options/answers, and a collapsed "Más opciones" footer — all in
 * ONE always-visible card instead of a separate list row plus a
 * select-to-reveal panel. Nothing technical is shown here: no ids, pools, or
 * mechanic names leak into copy or layout — those stay inside
 * `quizQuestionType.ts`'s mapping and `QuizBlockEditor`'s own plumbing.
 *
 * STATELESS BY DESIGN, like `SlotAnswerEditor`: every mutation flows back
 * through a callback into the caller's `Draft`; `slot`/`poolItems` are the
 * single source of truth re-rendered after each commit, so there is no local
 * draft copy to fall out of sync. ID generation for a new option is the
 * CALLER'S job (`authoringDraft.ts`'s own rule) — `onAddOption` here takes no
 * argument.
 *
 * The card never renders its own drag handle or `<li>` wrapper — the parent
 * supplies `dragHandle` so the dnd-kit `useSortable` wiring stays exactly
 * where `QuizBlockEditor` already owns it.
 */
import { useEffect, useRef, useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CopySimpleIcon } from '@phosphor-icons/react/dist/ssr/CopySimple';
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { MAX_SLOT_EXPLANATION_LENGTH, type PoolItem, type Slot } from '@/lib/exercisePayload';
import { isDropGap, segmentForInput, type QuestionSegment } from '@/lib/quizQuestionType';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const COPY = {
  es: {
    questionLabel: 'Pregunta',
    questionPlaceholder: 'Escribe la pregunta',
    gapHint: 'Usa ___ para el espacio en blanco',
    typeChoice: 'Opción múltiple',
    typeText: 'Escribir la respuesta',
    typeGap: 'Completar el espacio',
    showAsDrop: 'Mostrar como fichas para arrastrar',
    correctAnswer: 'Correcta',
    markCorrect: 'Marcar como correcta',
    optionPlaceholder: 'Opción',
    addOption: '+ Agregar opción',
    removeOption: 'Quitar esta opción',
    acceptedAnswers: 'Respuestas aceptadas',
    answerChipPlaceholder: 'Escribe una respuesta y presiona Enter',
    removeAnswer: 'Quitar esta respuesta',
    moreOptions: 'Más opciones',
    explanationLabel: '¿Por qué? (explicación)',
    explanationPlaceholder: 'Explicación opcional',
    explanationHint: 'Se muestra al alumno si se equivoca',
    duplicate: 'Duplicar pregunta',
    deleteQuestion: 'Eliminar pregunta',
  },
  en: {
    questionLabel: 'Question',
    questionPlaceholder: 'Write the question',
    gapHint: 'Use ___ for the blank',
    typeChoice: 'Multiple choice',
    typeText: 'Type the answer',
    typeGap: 'Fill in the blank',
    showAsDrop: 'Show as draggable tiles',
    correctAnswer: 'Correct',
    markCorrect: 'Mark as correct',
    optionPlaceholder: 'Option',
    addOption: '+ Add option',
    removeOption: 'Remove this option',
    acceptedAnswers: 'Accepted answers',
    answerChipPlaceholder: 'Type an answer and press Enter',
    removeAnswer: 'Remove this answer',
    moreOptions: 'More options',
    explanationLabel: 'Why? (explanation)',
    explanationPlaceholder: 'Optional explanation',
    explanationHint: 'Shown to the learner if they get it wrong',
    duplicate: 'Duplicate question',
    deleteQuestion: 'Delete question',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface QuestionCardProps {
  slot: Slot;
  index: number;
  lang: string;
  /** The resolved items of `slot.pool` — `[]` when unset or unnamed. */
  poolItems: PoolItem[];
  highlighted?: boolean;
  incompleteMessage?: string | null;
  dragHandle?: React.ReactNode;
  onLabelChange: (label: string) => void;
  onTypeChange: (segment: QuestionSegment, asDrop: boolean) => void;
  onMarkCorrect: (itemId: string) => void;
  onAddOption: () => void;
  onRemoveOption: (itemId: string) => void;
  onSetOptionText: (itemId: string, text: string) => void;
  onAnswerChange: (answer: string[]) => void;
  onExplanationChange: (explanation: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function QuestionCard({
  slot,
  index,
  lang,
  poolItems,
  highlighted = false,
  incompleteMessage = null,
  dragHandle,
  onLabelChange,
  onTypeChange,
  onMarkCorrect,
  onAddOption,
  onRemoveOption,
  onSetOptionText,
  onAnswerChange,
  onExplanationChange,
  onDuplicate,
  onDelete,
}: QuestionCardProps) {
  const t = copyFor(lang);
  const segment = segmentForInput(slot.input);
  const asDrop = isDropGap(slot.input);
  const pooled = segment === 'choice' || segment === 'gap';
  const [showMore, setShowMore] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');

  const optionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const prevOptionCount = useRef(poolItems.length);
  useEffect(() => {
    if (poolItems.length > prevOptionCount.current) {
      const last = poolItems[poolItems.length - 1];
      if (last) optionRefs.current[last.id]?.focus();
    }
    prevOptionCount.current = poolItems.length;
  }, [poolItems]);

  function addAnswerChip() {
    const value = answerDraft.trim();
    if (value.length === 0) return;
    onAnswerChange([...slot.answer, value]);
    setAnswerDraft('');
  }

  return (
    <div
      data-testid={`question-card-${slot.id}`}
      data-highlighted={highlighted ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-background p-4',
        highlighted && 'ring-2 ring-primary',
      )}
    >
      <div className="flex items-start gap-2">
        {dragHandle}
        <span className="mt-2 shrink-0 text-sm font-medium text-muted-foreground">{index}.</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`${slot.id}-question-text`} className="sr-only">
            {t.questionLabel}
          </label>
          <Textarea
            id={`${slot.id}-question-text`}
            data-testid={`question-text-${slot.id}`}
            value={slot.label}
            placeholder={t.questionPlaceholder}
            onChange={(event) => onLabelChange(event.target.value)}
            rows={2}
          />
          {segment === 'gap' && (
            <span
              data-testid={`gap-hint-${slot.id}`}
              className="w-fit rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {t.gapHint}
            </span>
          )}
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={t.questionLabel}
        data-testid={`question-type-${slot.id}`}
        className="flex w-fit flex-wrap gap-1 rounded-lg border border-border p-1"
      >
        {(
          [
            ['choice', t.typeChoice],
            ['text', t.typeText],
            ['gap', t.typeGap],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={segment === value}
            data-testid={`question-type-${slot.id}-${value}`}
            onClick={() => onTypeChange(value, value === 'gap' ? asDrop : false)}
            className={cn(
              'max-lg:min-h-11 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              segment === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {segment === 'gap' && (
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            data-testid={`show-as-drop-${slot.id}`}
            checked={asDrop}
            onCheckedChange={(checked) => onTypeChange('gap', checked === true)}
          />
          {t.showAsDrop}
        </label>
      )}

      {pooled && (
        <div className="flex flex-col gap-2" data-testid={`question-options-${slot.id}`}>
          {poolItems.map((item) => {
            const correct = slot.answer[0] === item.id;
            return (
              <div
                key={item.id}
                data-testid={`question-option-${slot.id}-${item.id}`}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5',
                  correct && 'border-primary/40 bg-primary/5',
                )}
              >
                <input
                  ref={(node) => {
                    optionRefs.current[item.id] = node;
                  }}
                  type="radio"
                  name={`${slot.id}-correct`}
                  aria-label={t.markCorrect}
                  data-testid={`question-option-correct-${slot.id}-${item.id}`}
                  checked={correct}
                  onChange={() => onMarkCorrect(item.id)}
                  className="size-4 max-lg:size-6 shrink-0 accent-primary"
                />
                <Input
                  type="text"
                  fieldSize="sm"
                  aria-label={t.optionPlaceholder}
                  placeholder={t.optionPlaceholder}
                  data-testid={`question-option-text-${slot.id}-${item.id}`}
                  value={item.text ?? ''}
                  onChange={(event) => onSetOptionText(item.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
                    const isLast = poolItems[poolItems.length - 1]?.id === item.id;
                    if (!isLast) return;
                    event.preventDefault();
                    onAddOption();
                  }}
                  className="min-w-0 flex-1"
                />
                {correct && (
                  <span className="shrink-0 text-xs font-medium text-primary">{t.correctAnswer}</span>
                )}
                <button
                  type="button"
                  aria-label={t.removeOption}
                  data-testid={`question-remove-option-${slot.id}-${item.id}`}
                  onClick={() => onRemoveOption(item.id)}
                  className="flex max-lg:min-h-11 max-lg:min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <XIcon aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            data-testid={`question-add-option-${slot.id}`}
            onClick={onAddOption}
            className="min-h-11 w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {t.addOption}
          </button>
        </div>
      )}

      {segment === 'text' && (
        <div className="flex flex-col gap-2" data-testid={`question-answers-${slot.id}`}>
          <span className="text-sm font-semibold text-foreground">{t.acceptedAnswers}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {slot.answer.map((value, i) => (
              <span
                key={`${value}-${i}`}
                data-testid={`question-answer-chip-${slot.id}-${i}`}
                className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm text-foreground"
              >
                {value}
                <button
                  type="button"
                  aria-label={t.removeAnswer}
                  data-testid={`question-remove-answer-${slot.id}-${i}`}
                  onClick={() => onAnswerChange(slot.answer.filter((_, idx) => idx !== i))}
                  className="flex max-lg:min-h-11 max-lg:min-w-11 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <XIcon aria-hidden="true" size={12} />
                </button>
              </span>
            ))}
          </div>
          <Input
            type="text"
            fieldSize="sm"
            aria-label={t.acceptedAnswers}
            placeholder={t.answerChipPlaceholder}
            data-testid={`question-answer-input-${slot.id}`}
            value={answerDraft}
            onChange={(event) => setAnswerDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
              event.preventDefault();
              addAnswerChip();
            }}
            className="w-full max-w-sm"
          />
        </div>
      )}

      {incompleteMessage && (
        <p data-testid={`question-incomplete-${slot.id}`} className="text-sm text-destructive">
          {incompleteMessage}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          data-testid={`question-more-options-${slot.id}`}
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
          className="flex max-lg:min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <CaretDownIcon
            aria-hidden="true"
            className={cn('transition-transform', showMore && 'rotate-180')}
          />
          {t.moreOptions}
        </button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-lg:size-11"
            aria-label={t.duplicate}
            data-testid={`question-duplicate-${slot.id}`}
            onClick={onDuplicate}
          >
            <CopySimpleIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-lg:size-11"
            aria-label={t.deleteQuestion}
            data-testid={`question-delete-${slot.id}`}
            onClick={onDelete}
          >
            <TrashIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      {showMore && (
        <div className="flex flex-col gap-1" data-testid={`question-more-panel-${slot.id}`}>
          <span className="text-xs font-medium text-muted-foreground">{t.explanationLabel}</span>
          <Textarea
            data-testid={`question-explanation-${slot.id}`}
            aria-label={t.explanationLabel}
            value={slot.explanation ?? ''}
            maxLength={MAX_SLOT_EXPLANATION_LENGTH}
            placeholder={t.explanationPlaceholder}
            onChange={(event) => onExplanationChange(event.target.value)}
            rows={2}
            className="resize-none"
          />
          <span className="text-xs text-muted-foreground">{t.explanationHint}</span>
        </div>
      )}
    </div>
  );
}
