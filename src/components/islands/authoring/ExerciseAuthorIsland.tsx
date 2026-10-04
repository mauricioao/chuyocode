/**
 * ExerciseAuthorIsland — the authoring shell (slice 15, design.md §8).
 *
 * Holds the draft in React state and composes the pieces slices 14-16 ship:
 * `BlockList` (drag reorder), the per-kind block editors, and
 * `ExercisePreview` (the real `ExerciseIsland`, WYSIWYG by construction).
 *
 * PERSISTENCE IS SLICE 17, NOT THIS ONE. `onSave` is OPTIONAL and, until
 * slice 17 supplies it, the Save/Publish controls render disabled with an
 * explanatory note — this island invents no API of its own for saving.
 * When wired, `onSave` receives exactly the shape
 * `POST /api/ejercicios/[id]/guardar` expects (design §8):
 * `{ payload, blocks, publish, acceptedTerms }`.
 *
 * ID GENERATION lives here, not in `authoringDraft.ts` (see that module's
 * header): a plain incrementing counter, unique per mount, which is all a
 * client-only authoring session needs.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import BlockList from './BlockList';
import ProseBlockEditor from './ProseBlockEditor';
import MediaBlockEditor from './MediaBlockEditor';
import RowBlockEditor from './RowBlockEditor';
import SlotAnswerEditor from './SlotAnswerEditor';
import SlotExplanationEditor from './SlotExplanationEditor';
import ExercisePreview from './ExercisePreview';
import {
  addMediaBlock,
  addPoolItem,
  addProseBlock,
  addRowBlock,
  draftToPayload,
  removeBlock,
  removePoolItem,
  setBlockAlt,
  setBlockAudio,
  setBlockImage,
  setBlockText,
  setPoolItemMedia,
  setPoolItemText,
  setRowLabel,
  setSlotAnswer,
  setSlotExplanation,
  setSlotInput,
  setSlotPool,
  type Draft,
} from '@/lib/authoringDraft';
import type { Block, Payload } from '@/lib/exercisePayload';

export const COPY = {
  es: {
    addProse: 'Agregar texto de contexto',
    addMedia: 'Agregar imagen o audio',
    addRow: 'Agregar oración',
    empty: 'Este ejercicio todavía no tiene partes. Agrega una para empezar.',
    previewHeading: 'Vista previa',
    termsLabel: 'Acepto los términos de publicación (obligatorio en la primera publicación).',
    saveDraft: 'Guardar borrador',
    publish: 'Publicar',
    saveUnavailable: 'Guardar todavía no está disponible.',
    moveProse: 'Mover: bloque de texto',
    moveMedia: 'Mover: bloque multimedia',
    moveRow: (label: string) => `Mover: ${label || 'oración sin enunciado'}`,
  },
  en: {
    addProse: 'Add context text',
    addMedia: 'Add image or audio',
    addRow: 'Add sentence',
    empty: 'This exercise has no parts yet. Add one to get started.',
    previewHeading: 'Preview',
    termsLabel: 'I accept the publishing terms (required on first publish).',
    saveDraft: 'Save draft',
    publish: 'Publish',
    saveUnavailable: 'Saving is not available yet.',
    moveProse: 'Move: text block',
    moveMedia: 'Move: media block',
    moveRow: (label: string) => `Move: ${label || 'sentence with no text yet'}`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** Everything `POST /api/ejercicios/[id]/guardar` needs from one save/publish press. */
export interface AuthoringSaveInput {
  payload: Payload;
  blocks: Block[];
  publish: boolean;
  acceptedTerms: boolean;
}

export interface ExerciseAuthorIslandProps {
  lang: string;
  initialDraft: Draft;
  /**
   * Called with {@link AuthoringSaveInput} when the author presses Save or
   * Publish. ABSENT in this slice — slice 17 wires it to the real request.
   * Until it is provided, both controls render `disabled`.
   */
  onSave?: (input: AuthoringSaveInput) => void;
  /**
   * Which action `onSave` is currently in flight for, if any — set by
   * `ExercisePublishFlow` while its own `POST .../guardar` is pending.
   * Drives the pressed button's own `loading` spinner/`aria-busy` and
   * disables BOTH controls meanwhile, so a slow save can't be fired twice
   * (coherent loading states, item 3). `undefined`/`null` means idle.
   */
  saving?: 'draft' | 'publish' | null;
}

