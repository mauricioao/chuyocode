/**
 * SlotAnswerEditor — the per-mechanic answer and pool editor for one slot
 * (slice 16, design.md §8).
 *
 * Dispatches on `slot.input`, exactly like `mechanics/registry.ts` dispatches
 * a RENDERER: `text` has no pool at all — the author edits its literal
 * accepted answers directly — while `choice`/`select`/`drop` all share the
 * SAME shape (a named, shared pool of options, one of which is marked
 * correct), because that is exactly what those three mechanics' data model
 * already shares (`exercisePayload.ts`). An unrecognized `input` still shows
 * the mechanic picker so the author can recover it, but no answer editor —
 * mirroring `UnavailableRenderer`'s own "degrade this slot only" contract.
 *
 * ID GENERATION FOR A NEW POOL ITEM IS THE CALLER'S JOB (`authoringDraft.ts`'s
 * header) — `onAddPoolItem` here takes only the new item's TEXT, never an
 * id; `ExerciseAuthorIsland` supplies the id.
 *
 * COPY IS LOCAL, same rule as every other island in this codebase.
 */
import { useState } from 'react';
import type { PoolItem, Slot } from '@/lib/exercisePayload';

/** The four shipped mechanics (`mechanics/registry.ts`'s own list). Kept
 * here rather than imported: the registry exports resolvers, not a list of
 * keys, and duplicating four literal strings is cheaper than adding one. */
const MECHANICS = ['choice', 'select', 'text', 'drop'] as const;

/** Mechanics whose answer is one id drawn from a SHARED pool. */
const POOLED_MECHANICS = new Set<string>(['choice', 'select', 'drop']);

