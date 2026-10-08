/**
 * MatchPairsEditor — the authoring surface for a `template: 'match'` quiz
 * block ("Une las parejas", build item 1 "Match authoring, simple"). A
 * `match` block is NOT a question to answer, it is a list of PAIRS to match,
 * so the full Google-Forms-style {@link QuestionCard} list (question text +
 * type control + options) would show controls ("Opción múltiple", "Mostrar
 * como fichas") that make no sense for it. This renders instead, whenever
 * `QuizBlockEditor` sees `template === 'match'`: one calm two-column row per
 * pair — "Pregunta" | "Respuesta" — nothing else.
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
 * Enter in the ANSWER field (not the question field — that would fire on
 * every half-typed row) appends a new empty pair and focuses its question
 * field, via `focusSlotId` (`QuizBlockEditor` passes its own
 * `selectedSlotId`/`onSelectSlot`, the exact same wiring `addQuestion`
 * already uses for the Básico list).
 */
import { useEffect, useRef } from 'react';
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const COPY = {
  es: {
    questionHeader: 'Pregunta',
    answerHeader: 'Respuesta',
    questionPlaceholder: 'Palabra o pregunta',
    answerPlaceholder: 'Respuesta',
    removePair: 'Quitar esta pareja',
    addPair: '+ Agregar pareja',
    minPairsHint: 'Agrega al menos 3 parejas para jugar',
  },
  en: {
    questionHeader: 'Question',
    answerHeader: 'Answer',
    questionPlaceholder: 'Word or question',
    answerPlaceholder: 'Answer',
    removePair: 'Remove this pair',
    addPair: '+ Add pair',
    minPairsHint: 'Add at least 3 pairs to play',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** `match` needs at least this many complete pairs to be playable — mirrors `gameModes.ts`'s own `MIN_MATCH_ITEMS`. */
const MIN_MATCH_PAIRS = 3;

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

  useEffect(() => {
    if (!focusSlotId) return;
    questionRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  const completeCount = pairs.filter((p) => p.question.trim() !== '' && p.answer.trim() !== '').length;

  return (
    <div data-testid={`match-pairs-editor-${blockId}`} className="flex flex-col gap-3">
      {completeCount < MIN_MATCH_PAIRS && (
        <p data-testid={`match-pairs-hint-${blockId}`} className="text-sm text-muted-foreground">
          {t.minPairsHint}
        </p>
      )}

      {pairs.length > 0 && (
        <div
          data-testid={`match-pairs-table-${blockId}`}
          role="table"
          aria-label={`${t.questionHeader} / ${t.answerHeader}`}
          className="flex flex-col gap-2"
        >
          <div role="row" className="flex gap-2 px-1 text-xs font-medium text-muted-foreground">
            <span role="columnheader" className="min-w-0 flex-1">
              {t.questionHeader}
            </span>
            <span role="columnheader" className="min-w-0 flex-1">
              {t.answerHeader}
            </span>
            <span aria-hidden="true" className="w-9 shrink-0" />
          </div>

          {pairs.map((pair) => (
            <div
              key={pair.rowId}
              role="row"
              data-testid={`match-pair-${pair.slotId}`}
              className="flex items-center gap-2"
            >
              <Input
                ref={(node) => {
                  questionRefs.current[pair.slotId] = node;
                }}
                type="text"
                aria-label={t.questionHeader}
                placeholder={t.questionPlaceholder}
                data-testid={`match-pair-question-${pair.slotId}`}
                value={pair.question}
                onChange={(event) => onQuestionChange(pair.slotId, event.target.value)}
                className={cn('min-h-11 min-w-0 flex-1 text-base')}
              />
              <Input
                type="text"
                aria-label={t.answerHeader}
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
                className={cn('min-h-11 min-w-0 flex-1 text-base')}
              />
              <button
                type="button"
                aria-label={t.removePair}
                data-testid={`match-pair-remove-${pair.slotId}`}
                onClick={() => onRemove(pair.rowId, pair.slotId)}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
              >
                <TrashIcon aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        data-testid={`match-add-pair-${blockId}`}
        onClick={onAdd}
        className="min-h-11 w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        {t.addPair}
      </button>
    </div>
  );
}