export default function ExerciseAuthorIsland({
  lang,
  initialDraft,
  onSave,
  saving = null,
}: ExerciseAuthorIslandProps) {
  const t = copyFor(lang);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const counter = useRef(0);

  function nextId(prefix: string): string {
    counter.current += 1;
    return `${prefix}-${counter.current}`;
  }

  function handleReorder(nextBlocks: Block[]) {
    setDraft((current) => ({ ...current, blocks: nextBlocks }));
  }

  function handleSave(publish: boolean) {
    if (saving) return; // belt-and-braces: the buttons are already disabled while a save is in flight.
    onSave?.({ payload: draftToPayload(draft), blocks: draft.blocks, publish, acceptedTerms });
  }

  function handleLabelFor(block: Block): string {
    if (block.kind === 'prose') return t.moveProse;
    if (block.kind === 'media') return t.moveMedia;
    const slot = draft.slots.find((s) => s.id === block.slotId);
    return t.moveRow(slot?.label ?? '');
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row" data-testid="exercise-author-island">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="add-prose-block"
            onClick={() => setDraft((d) => addProseBlock(d, nextId('prose')))}
          >
            {t.addProse}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="add-media-block"
            onClick={() => setDraft((d) => addMediaBlock(d, nextId('media')))}
          >
            {t.addMedia}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="add-row-block"
            onClick={() => setDraft((d) => addRowBlock(d, nextId('row'), nextId('slot')))}
          >
            {t.addRow}
          </Button>
        </div>

        {draft.blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <BlockList
            items={draft.blocks}
            onReorder={handleReorder}
            handleLabelFor={handleLabelFor}
            renderItem={(block) => {
              if (block.kind === 'prose') {
                return (
                  <ProseBlockEditor
                    block={block}
                    lang={lang}
                    onChange={(text) => setDraft((d) => setBlockText(d, block.id, text))}
                    onRemove={() => setDraft((d) => removeBlock(d, block.id))}
                  />
                );
              }
              if (block.kind === 'media') {
                return (
                  <MediaBlockEditor
                    block={block}
                    lang={lang}
                    onChangeImage={(v) => setDraft((d) => setBlockImage(d, block.id, v))}
                    onChangeAudio={(v) => setDraft((d) => setBlockAudio(d, block.id, v))}
                    onChangeAlt={(v) => setDraft((d) => setBlockAlt(d, block.id, v))}
                    onRemove={() => setDraft((d) => removeBlock(d, block.id))}
                  />
                );
              }
              // block.kind === 'row'
              const slot = draft.slots.find((s) => s.id === block.slotId);
              if (!slot) return null;
              return (
                <RowBlockEditor
                  slot={slot}
                  lang={lang}
                  onLabelChange={(label) => setDraft((d) => setRowLabel(d, slot.id, label))}
                  onRemove={() => setDraft((d) => removeBlock(d, block.id))}
                  answerEditor={
                    <>
                      <SlotAnswerEditor
                        slot={slot}
                        lang={lang}
                        poolItems={slot.pool ? (draft.pools[slot.pool] ?? []) : []}
                        poolNames={Object.keys(draft.pools)}
                        onMechanicChange={(input) => setDraft((d) => setSlotInput(d, slot.id, input))}
                        onPoolNameChange={(poolName) =>
                          setDraft((d) => setSlotPool(d, slot.id, poolName))
                        }
                        onAnswerChange={(answer) => setDraft((d) => setSlotAnswer(d, slot.id, answer))}
                        onAddPoolItem={(text) =>
                          setDraft((d) =>
                            slot.pool ? addPoolItem(d, slot.pool, { id: nextId('opt'), text }) : d,
                          )
                        }
                        onRemovePoolItem={(itemId) =>
                          setDraft((d) => (slot.pool ? removePoolItem(d, slot.pool, itemId) : d))
                        }
                        onSetPoolItemText={(itemId, text) =>
                          setDraft((d) => (slot.pool ? setPoolItemText(d, slot.pool, itemId, text) : d))
                        }
                        onSetPoolItemMedia={(itemId, media) =>
                          setDraft((d) =>
                            slot.pool ? setPoolItemMedia(d, slot.pool, itemId, media) : d,
                          )
                        }
                      />
                      <SlotExplanationEditor
                        slot={slot}
                        lang={lang}
                        onExplanationChange={(explanation) =>
                          setDraft((d) => setSlotExplanation(d, slot.id, explanation))
                        }
                      />
                    </>
                  }
                />
              );
            }}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">{t.previewHeading}</h2>
        <ExercisePreview lang={lang} payload={draftToPayload(draft)} />

        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox
            data-testid="accept-terms"
            checked={acceptedTerms}
            onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
          />
          {t.termsLabel}
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="save-draft"
            disabled={!onSave || !!saving}
            loading={saving === 'draft'}
            onClick={() => handleSave(false)}
          >
            {t.saveDraft}
          </Button>
          <Button
            type="button"
            data-testid="publish-exercise"
            disabled={!onSave || !!saving}
            loading={saving === 'publish'}
            onClick={() => handleSave(true)}
          >
            {t.publish}
          </Button>
        </div>
        {!onSave && (
          <p data-testid="save-unavailable" role="note" className="text-sm text-muted-foreground">
            {t.saveUnavailable}
          </p>
        )}
      </div>
    </div>
  );
}
