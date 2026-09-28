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
import type { Block, IncompleteBlockInfo, WorksheetBlock } from '@/lib/activities/blocks';
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
import ScrollToTop from '@/components/islands/ScrollToTop';
import BlockTypePicker from './BlockTypePicker';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';
import BlockList, { type BlocksChangeOptions } from './BlockList';
import WorksheetPlayer from './WorksheetPlayer';
import EditorSideToolbar from './EditorSideToolbar';
import UnsavedChangesModal from './UnsavedChangesModal';
import SubmitForReviewDialog from './SubmitForReviewDialog';

export interface ActivityEditorIslandProps {
  lang: Lang;
  activityId: string;
  initialTitle: string;
  initialLevel: Level | null;
  initialBlocks: Block[];
  /** `activities.status` (PR D, "Activities practice") — drives the review-state badge. Defaults to `'draft'` for a brand-new activity. */
  initialStatus?: string;
  /** `activities.review_note` — shown alongside the badge when `initialStatus === 'rejected'`. */
  initialReviewNote?: string | null;
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

/**
 * `activities.status` -> the `t.status*` key that names it (PR D, "Activities
 * practice"). `removed` is deliberately absent — it never reaches the editor
 * (excluded from the author's own edit surface, `getActivityForEdit`'s
 * header) — so an unrecognized status falls back to `statusDraft` below.
 */
const STATUS_LABEL_KEYS = {
  draft: 'statusDraft',
  pending_review: 'statusPendingReview',
  live: 'statusLive',
  rejected: 'statusRejected',
} as const;

export default function ActivityEditorIsland({
  lang,
  activityId,
  initialTitle,
  initialLevel,
  initialBlocks,
  initialStatus = 'draft',
  initialReviewNote = null,
}: ActivityEditorIslandProps) {
  const t = UI_LABELS[lang].activities.editor;
  const levelLabels = UI_LABELS[lang].english.levels;

  const [history, setHistory] = useState<HistoryState<ActivityDoc>>(() =>
    initHistory({ title: initialTitle, level: initialLevel, blocks: initialBlocks }),
  );
  const doc = history.present;
  const { title, level, blocks } = doc;

  const [saveState, setSaveState] = useState<AutosaveStatus | 'idle'>('idle');
  // Review-state badge (PR D, "Activities practice"). Updated OPTIMISTICALLY
  // after a successful submit — see `handleConfirmSubmit` — mirroring exactly
  // what `enviar.ts` itself computes server-side (draft/rejected ->
  // pending_review; live stays live).
  const [status, setStatus] = useState(initialStatus);
  const [submitDialog, setSubmitDialog] = useState<{
    open: boolean;
    submitting: boolean;
    error: string | null;
  }>({ open: false, submitting: false, error: null });
  // `enviar.ts`'s `{ error: 'incomplete', blockId, zoneId, reason }` response
  // (creator polish round 3, owner feedback #1): instead of a generic dialog
  // error, the submit dialog closes and the editor jumps straight to the
  // exact block/zone that still needs work, with a short inline message
  // there. Cleared on the next blocks edit (see the `blocks`-watching effect
  // below) — an old pointer is stale the moment the author starts fixing it.
  const [incompleteTarget, setIncompleteTarget] = useState<{
    blockId: string;
    zoneId: string | null;
    reason: IncompleteBlockInfo['reason'];
  } | null>(null);
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

  // Accordion (creator "one-screen" pass): expanding a block makes it the
  // SOLE expanded one — `BlockList`'s desktop "focus" layout derives its
  // active block straight from this being a one-element set, so clicking a
  // different block's header both collapses the previous one AND makes the
  // new one active in the same step (owner request: "selecting another
  // block makes it the active/expanded one"). Toggling the already-expanded
  // block back off clears the set entirely — no block is active.
  const toggleBlockExpanded = useCallback((blockId: string) => {
    setExpandedBlockIds((prev) => (prev.has(blockId) ? new Set() : new Set([blockId])));
  }, []);

  const collapseAllBlocks = useCallback(() => setExpandedBlockIds(new Set()), []);
  // Deliberately NOT the focus layout (see `BlockList.tsx`'s own header):
  // expanding every block at once falls back to normal page scrolling.
  const expandAllBlocks = useCallback(() => {
    setExpandedBlockIds(new Set(blocks.map((b) => b.id)));
  }, [blocks]);

  // Block-index popover: make the chosen block the sole active one (same
  // accordion rule as `toggleBlockExpanded`) and scroll it into view — it
  // may already be off-screen above/below the current scroll position.
  const goToBlock = useCallback((blockId: string) => {
    setExpandedBlockIds(new Set([blockId]));
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`block-${blockId}`);
    // `scrollIntoView` does not exist in jsdom (and is not guaranteed on
    // every real UA either) — feature-detect rather than assume it.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // A rejected submit's exact incomplete spot is stale the moment the
  // author touches ANY block content again — clear it on the next blocks
  // edit rather than leaving a pointer to a gap that may already be fixed.
  useEffect(() => {
    setIncompleteTarget(null);
  }, [blocks]);

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

  // Skip the very first run (mount) — nothing changed yet, so nothing to
  // autosave. Also skip every LIVE, in-progress frame of a zone drag/resize
  // (creator polish round 3, owner feedback #1): `updateDoc` above sets
  // `transactionBaselineRef` on the FIRST `commit: false` update of a drag
  // and clears it back to `null` exactly on the commit that seals the whole
  // gesture into one undo step (`replacePresent`/`commitTransaction`) — so
  // "still non-null when this effect runs" means "a drag is still in
  // progress", and `notifyChange` (which (re)starts the ~5s debounce) is
  // deferred until the commit that ends it, instead of firing — and
  // resetting the timer — on every single pointermove frame.
  const skippedFirstNotifyRef = useRef(false);
  useEffect(() => {
    if (!skippedFirstNotifyRef.current) {
      skippedFirstNotifyRef.current = true;
      return;
    }
    if (transactionBaselineRef.current !== null) return;
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

  const isDirty = saveState === 'pending' || saveState === 'saving' || saveState === 'error';
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const docRef = useRef(doc);
  docRef.current = doc;

  // Warn before a tab close/reload while anything is unsaved — the browser's
  // own (unthemeable) confirmation dialog. No browser lets a page customize
  // that text any more, so this is the one case the custom modal below
  // cannot replace.
  useEffect(() => {
    if (!isDirty) return undefined;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Owner request #9: for an IN-APP navigation (a link inside the site, or
  // an Astro ClientRouter transition) while dirty, show our own modal
  // instead of silently losing work. Two independent hooks into "the user
  // is about to leave this page for another one":
  //  - a capture-phase click listener on every `a[href]` (works whether or
  //    not the ClientRouter is even active on this route);
  //  - `astro:before-preparation`, the ClientRouter's own pre-navigation
  //    event, cancelable via `preventDefault()` — belt and suspenders with
  //    the click listener above; whichever fires first wins, the other is
  //    a no-op (the modal is already open for the same href).
  const [navGuard, setNavGuard] = useState<{ open: boolean; href: string | null; saving: boolean; error: boolean }>(
    { open: false, href: null, saving: false, error: false },
  );

  const openNavGuard = useCallback((href: string | null) => {
    setNavGuard({ open: true, href, saving: false, error: false });
  }, []);

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (!isDirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // An in-page hash link (same path/query, different hash) never loses
      // this editor's state — let it through.
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      e.preventDefault();
      e.stopPropagation();
      openNavGuard(anchor.href);
    }
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [openNavGuard]);

  useEffect(() => {
    function onBeforePreparation(e: Event) {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      const to = (e as unknown as { to?: URL | string }).to;
      openNavGuard(typeof to === 'string' ? to : (to?.href ?? null));
    }
    document.addEventListener('astro:before-preparation', onBeforePreparation);
    return () => document.removeEventListener('astro:before-preparation', onBeforePreparation);
  }, [openNavGuard]);

  const closeNavGuard = useCallback(() => {
    setNavGuard({ open: false, href: null, saving: false, error: false });
  }, []);

  const handleLeaveWithoutSaving = useCallback(() => {
    const href = navGuard.href;
    closeNavGuard();
    if (href) window.location.href = href;
  }, [navGuard.href, closeNavGuard]);

  const handleSaveAndLeave = useCallback(async () => {
    const href = navGuard.href;
    setNavGuard((g) => ({ ...g, saving: true, error: false }));
    try {
      const value = docRef.current;
      const res = await fetch(`/api/actividades/${activityId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: value.title, level: value.level, blocks: value.blocks }),
      });
      if (!res.ok) throw new Error('save failed');
      setNavGuard({ open: false, href: null, saving: false, error: false });
      if (href) window.location.href = href;
    } catch {
      setNavGuard((g) => ({ ...g, saving: false, error: true }));
    }
  }, [activityId, navGuard.href]);

  const openSubmitDialog = useCallback(() => {
    setSubmitDialog({ open: true, submitting: false, error: null });
  }, []);

  const closeSubmitDialog = useCallback(() => {
    setSubmitDialog((s) => (s.submitting ? s : { open: false, submitting: false, error: null }));
  }, []);

  // Flushes the CURRENT document first (same direct-fetch shape as
  // `handleSaveAndLeave` — the debounced autosave scheduler is bypassed so
  // the submit sees exactly what is on screen, not whatever it last
  // scheduled), then submits it for review. `enviar.ts`'s own reason codes
  // (`rights_required`, `invalid_title`, `no_blocks`, `missing_zones`,
  // `invalid_blocks`, `no_draft`) map straight onto `t.submitErrors`.
  const handleConfirmSubmit = useCallback(async () => {
    setSubmitDialog((s) => ({ ...s, submitting: true, error: null }));
    try {
      const value = docRef.current;
      const saveRes = await fetch(`/api/actividades/${activityId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: value.title, level: value.level, blocks: value.blocks }),
      });
      if (!saveRes.ok) throw new Error('submit_failed');

      const submitRes = await fetch(`/api/actividades/${activityId}/enviar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acceptedRights: true }),
      });
      if (!submitRes.ok) {
        const errBody = (await submitRes.json().catch(() => ({}))) as {
          error?: string;
          blockId?: string;
          zoneId?: string | null;
          reason?: string;
        };
        if (
          errBody.error === 'incomplete' &&
          typeof errBody.blockId === 'string' &&
          typeof errBody.reason === 'string'
        ) {
          // Points the author straight at the exact gap instead of a
          // generic dialog error (creator polish round 3, owner feedback
          // #1) — close the dialog, expand/select that block/zone, and let
          // `BlockList`/`WorksheetZoneEditor` show a short inline message
          // there.
          const { blockId, reason } = errBody;
          const zoneId = errBody.zoneId ?? null;
          setSubmitDialog({ open: false, submitting: false, error: null });
          setExpandedBlockIds(new Set([blockId]));
          setSelectedZoneId(zoneId);
          setIncompleteTarget({
            blockId,
            zoneId,
            reason: reason as IncompleteBlockInfo['reason'],
          });
          if (typeof document !== 'undefined') {
            const el = document.getElementById(`block-${blockId}`);
            if (el && typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          return;
        }
        throw new Error(errBody.error ?? 'submit_failed');
      }

      setStatus((prev) => (prev === 'live' ? 'live' : 'pending_review'));
      setSubmitDialog({ open: false, submitting: false, error: null });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'submit_failed';
      const message = t.submitErrors[code as keyof typeof t.submitErrors] ?? t.submitErrors.submit_failed;
      setSubmitDialog((s) => ({ ...s, submitting: false, error: message }));
    }
  }, [activityId, t.submitErrors]);

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
      // Accordion (creator "one-screen" pass): only the LAST uploaded block
      // becomes the sole active one, even when several images were uploaded
      // at once — matches `toggleBlockExpanded`'s "one active block" model
      // instead of expanding all of them together.
      const last = newBlocks.at(-1);
      if (last) setExpandedBlockIds(new Set([last.id]));
    },
    [blocks, changeBlocks],
  );

  const saveLabels = useMemo(
    () => ({
      saving: t.savingStatus,
      saved: t.savedStatus,
      error: t.errorStatus,
      unsaved: t.unsaved,
      retry: t.saveRetry,
      errorRetry: t.saveErrorRetry,
    }),
    [t],
  );

  // Maps `findIncompleteBlock`'s own reason codes (`blocks.ts`) onto their
  // inline message — see `incompleteTarget`'s own comment above.
  const INCOMPLETE_REASON_KEYS = {
    no_zones: 'incompleteNoZones',
    no_answers: 'incompleteNoAnswers',
    too_few_options: 'incompleteTooFewOptions',
    answer_not_in_options: 'incompleteAnswerNotInOptions',
    quiz_no_slots: 'incompleteQuizNoSlots',
    quiz_no_answer: 'incompleteQuizNoAnswer',
    quiz_too_few_options: 'incompleteQuizTooFewOptions',
    quiz_answer_not_in_pool: 'incompleteQuizAnswerNotInPool',
  } as const;
  const incompleteMessage = incompleteTarget ? t[INCOMPLETE_REASON_KEYS[incompleteTarget.reason]] : null;

  const navGuardLabels = useMemo(
    () => ({
      title: t.unsavedModalTitle,
      saveAndLeave: t.unsavedModalSaveAndLeave,
      leaveWithoutSaving: t.unsavedModalLeaveWithoutSaving,
      cancel: t.unsavedModalCancel,
      saveError: t.saveError,
    }),
    [t],
  );

  // Points at whichever of the two scroll containers below is currently
  // mounted (block list or preview — the two branches are mutually
  // exclusive), so the scoped `ScrollToTop` always tracks the right one
  // without needing to know which mode is active.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    // Desktop "one-screen" layout, creator polish round 3: ONE framed card
    // (border, rounded, `bg-card`) with real vertical margins from the site
    // header AND the footer — `[id].astro`'s section padding (`lg:pt-6` on
    // the back-button wrapper + `lg:pb-6` on the section, 3rem together) IS
    // those margins, so `lg:h-[calc(100dvh-65px-6rem)]` here must change
    // together with it (65px = `Header.astro`'s own height, unchanged — its
    // 1px border-b + 32px `py-4` + a 32px `h-8` logo row; the first 3rem is
    // that top+bottom padding; the SECOND 3rem is the `BackButton` row
    // `[id].astro` renders above this section — `h-9` button + `mb-3` gap —
    // added for site-wide back navigation, PR "Navigation + Inglés hub").
    // `lg:pr-16` reserves room for `EditorSideToolbar`'s `fixed right-3` icon
    // rail — UNTOUCHED by this pass, per owner decision — so it never
    // overlaps the canvas/properties column. Below `lg:` this is
    // intentionally untouched — today's stacked, scrollable layout keeps
    // working; a dedicated mobile layout comes later.
    <div
      data-testid="activity-editor-island"
      className="flex flex-col gap-4 lg:h-[calc(100dvh-65px-6rem)] lg:gap-2 lg:pr-16"
    >
      {/* THE card: everything below is inside it, one bordered/rounded
          surface. `lg:min-h-0` + `lg:overflow-hidden` are the actual "stays
          fully visible on screen" guarantee — the header row below is
          `flex-none` (its own intrinsic height), the body below it is the
          ONLY flexible, scrolling area, so the card as a whole can never
          grow past the height the root above gives it. */}
      <div
        data-testid="activity-editor-card"
        className="relative flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:bg-card"
      >
        {/* Compact header row (owner request #1, creator polish round 2):
            title + level, plus — PR D, "Activities practice" — the
            review-state badge and "Enviar a revisión". `lg:min-h-14` (was a
            hard `lg:h-12`) lets this row grow if the badge/note wrap onto a
            second line instead of clipping. Creator polish round 3
            (desktop only — below `lg:` this row keeps its own original box
            untouched): the title becomes the visibly larger, semibold field
            (it names the whole card), and at `lg:` this row IS the card's
            own header (`border-b`, not a separate boxed element) — no other
            action row lives here. */}
        <div className="flex flex-none flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center lg:min-h-14 lg:flex-row lg:items-center lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">{t.titleLabel}</span>
            <input
              type="text"
              data-testid="activity-title-input"
              aria-label={t.titleLabel}
              value={title}
              onChange={(e) => changeTitle(e.target.value)}
              className="h-9 rounded border border-border bg-background px-2 text-base font-medium text-foreground lg:h-10 lg:border-transparent lg:bg-transparent lg:px-1 lg:text-xl lg:font-semibold lg:hover:border-border lg:focus-visible:border-border lg:focus-visible:outline-none"
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
          <div className="flex flex-wrap items-center gap-2" data-testid="activity-status-badge" data-status={status}>
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
              {STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS]
                ? t[STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS]]
                : t.statusDraft}
            </span>
            {status === 'rejected' && initialReviewNote && (
              <span data-testid="activity-review-note" className="text-xs text-muted-foreground">
                {t.reviewNoteLabel}: {initialReviewNote}
              </span>
            )}
          </div>
          <Button type="button" size="sm" data-testid="submit-for-review-button" onClick={openSubmitDialog}>
            {t.submitForReview}
          </Button>
        </div>

        {preview ? (
          <div
            ref={scrollContainerRef}
            data-testid="activity-preview"
            className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-3"
          >
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
          // The card's body: consistent inner padding (`p-3`) so nothing
          // touches the card edges, and THIS is the one scrolling region
          // (`min-h-0 flex-1 overflow-y-auto`) — see `BlockList.tsx`'s own
          // header for how its ONE active/expanded block then gets the
          // flexible height inside it. The add-block flow (picker/uploader)
          // scrolls into view here too, inside the same card, instead of
          // growing the page past it.
          <div
            ref={scrollContainerRef}
            className="flex min-h-0 flex-1 flex-col gap-4 lg:gap-3 lg:overflow-y-auto lg:p-3"
          >
            <BlockList
              lang={lang}
              blocks={blocks}
              expandedBlockIds={expandedBlockIds}
              selectedZoneId={selectedZoneId}
              resolveImageUrl={resolveImageUrl}
              onToggleExpand={toggleBlockExpanded}
              onSelectZone={setSelectedZoneId}
              onBlocksChange={changeBlocks}
              incompleteBlockId={incompleteTarget?.blockId ?? null}
              incompleteZoneId={incompleteTarget?.zoneId ?? null}
              incompleteMessage={incompleteMessage}
            />

            {/* Desktop already has this same action in the sticky side
                toolbar's icon (`toolbar-add-block`, always reachable
                without scrolling); this text button stays for
                mobile/narrow layouts. */}
            {!addingBlock && (
              <Button
                type="button"
                variant="outline"
                data-testid="add-block-button"
                onClick={() => setAddingBlock(true)}
                className="flex-none lg:hidden"
              >
                + {t.addBlock}
              </Button>
            )}

            {addingBlock && !showUploader && (
              <BlockTypePicker lang={lang} onSelectWorksheet={handleWorksheetChosen} />
            )}

            {addingBlock && showUploader && <WorksheetUploader lang={lang} onComplete={handleUploadComplete} />}
          </div>
        )}

        {/* Scoped "back to top" for the card's own scroll container (block
            list or preview, whichever is mounted) — reuses the same island
            `BaseLayout` mounts globally, targeted at `scrollContainerRef`
            instead of the window. Positioned inside THIS card (the
            `relative` ancestor above), never the page. */}
        <ScrollToTop lang={lang} targetRef={scrollContainerRef} />
      </div>

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

      <UnsavedChangesModal
        open={navGuard.open}
        saving={navGuard.saving}
        error={navGuard.error}
        labels={navGuardLabels}
        onSaveAndLeave={() => void handleSaveAndLeave()}
        onLeaveWithoutSaving={handleLeaveWithoutSaving}
        onCancel={closeNavGuard}
      />

      <SubmitForReviewDialog
        lang={lang}
        open={submitDialog.open}
        submitting={submitDialog.submitting}
        errorMessage={submitDialog.error}
        onConfirm={() => void handleConfirmSubmit()}
        onCancel={closeSubmitDialog}
      />
    </div>
  );
}