export const COPY = {
  es: {
    mechanicLabel: 'Tipo de mecánica',
    textAnswerLabel: 'Respuestas aceptadas',
    addAnswer: 'Agregar respuesta',
    removeAnswer: 'Quitar esta respuesta',
    poolNameLabel: 'Nombre del banco de opciones',
    poolItemText: 'Texto de la opción',
    poolItemMedia: 'URL de imagen (opcional)',
    addOption: 'Agregar opción',
    removeOption: 'Quitar esta opción',
    correctAnswer: 'Respuesta correcta',
    needsPoolName: 'Escribir un nombre de banco para agregar opciones.',
  },
  en: {
    mechanicLabel: 'Mechanic type',
    textAnswerLabel: 'Accepted answers',
    addAnswer: 'Add answer',
    removeAnswer: 'Remove this answer',
    poolNameLabel: 'Option pool name',
    poolItemText: 'Option text',
    poolItemMedia: 'Image URL (optional)',
    addOption: 'Add option',
    removeOption: 'Remove this option',
    correctAnswer: 'Correct answer',
    needsPoolName: 'Type a pool name to add options.',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface SlotAnswerEditorProps {
  slot: Slot;
  lang: string;
  /** The resolved items of `slot.pool` — `[]` when unset or unnamed. */
  poolItems: PoolItem[];
  /** Every pool name already in the draft, offered as autocomplete. */
  poolNames: string[];
  onMechanicChange: (input: string) => void;
  onPoolNameChange: (poolName: string | undefined) => void;
  onAnswerChange: (answer: string[]) => void;
  onAddPoolItem: (text: string) => void;
  onRemovePoolItem: (itemId: string) => void;
  onSetPoolItemText: (itemId: string, text: string) => void;
  onSetPoolItemMedia: (itemId: string, media: string | undefined) => void;
}

export default function SlotAnswerEditor({
  slot,
  lang,
  poolItems,
  poolNames,
  onMechanicChange,
  onPoolNameChange,
  onAnswerChange,
  onAddPoolItem,
  onRemovePoolItem,
  onSetPoolItemText,
  onSetPoolItemMedia,
}: SlotAnswerEditorProps) {
  const t = copyFor(lang);
  const [poolNameText, setPoolNameText] = useState(slot.pool ?? '');
  const pooled = POOLED_MECHANICS.has(slot.input);
  const mechanicFieldId = `${slot.id}-mechanic`;
  const poolNameFieldId = `${slot.id}-pool-name`;
  const poolListId = `${slot.id}-pool-names`;

  function handlePoolNameChange(value: string) {
    setPoolNameText(value);
    onPoolNameChange(value === '' ? undefined : value);
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`slot-answer-editor-${slot.id}`}>
      <div className="flex flex-col gap-1">
        <label htmlFor={mechanicFieldId} className="text-sm font-medium text-zinc-100">
          {t.mechanicLabel}
        </label>
        <select
          id={mechanicFieldId}
          data-testid={`mechanic-select-${slot.id}`}
          value={slot.input}
          onChange={(event) => onMechanicChange(event.target.value)}
          style={{ colorScheme: 'dark' }}
          className="w-full max-w-xs rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {MECHANICS.map((mechanic) => (
            <option key={mechanic} value={mechanic}>
              {mechanic}
            </option>
          ))}
          {!MECHANICS.includes(slot.input as (typeof MECHANICS)[number]) && (
            <option value={slot.input}>{slot.input}</option>
          )}
        </select>
      </div>

      {slot.input === 'text' && (
        <div className="flex flex-col gap-2" data-testid={`text-answers-${slot.id}`}>
          <span className="text-sm font-medium text-zinc-100">{t.textAnswerLabel}</span>
          {slot.answer.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                data-testid={`text-answer-${slot.id}-${index}`}
                value={value}
                onChange={(event) => {
                  const next = [...slot.answer];
                  next[index] = event.target.value;
                  onAnswerChange(next);
                }}
                className="w-full max-w-sm rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <button
                type="button"
                aria-label={t.removeAnswer}
                onClick={() => onAnswerChange(slot.answer.filter((_, i) => i !== index))}
                className="text-sm text-muted-foreground hover:text-destructive"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid={`add-text-answer-${slot.id}`}
            onClick={() => onAnswerChange([...slot.answer, ''])}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {t.addAnswer}
          </button>
        </div>
      )}

      {pooled && (
        <div className="flex flex-col gap-2" data-testid={`pool-editor-${slot.id}`}>
          <div className="flex flex-col gap-1">
            <label htmlFor={poolNameFieldId} className="text-sm font-medium text-zinc-100">
              {t.poolNameLabel}
            </label>
            <input
              id={poolNameFieldId}
              type="text"
              list={poolListId}
              data-testid={`pool-name-${slot.id}`}
              value={poolNameText}
              onChange={(event) => handlePoolNameChange(event.target.value)}
              className="w-full max-w-sm rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <datalist id={poolListId}>
              {poolNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          {poolNameText === '' ? (
            <p className="text-sm text-muted-foreground">{t.needsPoolName}</p>
          ) : (
            <div className="flex flex-col gap-2" data-testid={`pool-items-${slot.id}`}>
              {poolItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`${slot.id}-correct`}
                      aria-label={t.correctAnswer}
                      data-testid={`pool-item-correct-${slot.id}-${item.id}`}
                      checked={slot.answer[0] === item.id}
                      onChange={() => onAnswerChange([item.id])}
                    />
                  </label>
                  <input
                    type="text"
                    aria-label={t.poolItemText}
                    data-testid={`pool-item-text-${slot.id}-${item.id}`}
                    value={item.text ?? ''}
                    onChange={(event) => onSetPoolItemText(item.id, event.target.value)}
                    className="rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <input
                    type="text"
                    placeholder={t.poolItemMedia}
                    aria-label={t.poolItemMedia}
                    data-testid={`pool-item-media-${slot.id}-${item.id}`}
                    value={item.media ?? ''}
                    onChange={(event) =>
                      onSetPoolItemMedia(
                        item.id,
                        event.target.value === '' ? undefined : event.target.value,
                      )
                    }
                    className="rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <button
                    type="button"
                    aria-label={t.removeOption}
                    data-testid={`remove-pool-item-${slot.id}-${item.id}`}
                    onClick={() => onRemovePoolItem(item.id)}
                    className="text-sm text-muted-foreground hover:text-destructive"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                type="button"
                data-testid={`add-pool-item-${slot.id}`}
                onClick={() => onAddPoolItem('')}
                className="w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {t.addOption}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
