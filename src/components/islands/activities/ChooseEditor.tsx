/**
 * ChooseEditor — the authoring surface for a `template: 'choose'` quiz block
 * ("Elegir la respuesta", owner screen H in `propuestas/elegir-respuesta`).
 * Built from `TemplateEditorKit.tsx`'s own pieces, same posture as the other
 * template editors: ONE SMALL GROUPED CARD PER QUESTION, exactly like
 * `GroupSortEditor.tsx`'s card per group, with a dashed "Agregar pregunta"
 * ghost card after the last one. Each card's rows:
 *
 * - the question number and its SENTENCE, `___` marking each blank (one or
 *   two), plus the card's own round "×";
 * - the optional context image — `VariosJuegosRow.tsx`'s own
 *   {@link QuestionImageField}, reused as is (signed upload, `question-`
 *   prefix, the same `promptImages` plumbing);
 * - two to four OPTION fields. The FIRST is the correct one (✓ +
 *   "Correcta", never removable); the others carry a "×" while more than
 *   two are left. "Agregar opción" is the group's own last option row, up to
 *   four;
 * - the optional "¿Por qué?" explanation, a wrapping field
 *   ({@link TemplateTextArea}) capped at the length the payload accepts.
 *
 * Every card stays open: the kit has no collapsed-row pattern, and no other
 * template editor folds its rows, so this one does not invent one.
 *
 * STORAGE (`chooseAuthoring.ts`): each card is one Básico multiple-choice
 * slot — `answer[0]` is always the first option's id. This file is
 * stateless, like the other editors: every keystroke goes straight back up.
 *
 * READINESS NEVER CONTRADICTS THE PREVIEW (same rule as
 * `MatchPairsEditor.tsx`'s own `playable` doc): the amber hint is driven
 * entirely by `playable` (`boardHasContent('choose', …)` on the preview's own
 * debounced payload); the ready line counts `readyCount` playable questions.
 */
import { useEffect, useRef } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { ListNumbersIcon } from '@phosphor-icons/react/dist/ssr/ListNumbers';
import type { PromptImageRef } from '@/lib/activities/blocks';
import { MAX_CHOOSE_OPTIONS, MIN_CHOOSE_OPTIONS, type ChooseQuestionRow } from '@/lib/activities/chooseAuthoring';
import { isMultilinePaste } from '@/lib/activities/pasteLines';
import { MAX_SLOT_EXPLANATION_LENGTH } from '@/lib/exercisePayload';
import { parseChoosePaste, type ChoosePasteRow } from '@/lib/activities/pasteChoose';
import { QuestionImageField } from './VariosJuegosRow';
import {
  AddCard,
  AddRow,
  Footnote,
  GroupLabel,
  RowRemoveButton,
  SheetHeader,
  StatusNote,
  TemplateCollapse,
  TemplateField,
  TemplateGroup,
  TemplateRow,
  TemplateTextArea,
  useExitingItems,
  usePasteFeedback,
} from './TemplateEditorKit';

/** From this many questions on, the "more challenging" tip goes away — advisory only, never a gate. */
const CHALLENGING_QUESTION_COUNT = 5;

