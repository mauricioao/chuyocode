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
 *
 * READINESS NEVER CONTRADICTS THE PREVIEW (polish follow-up): the amber
 * "not ready yet" hint is driven ENTIRELY by `playable` — the exact same
 * `boardHasContent('reorder', …)` call the live preview's own empty
 * placeholder is gated on — never by this sheet's own local word count. The
 * ready line stays gated on BOTH `playable` and the live
 * `playableCount` (which still only counts a sentence once it reaches
 * {@link MIN_REORDER_WORDS} words) — see `MatchPairsEditor.tsx`'s own header
 * for why this split exists.
 */
import { useEffect, useRef } from 'react';
import { ArrowsDownUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowsDownUp';
import { MIN_REORDER_WORDS, seedFromString, shuffleWithSeed } from '@/lib/activities/gameModes';
import { isMultilinePaste, parseSentencesPaste } from '@/lib/activities/pasteLines';
import {
  AddRow,
  Footnote,
  GroupLabel,
  MiniChip,
  RowRemoveButton,
  SheetHeader,
  StatusNote,
  TemplateField,
  TemplateGroup,
  TemplateRow,
  useExitingItems,
  usePasteFeedback,
} from './TemplateEditorKit';

const COPY = {
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
    pasteHint: 'Puedes pegar una lista: una por línea.',
    pasted: (n: number) => `Se ${n === 1 ? 'agregó' : 'agregaron'} ${n === 1 ? '1 oración' : `${n} oraciones`}`,
    exampleSentence: 'I like green apples',
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
    pasteHint: 'You can paste a list: one per line.',
    pasted: (n: number) => `${n} ${n === 1 ? 'sentence' : 'sentences'} added`,
    exampleSentence: 'I like green apples',
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
  if (words.length < MIN_REORDER_WORDS) return words;
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
  /**
   * Does the LIVE PREVIEW'S own board actually have something to show right
   * now (`boardHasContent('reorder', …)`, the SAME debounced payload the
   * preview itself reads) — see `MatchPairsEditor.tsx`'s own `playable` doc
   * for the full reasoning.
   */
  playable: boolean;
  /** The sentence whose field should take focus next (a freshly added row) — `null` for none. */
  focusSlotId?: string | null;
  onSentenceChange: (slotId: string, sentence: string) => void;
  onAdd: () => void;
  onRemove: (rowId: string, slotId: string) => void;
  /**
   * A bulk paste (2+ non-empty lines) landed in the sentence at `fromSlotId`
   * (`null` for the empty-list example row) — `lines` is already split, one
   * sentence per line (`pasteLines.ts`). One single commit upstream; see
   * `onPasteSentences` in `QuizBlockEditor.tsx`.
   */
  onPasteSentences: (fromSlotId: string | null, lines: string[]) => void;
  /**
   * The empty-list EXAMPLE row's own first keystroke (owner spec N5
   * follow-up, "not a dead end"): creates the real sentence AND sets its
   * text in ONE commit upstream — see `MatchPairsEditor.tsx`'s own
   * `onExampleChange` for the full reasoning.
   */
  onExampleChange: (value: string) => void;
  /** "Cambiar de molde" (R2) — rendered beside the title in {@link SheetHeader}. */
  headerAction?: React.ReactNode;
}

export default function ReorderEditor({
  blockId,
  lang,
  sentences,
  playable,
  focusSlotId = null,
  onSentenceChange,
  onAdd,
  onRemove,
  onPasteSentences,
  onExampleChange,
  headerAction,
}: ReorderEditorProps) {
  const t = copyFor(lang);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const exits = useExitingItems(onRemove);
  const feedback = usePasteFeedback(sentences);

  useEffect(() => {
    if (!focusSlotId) return;
    fieldRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  const playableCount = sentences.filter((s) => wordsOf(s.sentence).length >= MIN_REORDER_WORDS).length;

  const soleEmptyRow = sentences.length === 1 && sentences[0]!.sentence.trim() === '';
  const showTeachingPlaceholder = sentences.length === 0 || soleEmptyRow;
  const filledCount = sentences.filter((s) => s.sentence.trim() !== '').length;
  const showPasteHint = filledCount < 2;

  function handlePaste(fromSlotId: string | null, event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!isMultilinePaste(text)) return; // single-line paste: browser default behaviour, untouched
    event.preventDefault();
    const lines = parseSentencesPaste(text);
    onPasteSentences(fromSlotId, lines);
    feedback.show(t.pasted(lines.length));
  }

  // The empty-list example row's own first keystroke (owner spec N5 follow-
  // up, "not a dead end") — see `MatchPairsEditor.tsx`'s own `onExampleChange` for the full reasoning.
  function handleExampleChange(value: string) {
    onExampleChange(value);
  }

  return (
    <div data-testid={`reorder-editor-${blockId}`} className="flex flex-col">
      <SheetHeader icon={ArrowsDownUpIcon} tone="violet" title={t.title} instruction={t.instruction} action={headerAction} />

      {sentences.length > 0 && <GroupLabel>{t.groupLabel}</GroupLabel>}

      <TemplateGroup ariaLabel={t.groupLabel} testId={`reorder-list-${blockId}`}>
        {sentences.length === 0 && (
          // The empty-list EXAMPLE row — a REAL, editable field; see
          // `MatchPairsEditor.tsx`'s own one for the full reasoning.
          <TemplateRow testId={`reorder-ghost-row-${blockId}`}>
            <div className="flex items-center">
              <TemplateField
                aria-label={t.sentenceHeader}
                placeholder={t.exampleSentence}
                data-testid={`reorder-ghost-sentence-${blockId}`}
                value=""
                onChange={(event) => handleExampleChange(event.target.value)}
                onPaste={(event) => handlePaste(null, event)}
                className="flex-1"
              />
              <div className="w-9 shrink-0" />
            </div>
          </TemplateRow>
        )}
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
                  placeholder={showTeachingPlaceholder ? t.exampleSentence : t.sentencePlaceholder}
                  data-testid={`reorder-sentence-${item.slotId}`}
                  value={item.sentence}
                  onChange={(event) => onSentenceChange(item.slotId, event.target.value)}
                  onPaste={(event) => handlePaste(item.slotId, event)}
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
              {preview.length >= MIN_REORDER_WORDS && (
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

      {feedback.message ? (
        <StatusNote tone="ready" testId={`reorder-paste-feedback-${blockId}`}>
          {feedback.message}
        </StatusNote>
      ) : playable && playableCount > 0 ? (
        <StatusNote tone="ready" testId={`reorder-ready-${blockId}`}>
          {t.ready(playableCount)}
        </StatusNote>
      ) : !playable ? (
        <StatusNote tone="warn" testId={`reorder-hint-${blockId}`}>
          {t.minSentenceHint}
        </StatusNote>
      ) : null}
      {showPasteHint && <Footnote testId={`reorder-paste-hint-${blockId}`}>{t.pasteHint}</Footnote>}
    </div>
  );
}
