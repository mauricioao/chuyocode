/**
 * MatchPairsEditor — the authoring surface for a `template: 'match'` quiz
 * block ("Une las parejas", build item 1 "Match authoring, simple"). A
 * `match` block is NOT a question to answer, it is a list of PAIRS to match,
 * so the full Google-Forms-style {@link QuestionCard} list (question text +
 * type control + options) would show controls ("Opción múltiple", "Mostrar
 * como fichas") that make no sense for it. This renders instead, whenever
 * `QuizBlockEditor` sees `template === 'match'`: one grouped list whose rows
 * are "Pregunta | Respuesta" — nothing else (`TemplateEditorKit.tsx`).
 *
 * SAME STORAGE, NO NEW FIELDS: a pair is still exactly one `row` block plus
 * the `text`-mechanic {@link Slot} it references (`authoringDraft.ts`'s
 * `addRowBlock`) — `slot.label` is the prompt, `slot.answer[0]` the single
 * accepted answer. `QuizMatching`'s own `deriveGameItems` already reads
 * exactly that shape, so nothing downstream (grading, the match board,
 * presentation, print, moderation) needs to change for this editor to exist.
 *
 * STATELESS, like `QuestionCard`: every keystroke flows straight back
 * through `onQuestionChange`/`onAnswerChange` into the caller's `Draft`;
 * `pairs` is the single source of truth re-rendered after each commit.
 *
 * Enter in a QUESTION field moves to its answer; Enter in the LAST answer
 * appends a new empty pair and focuses its question field, via
 * `focusSlotId` (`QuizBlockEditor` passes its own `selectedSlotId`/
 * `onSelectSlot`, the exact same wiring `addQuestion` already uses for the
 * Básico list).
 *
 * "Listo para jugar" mirrors `gameModes.ts`'s own `match` rule: at least
 * {@link MIN_MATCH_PAIRS} complete pairs whose answers are all different.
 */
import { useEffect, useRef } from 'react';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { hasUniqueAnswers } from '@/lib/activities/gameModes';
import {
  AddRow,
  GroupLabel,
  RowRemoveButton,
  SheetHeader,
  StatusNote,
  TemplateField,
  TemplateGroup,
  TemplateRow,
  useExitingItems,
} from './TemplateEditorKit';