const COPY = {
  es: {
    title: 'Elegir la respuesta',
    instruction: 'Escribe la oración con ___ y sus opciones. La primera es la correcta; el juego las mezcla.',
    groupLabel: 'Preguntas',
    sentenceLabel: (n: number) => `Oración ${n}`,
    sentencePlaceholder: 'Escribe la oración con ___',
    exampleSentence: 'She ___ to school every day.',
    exampleCorrect: 'goes',
    exampleOther: 'go',
    correctLabel: (n: number) => `Opción correcta de la pregunta ${n}`,
    optionLabel: (n: number, option: number) => `Opción ${option} de la pregunta ${n}`,
    correctPlaceholder: 'Respuesta correcta',
    optionPlaceholder: 'Otra opción',
    correctTag: 'Correcta',
    addOption: 'Agregar opción',
    removeOption: 'Quitar esta opción',
    removeQuestion: (n: number) => `Quitar la pregunta ${n}`,
    addQuestion: 'Agregar pregunta',
    whyLabel: '¿Por qué? (opcional)',
    whyPlaceholder: 'Explica la respuesta correcta',
    emptyHint: 'Escribe una oración y dos opciones para ver el juego',
    ready: (n: number) => `Listo para jugar · ${n === 1 ? '1 pregunta' : `${n} preguntas`}`,
    tip: `Con ${CHALLENGING_QUESTION_COUNT} preguntas o más, el juego es más retador.`,
    blankHint: 'Marca cada espacio con ___ (uno o dos). Con dos espacios, separa las partes de cada opción con /.',
    pasteHint: 'Pega una pregunta por línea:',
    pasteFormat: 'oración | correcta | otra | otra',
    pasted: (n: number) => `Se ${n === 1 ? 'agregó' : 'agregaron'} ${n === 1 ? '1 pregunta' : `${n} preguntas`}`,
  },
  en: {
    title: 'Choose the answer',
    instruction: 'Write the sentence with ___ and its options. The first one is correct; the game shuffles them.',
    groupLabel: 'Questions',
    sentenceLabel: (n: number) => `Sentence ${n}`,
    sentencePlaceholder: 'Write the sentence with ___',
    exampleSentence: 'She ___ to school every day.',
    exampleCorrect: 'goes',
    exampleOther: 'go',
    correctLabel: (n: number) => `Correct option for question ${n}`,
    optionLabel: (n: number, option: number) => `Option ${option} for question ${n}`,
    correctPlaceholder: 'Correct answer',
    optionPlaceholder: 'Another option',
    correctTag: 'Correct',
    addOption: 'Add option',
    removeOption: 'Remove this option',
    removeQuestion: (n: number) => `Remove question ${n}`,
    addQuestion: 'Add question',
    whyLabel: 'Why? (optional)',
    whyPlaceholder: 'Explain the correct answer',
    emptyHint: 'Write a sentence and two options to see the game',
    ready: (n: number) => `Ready to play · ${n === 1 ? '1 question' : `${n} questions`}`,
    tip: `With ${CHALLENGING_QUESTION_COUNT} or more questions, the game is more challenging.`,
    blankHint: 'Mark each blank with ___ (one or two). With two blanks, split each option into its parts with /.',
    pasteHint: 'Paste one question per line:',
    pasteFormat: 'sentence | correct | other | other',
    pasted: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'} added`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** The leading 20px column every row shares (the number, the ✓, the bulb), so all the fields start on one edge. */
const LEAD_CLASS = 'grid size-5 shrink-0 place-items-center';

export interface ChooseEditorProps {
  blockId: string;
  lang: string;
  questions: ChooseQuestionRow[];
  /**
   * Does the LIVE PREVIEW'S own board have something to show right now
   * (`boardHasContent('choose', …)` on the SAME debounced payload the preview
   * reads) — see `MatchPairsEditor.tsx`'s own `playable` doc.
   */
  playable: boolean;
  /** How many questions the player would actually play (`deriveChooseQuestions`), for the ready line. */
  readyCount: number;
  /** The question whose sentence should take focus next (a freshly added one) — `null` for none. */
  focusSlotId?: string | null;
  /** The question a rejected submit pointed back to, and its plain message. */
  incompleteSlotId?: string | null;
  incompleteMessage?: string | null;
  promptImages?: Record<string, PromptImageRef>;
  /** `undefined` hides the image field (the caller does not support question images). */
  onPromptImageChange?: (slotId: string, image: PromptImageRef | undefined) => void;
  onSentenceChange: (slotId: string, sentence: string) => void;
  onOptionChange: (slotId: string, itemId: string, text: string) => void;
  onAddOption: (slotId: string) => void;
  onRemoveOption: (slotId: string, itemId: string) => void;
  onExplanationChange: (slotId: string, explanation: string) => void;
  onAdd: () => void;
  onRemove: (rowId: string, slotId: string) => void;
  /**
   * A bulk paste (2+ non-empty lines) landed in the sentence of `fromSlotId`
   * (`null` for the empty-list example) — `rows` is already parsed
   * (`pasteChoose.ts`). One single commit upstream.
   */
  onPasteQuestions: (fromSlotId: string | null, rows: ChoosePasteRow[]) => void;
  /**
   * The empty-list EXAMPLE card's own first keystroke: creates the real
   * question AND sets its sentence in ONE commit upstream — see
   * `MatchPairsEditor.tsx`'s own `onExampleChange` for the full reasoning.
   */
  onExampleChange: (value: string) => void;
  /** "Cambiar de molde" (R2) — rendered beside the title in {@link SheetHeader}. */
  headerAction?: React.ReactNode;
}

export default function ChooseEditor({
  blockId,
  lang,
  questions,
  playable,
  readyCount,
  focusSlotId = null,
  incompleteSlotId = null,
  incompleteMessage = null,
  promptImages,
  onPromptImageChange,
  onSentenceChange,
  onOptionChange,
  onAddOption,
  onRemoveOption,
  onExplanationChange,
  onAdd,
  onRemove,
  onPasteQuestions,
  onExampleChange,
  headerAction,
}: ChooseEditorProps) {
  const t = copyFor(lang);
  const sentenceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const optionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const exits = useExitingItems(onRemove);
  const optionExits = useExitingItems(onRemoveOption);
  const feedback = usePasteFeedback(questions);
  /** The question whose newest option field should take focus once "Agregar opción" lands. */
  const focusNewOptionOf = useRef<string | null>(null);

  useEffect(() => {
    if (!focusSlotId) return;
    sentenceRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  useEffect(() => {
    const slotId = focusNewOptionOf.current;
    if (!slotId) return;
    focusNewOptionOf.current = null;
    const options = questions.find((q) => q.slotId === slotId)?.options ?? [];
    const last = options[options.length - 1];
    if (last) optionRefs.current[last.id]?.focus();
  }, [questions]);

  const soleBlankQuestion =
    questions.length === 1 &&
    questions[0]!.sentence.trim() === '' &&
    questions[0]!.options.every((option) => option.text.trim() === '');
  const showTeachingPlaceholders = questions.length === 0 || soleBlankQuestion;
  const filledCount = questions.filter((q) => q.sentence.trim() !== '').length;
  const showPasteHint = filledCount < 2;

  function handlePaste(fromSlotId: string | null, event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!isMultilinePaste(text)) return; // single-line paste: browser default behaviour, untouched
    event.preventDefault();
    const rows = parseChoosePaste(text);
    onPasteQuestions(fromSlotId, rows);
    feedback.show(t.pasted(rows.length));
  }

  function optionPlaceholder(index: number): string {
    if (showTeachingPlaceholders) return index === 0 ? t.exampleCorrect : index === 1 ? t.exampleOther : t.optionPlaceholder;
    return index === 0 ? t.correctPlaceholder : t.optionPlaceholder;
  }

  return (
    <div data-testid={`choose-editor-${blockId}`} className="flex flex-col">
      <SheetHeader icon={ListNumbersIcon} tone="cobalt" title={t.title} instruction={t.instruction} action={headerAction} />

      {questions.length > 0 && <GroupLabel>{t.groupLabel}</GroupLabel>}
      <div data-testid={`choose-list-${blockId}`} className="flex flex-col gap-3">
        {questions.length === 0 && (
          // The empty-list EXAMPLE card — a REAL, editable field; see
          // `MatchPairsEditor.tsx`'s own ghost row for the full reasoning.
          <TemplateGroup ariaLabel={t.groupLabel} testId={`choose-ghost-question-${blockId}`} className="template-card">
            <div className="template-row flex items-center pl-4">
              <span aria-hidden="true" className={`${LEAD_CLASS} text-[13px] font-semibold tabular-nums text-muted-foreground`}>
                1
              </span>
              <TemplateField
                aria-label={t.sentenceLabel(1)}
                placeholder={t.exampleSentence}
                data-testid={`choose-ghost-sentence-${blockId}`}
                value=""
                onChange={(event) => onExampleChange(event.target.value)}
                onPaste={(event) => handlePaste(null, event)}
                className="flex-1"
              />
              <div className="w-9 shrink-0" />
            </div>
          </TemplateGroup>
        )}

        {questions.map((question, index) => {
          const n = index + 1;
          const canRemoveOption = question.options.length > MIN_CHOOSE_OPTIONS;
          return (
            <TemplateCollapse key={question.rowId} leaving={exits.isLeaving(question.rowId)}>
              <TemplateGroup
                ariaLabel={t.sentenceLabel(n)}
                testId={`choose-question-${question.slotId}`}
                className="template-card"
              >
                <div className="template-row flex items-center pl-4">
                  <span
                    aria-hidden="true"
                    className={`${LEAD_CLASS} text-[13px] font-semibold tabular-nums text-muted-foreground`}
                  >
                    {n}
                  </span>
                  <TemplateField
                    ref={(node) => {
                      sentenceRefs.current[question.slotId] = node;
                    }}
                    aria-label={t.sentenceLabel(n)}
                    placeholder={showTeachingPlaceholders ? t.exampleSentence : t.sentencePlaceholder}
                    data-testid={`choose-sentence-${question.slotId}`}
                    value={question.sentence}
                    onChange={(event) => onSentenceChange(question.slotId, event.target.value)}
                    onPaste={(event) => handlePaste(question.slotId, event)}
                    className="flex-1"
                  />
                  <div className="flex w-9 shrink-0 justify-end pr-3">
                    <RowRemoveButton
                      label={t.removeQuestion(n)}
                      testId={`choose-remove-${question.slotId}`}
                      onRemove={() => exits.remove(question.rowId, question.rowId, question.slotId)}
                    />
                  </div>
                </div>

                {onPromptImageChange && (
                  <div className="template-row flex items-center py-2.5 pl-4">
                    <span aria-hidden="true" className="w-5 shrink-0" />
                    <div className="min-w-0 pl-4">
                      <QuestionImageField
                        lang={lang}
                        slotId={question.slotId}
                        image={promptImages?.[question.slotId]}
                        onChange={(image) => onPromptImageChange(question.slotId, image)}
                        testIdPrefix="choose-image"
                      />
                    </div>
                  </div>
                )}

                {question.options.map((option, optionIndex) => {
                  const correct = optionIndex === 0;
                  return (
                    <TemplateRow
                      key={option.id}
                      testId={`choose-option-row-${option.id}`}
                      leaving={optionExits.isLeaving(option.id)}
                      className="flex items-center pl-4"
                    >
                      {correct ? (
                        <span aria-hidden="true" className={`${LEAD_CLASS} rounded-full bg-pop-mint-deep text-white`}>
                          <CheckIcon size={12} weight="bold" />
                        </span>
                      ) : (
                        <span aria-hidden="true" className="w-5 shrink-0" />
                      )}
                      <TemplateField
                        ref={(node) => {
                          optionRefs.current[option.id] = node;
                        }}
                        aria-label={correct ? t.correctLabel(n) : t.optionLabel(n, optionIndex + 1)}
                        placeholder={optionPlaceholder(optionIndex)}
                        data-testid={`choose-option-text-${option.id}`}
                        value={option.text}
                        onChange={(event) => onOptionChange(question.slotId, option.id, event.target.value)}
                        className="flex-1"
                      />
                      {correct ? (
                        <span
                          data-testid={`choose-correct-${question.slotId}`}
                          className="shrink-0 pr-4 text-[12px] font-semibold text-pop-mint-deep"
                        >
                          {t.correctTag}
                        </span>
                      ) : (
                        <div className="flex w-9 shrink-0 justify-end pr-3">
                          {canRemoveOption && (
                            <RowRemoveButton
                              label={t.removeOption}
                              testId={`choose-option-remove-${option.id}`}
                              onRemove={() => optionExits.remove(option.id, question.slotId, option.id)}
                            />
                          )}
                        </div>
                      )}
                    </TemplateRow>
                  );
                })}
                {question.options.length < MAX_CHOOSE_OPTIONS && (
                  <AddRow
                    label={t.addOption}
                    testId={`choose-add-option-${question.slotId}`}
                    onClick={() => {
                      focusNewOptionOf.current = question.slotId;
                      onAddOption(question.slotId);
                    }}
                  />
                )}

                <div className="template-row flex items-start pl-4 pt-3">
                  <span aria-hidden="true" className={`${LEAD_CLASS} text-hint`}>
                    <LightbulbIcon size={18} weight="fill" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span aria-hidden="true" className="pl-4 text-[12px] font-semibold leading-4 text-hint">
                      {t.whyLabel}
                    </span>
                    <TemplateTextArea
                      aria-label={t.whyLabel}
                      placeholder={t.whyPlaceholder}
                      data-testid={`choose-explanation-${question.slotId}`}
                      value={question.explanation}
                      maxLength={MAX_SLOT_EXPLANATION_LENGTH}
                      onChange={(event) => onExplanationChange(question.slotId, event.target.value)}
                    />
                  </div>
                  <div className="w-9 shrink-0" />
                </div>

                {incompleteSlotId === question.slotId && incompleteMessage && (
                  <p
                    data-testid={`question-incomplete-${question.slotId}`}
                    className="px-4 pb-3 text-[13px] leading-[18px] text-destructive lg:text-[12px]"
                  >
                    {incompleteMessage}
                  </p>
                )}
              </TemplateGroup>
            </TemplateCollapse>
          );
        })}

        <AddCard label={t.addQuestion} testId={`choose-add-${blockId}`} onClick={onAdd} />
      </div>

      {feedback.message ? (
        <StatusNote tone="ready" testId={`choose-paste-feedback-${blockId}`}>
          {feedback.message}
        </StatusNote>
      ) : playable && readyCount > 0 ? (
        <StatusNote tone="ready" testId={`choose-ready-${blockId}`}>
          {t.ready(readyCount)}
        </StatusNote>
      ) : !playable ? (
        <StatusNote tone="warn" testId={`choose-hint-${blockId}`}>
          {t.emptyHint}
        </StatusNote>
      ) : null}
      {playable && readyCount > 0 && readyCount < CHALLENGING_QUESTION_COUNT && (
        <Footnote testId={`choose-tip-${blockId}`}>{t.tip}</Footnote>
      )}
      <Footnote testId={`choose-blank-hint-${blockId}`}>{t.blankHint}</Footnote>
      {showPasteHint && (
        <Footnote testId={`choose-paste-hint-${blockId}`}>
          {t.pasteHint} <span className="font-semibold text-foreground">{t.pasteFormat}</span>
        </Footnote>
      )}
    </div>
  );
}
