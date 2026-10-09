/**
 * ReorderEditor — the authoring surface for a `template: 'reorder'` quiz
 * block ("Reordenar"). A `reorder` block is not a question/answer pair like
 * `match`'s own `MatchPairsEditor` — it is a plain list of SENTENCES to
 * reorder, so this renders one grouped-list row per sentence
 * (`TemplateEditorKit.tsx`): Enter adds a row, "×" removes it, and right
 * under each sentence a live mini-preview shows its words shuffled the way
 * the game will deal them. Mirrors `MatchPairsEditor.tsx`'s own posture
 * (stateless, single column instead of two).
 *
 * SAME STORAGE AS EVERY OTHER TEMPLATE: a sentence is still exactly one
 * `row` block plus the `text`-mechanic {@link Slot} it references
 * (`authoringDraft.ts`'s `addRowBlock`) — the full sentence is stored as
 * BOTH `slot.label` (so it renders sensibly anywhere a plain label is read,
 * e.g. moderation) and `slot.answer[0]` (what `gameModes.ts`'s
 * `deriveGameItems`/`reorderEligible` actually reorder). `QuizBlockEditor`
 * keeps both in sync on every keystroke — see its own `onSentenceChange`.
 */
import { useEffect, useRef } from 'react';
import { ArrowsDownUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowsDownUp';
import { seedFromString, shuffleWithSeed } from '@/lib/activities/gameModes';
import {
  AddRow,
  GroupLabel,
  MiniChip,
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
    title: 'Reordenar',
    instruction: 'Escribe cada oración bien ordenada; el juego mezcla sus palabras.',
    groupLabel: 'Oraciones',
    sentenceHeader: 'Oración correcta',
    sentencePlaceholder: 'Escribe la oración completa',
    removeSentence: 'Quitar esta oración',
    addSentence: 'Agregar oración',
    minSentenceHint: 'Agrega al menos una oración de 2 o más palabras',
    ready: (n: number) => `Listo para jugar · ${n === 1 ? '1 oración' : `${n} oraciones`}`,
  },
  en: {
    title: 'Reorder',
    instruction: 'Write each sentence in order; the game shuffles its words.',
    groupLabel: 'Sentences',
    sentenceHeader: 'Correct sentence',
    sentencePlaceholder: 'Write the full sentence',
    removeSentence: 'Remove this sentence',
    addSentence: 'Add sentence',
    minSentenceHint: 'Add at least one sentence of 2 or more words',
    ready: (n: number) => `Ready to play · ${n === 1 ? '1 sentence' : `${n} sentences`}`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * The sentence's words in a stable shuffled order — seeded by the sentence
 * itself, so the preview never jumps between renders, and never the
 * original order (a sentence always starts scrambled in the game too).
 */
function shuffledWords(sentence: string): string[] {
  const words = wordsOf(sentence);
  if (words.length < 2) return words;
  const order = shuffleWithSeed(
    words.map((_, i) => i),
    seedFromString(sentence),
  );
  if (order.every((wordIndex, i) => wordIndex === i)) [order[0], order[1]] = [order[1]!, order[0]!];
  return order.map((i) => words[i]!);
}

export interface ReorderSentence {
  rowId: string;
  slotId: string;
  sentence: string;
}

export interface ReorderEditorProps {
  blockId: string;
  lang: string;
  sentences: ReorderSentence[];
  /** The sentence whose field should take focus next (a freshly added row) — `null` for none. */
  focusSlotId?: string | null;
  onSentenceChange: (slotId: string, sentence: string) => void;
  onAdd: () => void;
  onRemove: (rowId: string, slotId: string) => void;
}

export default function ReorderEditor({
  blockId,
  lang,
  sentences,
  focusSlotId = null,
  onSentenceChange,
  onAdd,
  onRemove,
}: ReorderEditorProps) {
  const t = copyFor(lang);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const exits = useExitingItems(onRemove);

  useEffect(() => {
    if (!focusSlotId) return;
    fieldRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  const playableCount = sentences.filter((s) => wordsOf(s.sentence).length >= 2).length;

  return (
    <div data-testid={`reorder-editor-${blockId}`} className="flex flex-col">
      <SheetHeader icon={ArrowsDownUpIcon} tone="violet" title={t.title} instruction={t.instruction} />

      {sentences.length > 0 && <GroupLabel>{t.groupLabel}</GroupLabel>}

      <TemplateGroup ariaLabel={t.groupLabel} testId={`reorder-list-${blockId}`}>
        {sentences.map((item, index) => {
          const preview = shuffledWords(item.sentence);
          return (
            <TemplateRow key={item.rowId} testId={`reorder-row-${item.slotId}`} leaving={exits.isLeaving(item.rowId)}>
              <div className="flex items-center">
                <TemplateField
                  ref={(node) => {
                    fieldRefs.current[item.slotId] = node;
                  }}
                  aria-label={`${t.sentenceHeader} ${index + 1}`}
                  placeholder={t.sentencePlaceholder}
                  data-testid={`reorder-sentence-${item.slotId}`}
                  value={item.sentence}
                  onChange={(event) => onSentenceChange(item.slotId, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
                    const isLast = sentences[sentences.length - 1]?.slotId === item.slotId;
                    if (!isLast) return;
                    event.preventDefault();
                    onAdd();
                  }}
                  className="flex-1"
                />
                <div className="flex w-9 shrink-0 justify-end pr-3">
                  <RowRemoveButton
                    label={`${t.removeSentence} ${index + 1}`}
                    testId={`reorder-remove-${item.slotId}`}
                    onRemove={() => exits.remove(item.rowId, item.rowId, item.slotId)}
                  />
                </div>
              </div>
              {preview.length >= 2 && (
                <div
                  aria-hidden="true"
                  data-testid={`reorder-preview-${item.slotId}`}
                  className="-mt-1 flex flex-wrap gap-1 pb-3 pl-4 pr-12"
                >
                  {preview.map((word, i) => (
                    <MiniChip key={`${i}-${word}`}>{word}</MiniChip>
                  ))}
                </div>
              )}
            </TemplateRow>
          );
        })}
        <AddRow label={t.addSentence} testId={`reorder-add-${blockId}`} onClick={onAdd} />
      </TemplateGroup>

      {playableCount > 0 ? (
        <StatusNote tone="ready" testId={`reorder-ready-${blockId}`}>
          {t.ready(playableCount)}
        </StatusNote>
      ) : (
        <StatusNote tone="warn" testId={`reorder-hint-${blockId}`}>
          {t.minSentenceHint}
        </StatusNote>
      )}
    </div>
  );
}