export const COPY = {
  es: {
    title: 'Une las parejas',
    instruction: 'Escribe cada palabra junto a su pareja.',
    questionHeader: 'Pregunta',
    answerHeader: 'Respuesta',
    questionPlaceholder: 'Palabra o pregunta',
    answerPlaceholder: 'Respuesta',
    removePair: 'Quitar esta pareja',
    addPair: 'Agregar pareja',
    minPairsHint: 'Agrega al menos 3 parejas',
    duplicateAnswersHint: 'Cada pareja necesita una respuesta distinta',
    ready: (n: number) => `Listo para jugar · ${n} parejas`,
  },
  en: {
    title: 'Match the pairs',
    instruction: 'Write each word next to its pair.',
    questionHeader: 'Question',
    answerHeader: 'Answer',
    questionPlaceholder: 'Word or question',
    answerPlaceholder: 'Answer',
    removePair: 'Remove this pair',
    addPair: 'Add pair',
    minPairsHint: 'Add at least 3 pairs',
    duplicateAnswersHint: 'Each pair needs a different answer',
    ready: (n: number) => `Ready to play · ${n} pairs`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** `match` needs at least this many complete pairs to be playable — mirrors `gameModes.ts`'s own `MIN_MATCH_ITEMS`. */
const MIN_MATCH_PAIRS = 3;

/** Question | divider | answer | "×" — shared by the column labels and every row so both columns line up. */
const PAIR_GRID = 'grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)_2.25rem] items-center';

export interface MatchPair {
  rowId: string;
  slotId: string;
  question: string;
  answer: string;
}

export interface MatchPairsEditorProps {
  blockId: string;
  lang: string;
  pairs: MatchPair[];
  /** The pair whose question field should take focus next (a freshly added row) — `null` for none. */
  focusSlotId?: string | null;
  onQuestionChange: (slotId: string, question: string) => void;
  onAnswerChange: (slotId: string, answer: string) => void;
  onAdd: () => void;
  onRemove: (rowId: string, slotId: string) => void;
}

export default function MatchPairsEditor({
  blockId,
  lang,
  pairs,
  focusSlotId = null,
  onQuestionChange,
  onAnswerChange,
  onAdd,
  onRemove,
}: MatchPairsEditorProps) {
  const t = copyFor(lang);
  const questionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const answerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const exits = useExitingItems(onRemove);

  useEffect(() => {
    if (!focusSlotId) return;
    questionRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  const complete = pairs.filter((p) => p.question.trim() !== '' && p.answer.trim() !== '');
  const enoughPairs = complete.length >= MIN_MATCH_PAIRS;
  const ready =
    enoughPairs && hasUniqueAnswers(complete.map((p) => ({ id: p.slotId, prompt: p.question, answer: p.answer })));

  return (
    <div data-testid={`match-pairs-editor-${blockId}`} className="flex flex-col">
      <SheetHeader icon={ArrowsLeftRightIcon} tone="sky" title={t.title} instruction={t.instruction} />

      {pairs.length > 0 && (
        <div aria-hidden="true" className={PAIR_GRID}>
          <GroupLabel>{t.questionHeader}</GroupLabel>
          <span />
          <GroupLabel>{t.answerHeader}</GroupLabel>
        </div>
      )}

      <TemplateGroup ariaLabel={`${t.questionHeader} / ${t.answerHeader}`} testId={`match-pairs-table-${blockId}`}>
        {pairs.map((pair, index) => (
          <TemplateRow
            key={pair.rowId}
            testId={`match-pair-${pair.slotId}`}
            leaving={exits.isLeaving(pair.rowId)}
            className={PAIR_GRID}
          >
            <TemplateField
              ref={(node) => {
                questionRefs.current[pair.slotId] = node;
              }}
              aria-label={`${t.questionHeader} ${index + 1}`}
              placeholder={t.questionPlaceholder}
              data-testid={`match-pair-question-${pair.slotId}`}
              value={pair.question}
              onChange={(event) => onQuestionChange(pair.slotId, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
                event.preventDefault();
                answerRefs.current[pair.slotId]?.focus();
              }}
            />
            <span aria-hidden="true" className="h-7 w-px bg-foreground/[0.08]" />
            <TemplateField
              ref={(node) => {
                answerRefs.current[pair.slotId] = node;
              }}
              aria-label={`${t.answerHeader} ${index + 1}`}
              placeholder={t.answerPlaceholder}
              data-testid={`match-pair-answer-${pair.slotId}`}
              value={pair.answer}
              onChange={(event) => onAnswerChange(pair.slotId, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
                const isLast = pairs[pairs.length - 1]?.slotId === pair.slotId;
                if (!isLast) return;
                event.preventDefault();
                onAdd();
              }}
            />
            <div className="flex justify-end pr-3">
              <RowRemoveButton
                label={`${t.removePair} ${index + 1}`}
                testId={`match-pair-remove-${pair.slotId}`}
                onRemove={() => exits.remove(pair.rowId, pair.rowId, pair.slotId)}
              />
            </div>
          </TemplateRow>
        ))}
        <AddRow label={t.addPair} testId={`match-add-pair-${blockId}`} onClick={onAdd} />
      </TemplateGroup>

      {ready ? (
        <StatusNote tone="ready" testId={`match-pairs-ready-${blockId}`}>
          {t.ready(complete.length)}
        </StatusNote>
      ) : (
        <StatusNote tone="warn" testId={`match-pairs-hint-${blockId}`}>
          {enoughPairs ? t.duplicateAnswersHint : t.minPairsHint}
        </StatusNote>
      )}
    </div>
  );
}
