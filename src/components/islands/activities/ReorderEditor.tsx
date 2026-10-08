/**
 * ReorderEditor — the authoring surface for a `template: 'reorder'` quiz
 * block ("Reordenar"). A `reorder` block is not a question/answer pair like
 * `match`'s own `MatchPairsEditor` — it is a plain list of SENTENCES to
 * reorder, so this renders one row per sentence: "Oración correcta", Enter
 * adds a row, "×" removes it. Mirrors `MatchPairsEditor.tsx`'s own posture
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
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const COPY = {
  es: {
    sentenceHeader: 'Oración correcta',
    sentencePlaceholder: 'Escribe la oración completa',
    removeSentence: 'Quitar esta oración',
    addSentence: '+ Agregar oración',
    minSentenceHint: 'Agrega al menos una oración de 2 o más palabras para jugar',
  },
  en: {
    sentenceHeader: 'Correct sentence',
    sentencePlaceholder: 'Write the full sentence',
    removeSentence: 'Remove this sentence',
    addSentence: '+ Add sentence',
    minSentenceHint: 'Add at least one sentence of 2 or more words to play',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** A sentence needs at least this many words to be reorderable — mirrors `gameModes.ts`'s own word-count rule. */
function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
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

  useEffect(() => {
    if (!focusSlotId) return;
    fieldRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  const playableCount = sentences.filter((s) => wordCount(s.sentence) >= 2).length;

  return (
    <div data-testid={`reorder-editor-${blockId}`} className="flex flex-col gap-3">
      {playableCount === 0 && (
        <p data-testid={`reorder-hint-${blockId}`} className="text-sm text-muted-foreground">
          {t.minSentenceHint}
        </p>
      )}

      {sentences.length > 0 && (
        <div data-testid={`reorder-list-${blockId}`} role="table" aria-label={t.sentenceHeader} className="flex flex-col gap-2">
          {sentences.map((item, index) => (
            <div key={item.rowId} role="row" data-testid={`reorder-row-${item.slotId}`} className="flex items-center gap-2">
              <Input
                ref={(node) => {
                  fieldRefs.current[item.slotId] = node;
                }}
                type="text"
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
                className={cn('min-h-11 min-w-0 flex-1 text-base')}
              />
              <button
                type="button"
                aria-label={t.removeSentence}
                data-testid={`reorder-remove-${item.slotId}`}
                onClick={() => onRemove(item.rowId, item.slotId)}
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
        data-testid={`reorder-add-${blockId}`}
        onClick={onAdd}
        className="min-h-11 w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        {t.addSentence}
      </button>
    </div>
  );
}
