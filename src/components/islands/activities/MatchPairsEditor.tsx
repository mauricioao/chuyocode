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
import { isMultilinePaste } from '@/lib/activities/pasteLines';
import { parseMatchPairsPaste, type MatchPastePair } from '@/lib/activities/pasteMatchPairs';
import {
  AddRow,
  Footnote,
  GroupLabel,
  RowRemoveButton,
  SheetHeader,
  StatusNote,
  TemplateField,
  TemplateGroup,
  TemplateRow,
  useExitingItems,
  usePasteFeedback,
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
    pasteHint: 'Puedes pegar una lista: una pareja por línea, separada por = o tab.',
    pasted: (n: number) => `Se ${n === 1 ? 'agregó' : 'agregaron'} ${n === 1 ? '1 pareja' : `${n} parejas`}`,
    exampleQuestion: 'dog',
    exampleAnswer: 'perro',
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
    pasteHint: 'You can paste a list: one pair per line, separated by = or a tab.',
    pasted: (n: number) => `${n} ${n === 1 ? 'pair' : 'pairs'} added`,
    exampleQuestion: 'dog',
    exampleAnswer: 'perro',
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
  /**
   * A bulk paste (2+ non-empty lines) landed in the pair at `fromSlotId`
   * (`null` for the empty-list example row) — `rows` is already parsed
   * (`pasteMatchPairs.ts`). One single commit upstream; see `onPastePairs` in
   * `QuizBlockEditor.tsx`.
   */
  onPastePairs: (fromSlotId: string | null, rows: MatchPastePair[]) => void;
  /**
   * The empty-list EXAMPLE row's own first keystroke (owner spec N5
   * follow-up, "not a dead end"): creates the real pair AND sets `field`'s
   * value in ONE commit upstream (never two — two separate commits each
   * reading the SAME pre-add draft would silently lose the add, see
   * `QuizBlockEditor.tsx`'s own `addExampleMatchPair`).
   */
  onExampleChange: (field: 'question' | 'answer', value: string) => void;
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
  onPastePairs,
  onExampleChange,
}: MatchPairsEditorProps) {
  const t = copyFor(lang);
  const questionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const answerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const exits = useExitingItems(onRemove);
  const feedback = usePasteFeedback(pairs);
  // Which field to hand focus to once the row just created by `onAdd` mounts
  // — `'question'` (the default, matching "+ Agregar pareja") unless the
  // example row's own ANSWER field is what the author actually typed into
  // first (see `handleExampleAnswerChange`).
  const pendingFocusFieldRef = useRef<'question' | 'answer'>('question');

  useEffect(() => {
    if (!focusSlotId) return;
    const refs = pendingFocusFieldRef.current === 'answer' ? answerRefs : questionRefs;
    refs.current[focusSlotId]?.focus();
    pendingFocusFieldRef.current = 'question';
  }, [focusSlotId]);

  const complete = pairs.filter((p) => p.question.trim() !== '' && p.answer.trim() !== '');
  const enoughPairs = complete.length >= MIN_MATCH_PAIRS;
  const ready =
    enoughPairs && hasUniqueAnswers(complete.map((p) => ({ id: p.slotId, prompt: p.question, answer: p.answer })));

  // Teaching placeholders + hint (owner spec N5, "teach the format without
  // reading"): shown only while the list has nothing worth looking at yet —
  // empty, or a single still-empty row. `filledCount` (any text typed on
  // EITHER side counts) also gates the hint line on its own, slightly wider
  // threshold ("2+ filled rows" per spec).
  const soleEmptyRow = pairs.length === 1 && pairs[0]!.question.trim() === '' && pairs[0]!.answer.trim() === '';
  const showTeachingPlaceholders = pairs.length === 0 || soleEmptyRow;
  const filledCount = pairs.filter((p) => p.question.trim() !== '' || p.answer.trim() !== '').length;
  const showPasteHint = filledCount < 2;

  function handlePaste(fromSlotId: string | null, event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!isMultilinePaste(text)) return; // single-line paste: browser default behaviour, untouched
    event.preventDefault();
    const rows = parseMatchPairsPaste(text);
    onPastePairs(fromSlotId, rows);
    feedback.show(t.pasted(rows.length));
  }

  // The empty-list example row's own first keystroke (owner spec N5 follow-
  // up, "not a dead end"): `onExampleChange` creates the real pair AND sets
  // this value in ONE commit upstream — so it reads as typing into an
  // ordinary row, not a two-step "click, then type" (and never risks the
  // add being silently lost to a second commit reading a now-stale draft).
  function handleExampleQuestionChange(value: string) {
    onExampleChange('question', value);
  }
  function handleExampleAnswerChange(value: string) {
    pendingFocusFieldRef.current = 'answer';
    onExampleChange('answer', value);
  }

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
        {pairs.length === 0 && (
          // The empty-list EXAMPLE row (owner spec N5 follow-up, "not a dead
          // end"): a REAL, fully editable field — typing into it creates the
          // first real pair right then (`handleExampleQuestionChange`/
          // `handleExampleAnswerChange`), exactly as typing into any other
          // row does. It only teaches the format via its placeholder; it
          // never becomes a separate persisted pair of its own — the very
          // next render replaces it with the real row `onAdd` just created.
          <TemplateRow testId={`match-pair-example-${blockId}`} className={PAIR_GRID}>
            <TemplateField
              aria-label={t.questionHeader}
              placeholder={t.exampleQuestion}
              data-testid={`match-pair-ghost-question-${blockId}`}
              value=""
              onChange={(event) => handleExampleQuestionChange(event.target.value)}
              onPaste={(event) => handlePaste(null, event)}
            />
            <span aria-hidden="true" className="h-7 w-px bg-foreground/[0.08]" />
            <TemplateField
              aria-label={t.answerHeader}
              placeholder={t.exampleAnswer}
              data-testid={`match-pair-ghost-answer-${blockId}`}
              value=""
              onChange={(event) => handleExampleAnswerChange(event.target.value)}
              onPaste={(event) => handlePaste(null, event)}
            />
            <div />
          </TemplateRow>
        )}
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
              placeholder={showTeachingPlaceholders ? t.exampleQuestion : t.questionPlaceholder}
              data-testid={`match-pair-question-${pair.slotId}`}
              value={pair.question}
              onChange={(event) => onQuestionChange(pair.slotId, event.target.value)}
              onPaste={(event) => handlePaste(pair.slotId, event)}
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
              placeholder={showTeachingPlaceholders ? t.exampleAnswer : t.answerPlaceholder}
              data-testid={`match-pair-answer-${pair.slotId}`}
              value={pair.answer}
              onChange={(event) => onAnswerChange(pair.slotId, event.target.value)}
              onPaste={(event) => handlePaste(pair.slotId, event)}
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

      {feedback.message ? (
        <StatusNote tone="ready" testId={`match-pairs-paste-feedback-${blockId}`}>
          {feedback.message}
        </StatusNote>
      ) : ready ? (
        <StatusNote tone="ready" testId={`match-pairs-ready-${blockId}`}>
          {t.ready(complete.length)}
        </StatusNote>
      ) : (
        <StatusNote tone="warn" testId={`match-pairs-hint-${blockId}`}>
          {enoughPairs ? t.duplicateAnswersHint : t.minPairsHint}
        </StatusNote>
      )}
      {showPasteHint && <Footnote testId={`match-pairs-paste-hint-${blockId}`}>{t.pasteHint}</Footnote>}
    </div>
  );
}
