/**
 * ClozeEditor — the authoring surface for a `template: 'cloze'` quiz block
 * ("Completar la frase"). One grouped-list row per SENTENCE (not per blank,
 * unlike storage — see `clozeSentences.ts`'s own header): the teacher writes
 * the full sentence and marks each blank by wrapping the word in square
 * brackets, e.g. `"I [was] travelling when I [received] a phone call."`,
 * with a live mini-preview right under the field — the sentence with each
 * bracketed word shown as a soft yellow chip. Enter adds a row, "×" removes
 * it — same posture `ReorderEditor.tsx` and `MatchPairsEditor.tsx` already
 * use (`TemplateEditorKit.tsx`).
 *
 * One optional, ACTIVITY-WIDE "Palabras extra" card: extra pool tiles with
 * no sentence of their own, shared by every blank in the block, edited as
 * removable chips. Storage is unchanged — still the same comma-separated
 * text `clozeSentences.ts`'s `deriveDistractorsText`/`applyDistractorsText`
 * read and write; the chips only split and re-join it.
 */
import { useEffect, useRef } from 'react';
import { BracketsSquareIcon } from '@phosphor-icons/react/dist/ssr/BracketsSquare';
import { parseClozeText } from '@/lib/activities/clozeSentences';
import {
  AddRow,
  Chip,
  ChipInput,
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
} from './TemplateEditorKit';

