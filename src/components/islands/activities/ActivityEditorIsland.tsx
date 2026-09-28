/**
 * ActivityEditorIsland — the `/[lang]/crear/[id]` editor shell (PR B,
 * "Activities creator"). Progressive disclosure, top to bottom:
 *
 *  - Top bar (always visible, minimal): title, level, preview toggle, save
 *    with a clear saved/unsaved/saving/error state, and a `beforeunload`
 *    warning while there is anything unsaved.
 *  - Center: the ordered block list ({@link BlockList}); below it,
 *    "+ Agregar bloque" opens the same two-card {@link BlockTypePicker}
 *    inline, and choosing Worksheet opens {@link WorksheetUploader} —
 *    each uploaded image becomes its own new worksheet block, appended in
 *    order, with the first one selected.
 *  - Preview mode swaps the block list for {@link WorksheetPlayer} renders
 *    of every worksheet block, learner-view, not graded.
 *
 * Escape deselects (zone first, then block) — the editor's only global
 * keyboard shortcut, since nothing else here needs one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { LEVELS, isLevel, type Level } from '@/lib/exerciseTaxonomy';
import type { Block, WorksheetBlock } from '@/lib/activities/blocks';
import { Button } from '@/components/ui/button';
import BlockTypePicker from './BlockTypePicker';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';
import BlockList from './BlockList';
import WorksheetPlayer from './WorksheetPlayer';

export interface ActivityEditorIslandProps {
  lang: Lang;
  activityId: string;
  initialTitle: string;
  initialLevel: Level | null;
  initialBlocks: Block[];
}

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

function resolveImageUrl(path: string): string {
  return `/api/actividades/imagen?path=${encodeURIComponent(path)}`;
}

export default function ActivityEditorIsland({
  lang,
  activityId,
  initialTitle,
  initialLevel,
  initialBlocks,
}: ActivityEditorIslandProps) {
  const t = UI_LABELS[lang].activities.editor;
  const levelLabels = UI_LABELS[lang].english.levels;

  const [title, setTitle] = useState(initialTitle);
  const [level, setLevel] = useState<Level | null>(initialLevel);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [preview, setPreview] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [showUploader, setShowUploader] = useState(false);

  const markDirty = useCallback(() => {
    setSaveStatus((prev) => (prev === 'saving' ? prev : 'unsaved'));
  }, []);

  const changeTitle = useCallback(
    (value: string) => {
      setTitle(value);
      markDirty();
    },
    [markDirty],
  );

  const changeLevel = useCallback(
    (value: string) => {
      setLevel(isLevel(value) ? value : null);
      markDirty();
    },
    [markDirty],
  );

  const changeBlocks = useCallback(
    (next: Block[]) => {
      setBlocks(next);
      markDirty();
    },
    [markDirty],
  );

  const selectBlock = useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
    setSelectedZoneId(null);
  }, []);

  // Escape deselects — zone first, then block. The editor's one global
  // keyboard shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (selectedZoneId) {
        setSelectedZoneId(null);
      } else if (selectedBlockId) {
        setSelectedBlockId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedZoneId, selectedBlockId]);

  // Warn before an unsaved close/reload — never while a save is in flight or
  // already clean (the browser's own confirmation dialog is enough; no
  // custom copy is shown by any browser for `beforeunload` any more, but the
  // localized string still documents the intent for any legacy UA that does).
  useEffect(() => {
    if (saveStatus !== 'unsaved') return undefined;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      // `preventDefault()` alone is the modern, standards-track way to
      // trigger the browser's own (unthemeable) confirmation dialog; no
      // browser has shown a custom `returnValue` string in years.
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveStatus]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/actividades/${activityId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, level, blocks }),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
    } catch {
      setSaveStatus('error');
    }
  }, [activityId, title, level, blocks]);

  const handleWorksheetChosen = useCallback(() => {
    setShowUploader(true);
  }, []);

  const handleUploadComplete = useCallback(
    (images: UploadedImage[]) => {
      const newBlocks: WorksheetBlock[] = images.map((image) => ({
        id: crypto.randomUUID(),
        type: 'worksheet',
        rotation: 0,
        image,
        zones: [],
      }));
      changeBlocks([...blocks, ...newBlocks]);
      setAddingBlock(false);
      setShowUploader(false);
      if (newBlocks.length > 0) selectBlock(newBlocks[0].id);
    },
    [blocks, changeBlocks, selectBlock],
  );

  const saveLabel = useMemo(() => {
    switch (saveStatus) {
      case 'saving':
        return t.saving;
      case 'error':
        return t.saveError;
      case 'unsaved':
        return t.unsaved;
      default:
        return t.saved;
    }
  }, [saveStatus, t]);

  return (
    <div data-testid="activity-editor-island" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">{t.titleLabel}</span>
            <input
              type="text"
              data-testid="activity-title-input"
              aria-label={t.titleLabel}
              value={title}
              onChange={(e) => changeTitle(e.target.value)}
              className="h-9 rounded border border-border bg-background px-2 text-base font-medium text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">{t.levelLabel}</span>
            <select
              data-testid="activity-level-select"
              aria-label={t.levelLabel}
              value={level ?? ''}
              onChange={(e) => changeLevel(e.target.value)}
              className="h-9 rounded border border-border bg-background px-2 text-foreground"
            >
              <option value="">{t.levelNone}</option>
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {levelLabels[lvl]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="preview-toggle"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? t.previewOff : t.previewOn}
          </Button>
          <Button type="button" data-testid="save-button" onClick={() => void handleSave()} disabled={saveStatus === 'saving'}>
            {t.save}
          </Button>
          <span
            data-testid="save-status"
            data-status={saveStatus}
            role="status"
            className={`text-xs ${saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {saveLabel}
          </span>
        </div>
      </div>

      {preview ? (
        <div data-testid="activity-preview" className="flex flex-col gap-6">
          {blocks
            .filter((b): b is WorksheetBlock => b.type === 'worksheet')
            .map((block) => (
              <WorksheetPlayer
                key={block.id}
                lang={lang}
                image={block.image}
                zones={block.zones}
                imageUrl={resolveImageUrl(block.image.path)}
              />
            ))}
        </div>
      ) : (
        <>
          <BlockList
            lang={lang}
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            selectedZoneId={selectedZoneId}
            resolveImageUrl={resolveImageUrl}
            onSelectBlock={selectBlock}
            onSelectZone={setSelectedZoneId}
            onBlocksChange={changeBlocks}
          />

          {!addingBlock && (
            <Button type="button" variant="outline" data-testid="add-block-button" onClick={() => setAddingBlock(true)}>
              + {t.addBlock}
            </Button>
          )}

          {addingBlock && !showUploader && (
            <BlockTypePicker lang={lang} onSelectWorksheet={handleWorksheetChosen} />
          )}

          {addingBlock && showUploader && <WorksheetUploader lang={lang} onComplete={handleUploadComplete} />}
        </>
      )}
    </div>
  );
}
