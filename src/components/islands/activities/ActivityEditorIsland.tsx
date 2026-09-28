/**
 * ActivityEditorIsland — the `/[lang]/crear/[id]` editor shell (PR B,
 * "Activities creator"; reworked in "creator polish round 2"). Progressive
 * disclosure, top to bottom:
 *
 *  - Top bar (always visible, minimal): title, level, preview toggle.
 *  - Center: the ordered block list ({@link BlockList}); below it,
 *    "+ Agregar bloque" opens the same two-card {@link BlockTypePicker}
 *    inline, and choosing Worksheet opens {@link WorksheetUploader} —
 *    each uploaded image becomes its own new worksheet block, appended in
 *    order, expanded.
 *  - Preview mode swaps the block list for {@link WorksheetPlayer} renders
 *    of every worksheet block, learner-view, not graded.
 *
 * STATE = ONE UNDO/REDO HISTORY (`src/lib/activities/history.ts`) over a
 * single `{ title, level, blocks }` document — `history.present` IS the
 * document; every discrete change (title/level edit, add/delete/reorder/
 * rotate block, zone edit) is one `pushHistory` step, while a zone drag's
 * many pointermove frames collapse into ONE step via `replacePresent` +
 * `commitTransaction` (see `updateDoc` below and `WorksheetZoneEditor`'s
 * `commit` option).
 *
 * AUTOSAVE (`src/lib/activities/autosave.ts`) watches `history.present` and
 * saves ~3s after the last change, single-flight, skipping a no-op save.
 * The save-status indicator is ICON-ONLY (no "Cambios sin guardar" text) —
 * see `SaveStatusIndicator`. Manual save (button + Ctrl/⌘+S) and the error
 * "Reintentar" action both force an immediate real save via `saveNow`.
 *
 * Escape deselects the current zone — the editor's other global keyboard
 * shortcuts are undo (Ctrl/⌘+Z), redo (Ctrl/⌘+Shift+Z or Ctrl+Y) and save
 * (Ctrl/⌘+S).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { LEVELS, isLevel, type Level } from '@/lib/exerciseTaxonomy';
import type { Block, WorksheetBlock } from '@/lib/activities/blocks';
import {
  initHistory,
  pushHistory,
  replacePresent,
  commitTransaction,
  undo,
  redo,
  canUndo,
  canRedo,
  type HistoryState,
} from '@/lib/activities/history';
import { createAutosaveScheduler, type AutosaveScheduler, type AutosaveStatus } from '@/lib/activities/autosave';
import { Button } from '@/components/ui/button';
import BlockTypePicker from './BlockTypePicker';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';
import BlockList, { type BlocksChangeOptions } from './BlockList';
import WorksheetPlayer from './WorksheetPlayer';
import EditorSideToolbar from './EditorSideToolbar';

export interface ActivityEditorIslandProps {
  lang: Lang;
  activityId: string;
  initialTitle: string;
  initialLevel: Level | null;
  initialBlocks: Block[];
}

/** The editor's whole undo/redo-able document. */
interface ActivityDoc {
  title: string;
  level: Level | null;
  blocks: Block[];
}

