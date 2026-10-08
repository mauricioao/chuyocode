/**
 * ClozeEditor — the authoring surface for a `template: 'cloze'` quiz block
 * ("Completar la frase"). One row per SENTENCE (not per blank, unlike
 * storage — see `clozeSentences.ts`'s own header): the teacher writes the
 * full sentence and marks each blank by wrapping the word in square
 * brackets, e.g. `"I [was] travelling when I [received] a phone call."`,
 * with a live mini-preview of the resulting blanks right under the row.
 * Enter adds a row, "×" removes it — same posture `ReorderEditor.tsx` and
 * `MatchPairsEditor.tsx` already use.
 *
 * One optional, ACTIVITY-WIDE "Palabras extra (distractores)" field: extra
 * pool tiles with no sentence of their own, shared by every blank in the
 * block (comma-separated).
 */
import { useEffect, useRef } from 'react';
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseClozeText } from '@/lib/activities/clozeSentences';

export const COPY = {
  es: {
    sentenceHeader: 'Frase',
    sentencePlaceholder: 'Escribe la frase y marca los espacios entre corchetes',
    bracketHint: 'Marca cada espacio entre corchetes. Ejemplo: "I [was] travelling."',
    removeSentence: 'Quitar esta frase',
    addSentence: '+ Agregar frase',
    minSentenceHint: 'Agrega al menos una frase con un espacio entre corchetes para jugar',
    noBlanksYet: 'Todavía no hay espacios marcados',
    distractorsLabel: 'Palabras extra (distractores)',
    distractorsPlaceholder: 'Palabras de más para confundir, separadas por comas',
  },
  en: {
    sentenceHeader: 'Sentence',
    sentencePlaceholder: 'Write the sentence and mark the blanks in brackets',
    bracketHint: 'Mark each blank in brackets. Example: "I [was] travelling."',
    removeSentence: 'Remove this sentence',
    addSentence: '+ Add sentence',
    minSentenceHint: 'Add at least one sentence with a blank in brackets to play',
    noBlanksYet: 'No blanks marked yet',
    distractorsLabel: 'Extra words (distractors)',
    distractorsPlaceholder: 'Extra words to confuse, comma-separated',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** The sentence's own blanks shown as `___`, everything else literal — the row's own live preview. */
function miniPreview(text: string): string {
  const parsed = parseClozeText(text);
  return parsed.segments.map((seg) => (seg.kind === 'text' ? seg.text : '___')).join('');
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

  useEffect(() => {
    if (focusSeq === null) return;
    fieldRefs.current[focusSeq]?.focus();
  }, [focusSeq]);

  const playableCount = sentences.filter((s) => s.blankCount >= 1).length;

  return (
    <div data-testid={`cloze-editor-${blockId}`} className="flex flex-col gap-3">
      <p data-testid={`cloze-bracket-hint-${blockId}`} className="text-xs text-muted-foreground">
        {t.bracketHint}
      </p>

      {playableCount === 0 && (
        <p data-testid={`cloze-hint-${blockId}`} className="text-sm text-muted-foreground">
          {t.minSentenceHint}
        </p>
      )}

      {sentences.length > 0 && (
        <div
          data-testid={`cloze-list-${blockId}`}
          role="table"
          aria-label={t.sentenceHeader}
          className="flex flex-col gap-3"
        >
          {sentences.map((item, index) => (
            <div key={item.seq} role="row" data-testid={`cloze-row-${item.seq}`} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  ref={(node) => {
                    fieldRefs.current[item.seq] = node;
                  }}
                  type="text"
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
                  className={cn('min-h-11 min-w-0 flex-1 text-base')}
                />
                <button
                  type="button"
                  aria-label={t.removeSentence}
                  data-testid={`cloze-remove-${item.seq}`}
                  onClick={() => onRemove(item.seq)}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>
              <p data-testid={`cloze-preview-${item.seq}`} className="pl-1 text-sm text-muted-foreground">
                {item.blankCount > 0 ? miniPreview(item.text) : t.noBlanksYet}
              </p>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        data-testid={`cloze-add-${blockId}`}
        onClick={onAdd}
        className="min-h-11 w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        {t.addSentence}
      </button>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">{t.distractorsLabel}</span>
        <Input
          type="text"
          data-testid={`cloze-distractors-${blockId}`}
          placeholder={t.distractorsPlaceholder}
          value={distractorsText}
          onChange={(event) => onDistractorsChange(event.target.value)}
          className="min-h-11 text-base"
        />
      </label>
    </div>
  );
}