export const COPY = {
  es: {
    title: 'Completar la frase',
    instruction: 'Escribe cada frase y marca los espacios entre corchetes.',
    groupLabel: 'Frases',
    sentenceHeader: 'Frase',
    sentencePlaceholder: 'Escribe la frase',
    bracketHint: 'Marca cada espacio entre corchetes. Ejemplo: I [was] travelling.',
    removeSentence: 'Quitar esta frase',
    addSentence: 'Agregar frase',
    minSentenceHint: 'Agrega al menos una frase con un espacio entre corchetes',
    ready: (n: number) => `Listo para jugar · ${n === 1 ? '1 frase' : `${n} frases`}`,
    noBlanksYet: 'Todavía no hay espacios marcados',
    distractorsLabel: 'Palabras extra',
    distractorsHint: 'Se mezclan con las respuestas, pero no van en ningún espacio.',
    distractorsPlaceholder: '+ palabra',
    addDistractor: 'Agregar palabra extra',
    removeDistractor: (word: string) => `Quitar ${word}`,
  },
  en: {
    title: 'Complete the sentence',
    instruction: 'Write each sentence and mark the blanks in brackets.',
    groupLabel: 'Sentences',
    sentenceHeader: 'Sentence',
    sentencePlaceholder: 'Write the sentence',
    bracketHint: 'Mark each blank in brackets. Example: I [was] travelling.',
    removeSentence: 'Remove this sentence',
    addSentence: 'Add sentence',
    minSentenceHint: 'Add at least one sentence with a blank in brackets',
    ready: (n: number) => `Ready to play · ${n === 1 ? '1 sentence' : `${n} sentences`}`,
    noBlanksYet: 'No blanks marked yet',
    distractorsLabel: 'Extra words',
    distractorsHint: 'They are mixed in with the answers but fit no blank.',
    distractorsPlaceholder: '+ word',
    addDistractor: 'Add an extra word',
    removeDistractor: (word: string) => `Remove ${word}`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** Comma-separated words, trimmed, empties dropped — the distractor text's own format. */
function splitWords(text: string): string[] {
  return text
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/** A stable key per word that survives removing a DIFFERENT word: the word plus its occurrence number. */
function wordKeys(words: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return words.map((word) => {
    const n = (seen.get(word) ?? 0) + 1;
    seen.set(word, n);
    return `${word}#${n}`;
  });
}

export interface ClozeSentenceInput {
  seq: number;
  text: string;
  blankCount: number;
}

export interface ClozeEditorProps {
  blockId: string;
  lang: string;
  sentences: ClozeSentenceInput[];
  distractorsText: string;
  /** The sentence whose field should take focus next (a freshly added row) — `null` for none. */
  focusSeq?: number | null;
  onSentenceChange: (seq: number, text: string) => void;
  onAdd: () => void;
  onRemove: (seq: number) => void;
  onDistractorsChange: (text: string) => void;
}

export default function ClozeEditor({
  blockId,
  lang,
  sentences,
  distractorsText,
  focusSeq = null,
  onSentenceChange,
  onAdd,
  onRemove,
  onDistractorsChange,
}: ClozeEditorProps) {
  const t = copyFor(lang);
  const fieldRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const exits = useExitingItems(onRemove);

  useEffect(() => {
    if (focusSeq === null) return;
    fieldRefs.current[focusSeq]?.focus();
  }, [focusSeq]);

  const playableCount = sentences.filter((s) => s.blankCount >= 1).length;
  const distractors = splitWords(distractorsText);
  const distractorKeys = wordKeys(distractors);

  return (
    <div data-testid={`cloze-editor-${blockId}`} className="flex flex-col">
      <SheetHeader icon={BracketsSquareIcon} tone="yellow" title={t.title} instruction={t.instruction} />

      <section className="flex flex-col">
        {sentences.length > 0 && <GroupLabel>{t.groupLabel}</GroupLabel>}
        <TemplateGroup ariaLabel={t.groupLabel} testId={`cloze-list-${blockId}`}>
          {sentences.map((item, index) => (
            <TemplateRow key={item.seq} testId={`cloze-row-${item.seq}`} leaving={exits.isLeaving(String(item.seq))}>
              <div className="flex items-center">
                <TemplateField
                  ref={(node) => {
                    fieldRefs.current[item.seq] = node;
                  }}
                  aria-label={`${t.sentenceHeader} ${index + 1}`}
                  placeholder={t.sentencePlaceholder}
                  data-testid={`cloze-sentence-${item.seq}`}
                  value={item.text}
                  onChange={(event) => onSentenceChange(item.seq, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
                    const isLast = sentences[sentences.length - 1]?.seq === item.seq;
                    if (!isLast) return;
                    event.preventDefault();
                    onAdd();
                  }}
                  className="flex-1"
                />
                <div className="flex w-9 shrink-0 justify-end pr-3">
                  <RowRemoveButton
                    label={`${t.removeSentence} ${index + 1}`}
                    testId={`cloze-remove-${item.seq}`}
                    onRemove={() => exits.remove(String(item.seq), item.seq)}
                  />
                </div>
              </div>
              {item.text.trim() !== '' && (
                <p
                  aria-hidden="true"
                  data-testid={`cloze-preview-${item.seq}`}
                  className="-mt-1 pb-3 pl-4 pr-12 text-[13px] leading-7 text-muted-foreground"
                >
                  {item.blankCount > 0
                    ? parseClozeText(item.text).segments.map((seg, i) =>
                        seg.kind === 'blank' ? (
                          <MiniChip key={i} tone="yellow">
                            {seg.text}
                          </MiniChip>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )
                    : t.noBlanksYet}
                </p>
              )}
            </TemplateRow>
          ))}
          <AddRow label={t.addSentence} testId={`cloze-add-${blockId}`} onClick={onAdd} />
        </TemplateGroup>

        {playableCount > 0 ? (
          <StatusNote tone="ready" testId={`cloze-ready-${blockId}`}>
            {t.ready(playableCount)}
          </StatusNote>
        ) : (
          <StatusNote tone="warn" testId={`cloze-hint-${blockId}`}>
            {t.minSentenceHint}
          </StatusNote>
        )}
        <Footnote testId={`cloze-bracket-hint-${blockId}`}>{t.bracketHint}</Footnote>
      </section>

      <section className="flex flex-col pt-6">
        <GroupLabel>{t.distractorsLabel}</GroupLabel>
        <TemplateGroup ariaLabel={t.distractorsLabel} className="flex flex-wrap items-center gap-1.5 p-3">
          <div data-testid={`cloze-distractor-chips-${blockId}`} className="contents">
            {distractors.map((word, i) => (
              <Chip
                key={distractorKeys[i]}
                testId={`cloze-distractor-${i}`}
                removeLabel={t.removeDistractor(word)}
                removeTestId={`cloze-distractor-remove-${i}`}
                onRemove={() => onDistractorsChange(distractors.filter((_, j) => j !== i).join(', '))}
              >
                {word}
              </Chip>
            ))}
          </div>
          <ChipInput
            placeholder={t.distractorsPlaceholder}
            ariaLabel={t.addDistractor}
            testId={`cloze-distractors-${blockId}`}
            onCommit={(text) => onDistractorsChange([...distractors, ...splitWords(text)].join(', '))}
          />
        </TemplateGroup>
        <Footnote>{t.distractorsHint}</Footnote>
      </section>
    </div>
  );
}