function resolveImageUrl(path: string): string {
  return `/api/actividades/imagen?path=${encodeURIComponent(path)}`;
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent ?? '');
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

  const [history, setHistory] = useState<HistoryState<ActivityDoc>>(() =>
    initHistory({ title: initialTitle, level: initialLevel, blocks: initialBlocks }),
  );
  const doc = history.present;
  const { title, level, blocks } = doc;

  const [saveState, setSaveState] = useState<AutosaveStatus | 'idle'>('idle');
  const [preview, setPreview] = useState(false);
  const [expandedBlockIds, setExpandedBlockIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [showUploader, setShowUploader] = useState(false);

  // Baseline captured at the start of an in-progress (non-committing)
  // transaction, e.g. a zone drag — see `updateDoc`.
  const transactionBaselineRef = useRef<ActivityDoc | null>(null);

  const updateDoc = useCallback((next: ActivityDoc, opts?: BlocksChangeOptions) => {
    setHistory((h) => {
      if (opts?.commit === false) {
        if (transactionBaselineRef.current === null) transactionBaselineRef.current = h.present;
        return replacePresent(h, next);
      }
      if (transactionBaselineRef.current !== null) {
        const baseline = transactionBaselineRef.current;
        transactionBaselineRef.current = null;
        return commitTransaction(replacePresent(h, next), baseline);
      }
      return pushHistory(h, next);
    });
  }, []);

  const changeTitle = useCallback(
    (value: string) => updateDoc({ ...doc, title: value }),
    [doc, updateDoc],
  );

  const changeLevel = useCallback(
    (value: string) => updateDoc({ ...doc, level: isLevel(value) ? value : null }),
    [doc, updateDoc],
  );

  const changeBlocks = useCallback(
    (next: Block[], opts?: BlocksChangeOptions) => updateDoc({ ...doc, blocks: next }, opts),
    [doc, updateDoc],
  );

  const toggleBlockExpanded = useCallback((blockId: string) => {
    setExpandedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  const collapseAllBlocks = useCallback(() => setExpandedBlockIds(new Set()), []);
  const expandAllBlocks = useCallback(() => {
    setExpandedBlockIds(new Set(blocks.map((b) => b.id)));
  }, [blocks]);

  // Block-index popover: expand the chosen block and scroll it into view —
  // it may already be off-screen above/below the current scroll position.
  const goToBlock = useCallback((blockId: string) => {
    setExpandedBlockIds((prev) => new Set(prev).add(blockId));
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`block-${blockId}`);
    // `scrollIntoView` does not exist in jsdom (and is not guaranteed on
    // every real UA either) — feature-detect rather than assume it.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleUndo = useCallback(() => setHistory(undo), []);
  const handleRedo = useCallback(() => setHistory(redo), []);

  // Escape deselects the current zone — the editor's one selection-related
  // global keyboard shortcut (undo/redo/save are handled below).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (selectedZoneId) setSelectedZoneId(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedZoneId]);

  // Autosave: watches `doc`, saves ~3s after the last change, single-flight,
  // skips a no-op save. Created once per `activityId`.
  const schedulerRef = useRef<AutosaveScheduler<ActivityDoc> | null>(null);
  useEffect(() => {
    const scheduler = createAutosaveScheduler<ActivityDoc>({
      save: async (value) => {
        const res = await fetch(`/api/actividades/${activityId}/guardar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: value.title, level: value.level, blocks: value.blocks }),
        });
        if (!res.ok) throw new Error('save failed');
      },
      onStatusChange: setSaveState,
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [activityId]);

  // Skip the very first run (mount) — nothing changed yet, so nothing to autosave.
  const skippedFirstNotifyRef = useRef(false);
  useEffect(() => {
    if (!skippedFirstNotifyRef.current) {
      skippedFirstNotifyRef.current = true;
      return;
    }
    schedulerRef.current?.notifyChange(doc);
  }, [doc]);

  const handleSaveNow = useCallback(() => {
    schedulerRef.current?.saveNow(doc);
  }, [doc]);

  // Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo, Ctrl/⌘+S save.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        handleSaveNow();
      } else if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if (key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveNow, handleUndo, handleRedo]);

  // Warn before a tab close/reload while anything is unsaved — the browser's
  // own (unthemeable) confirmation dialog; see owner request #9 for the
  // separate, custom in-app navigation modal.
  useEffect(() => {
    const unsaved = saveState === 'pending' || saveState === 'saving' || saveState === 'error';
    if (!unsaved) return undefined;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

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
      if (newBlocks.length > 0) {
        setExpandedBlockIds((prev) => {
          const next = new Set(prev);
          for (const b of newBlocks) next.add(b.id);
          return next;
        });
      }
    },
    [blocks, changeBlocks],
  );

  const saveLabels = useMemo(
    () => ({ saving: t.savingStatus, saved: t.savedStatus, error: t.errorStatus, unsaved: t.unsaved, retry: t.saveRetry }),
    [t],
  );

  return (
    <div data-testid="activity-editor-island" className="flex flex-col gap-4">
      {/* Compact top bar (owner request #1): just title + level. Everything
          else (preview, save, undo/redo, block navigation) lives in the
          sticky side toolbar so this row stays a single, short line. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
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
                rotation={block.rotation}
                imageUrl={resolveImageUrl(block.image.path)}
              />
            ))}
        </div>
      ) : (
        <>
          <BlockList
            lang={lang}
            blocks={blocks}
            expandedBlockIds={expandedBlockIds}
            selectedZoneId={selectedZoneId}
            resolveImageUrl={resolveImageUrl}
            onToggleExpand={toggleBlockExpanded}
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

      <EditorSideToolbar
        lang={lang}
        blocks={blocks}
        onCollapseAll={collapseAllBlocks}
        onExpandAll={expandAllBlocks}
        onGoToBlock={goToBlock}
        onAddBlock={() => setAddingBlock(true)}
        preview={preview}
        onTogglePreview={() => setPreview((p) => !p)}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSaveNow}
        saveDisabled={saveState === 'saving'}
        saveState={saveState}
        saveLabels={saveLabels}
      />
    </div>
  );
}
