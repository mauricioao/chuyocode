/**
 * ActivityEditorIsland — the `/[lang]/crear/[id]` editor shell (PR B,
 * "Activities creator"; reworked in "creator polish round 2"). Progressive
 * disclosure, top to bottom:
 *
 *  - Top bar (always visible, minimal): title, level, preview toggle.
 *  - Center: the ordered block list ({@link BlockList}); below it,
 *    "+ Agregar bloque" opens the same two-card {@link BlockTypePicker}
 *    inline. Worksheet opens {@link WorksheetUploader} — each uploaded image
 *    becomes its own new worksheet block, appended in order, expanded.
 *    Questions (PR C, "Preguntas (quiz) block") needs no upload step — one
 *    empty quiz block is appended and expanded immediately.
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
 *
 * "VER COMO PRESENTACIÓN" (worksheet zoom tour, sprint week 3): the header's
 * own button mounts {@link PresentationIsland} full-screen, straight over
 * this whole editor, against `history.present`'s CURRENT `blocks` (unsaved
 * included) — no save, no new route. `PresentationIsland` gets no
 * `practiceUrl`/`qrSvg` here and an `onExit` instead, which only closes the
 * overlay and hands focus back to the button (`closePresentationPreview`).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { MagnifyingGlassPlusIcon } from '@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { LEVELS, isLevel, type Level } from '@/lib/exerciseTaxonomy';
import type { Block, IncompleteBlockInfo, WorksheetBlock } from '@/lib/activities/blocks';
import { imagePreviewUrl } from '@/lib/activities/paths';
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
import { Select } from '@/components/ui/select';
import ScrollToTop from '@/components/islands/ScrollToTop';
import BlockTypePicker from './BlockTypePicker';
import WorksheetUploader, { type UploadedImage } from './WorksheetUploader';
import BlockList, { type BlocksChangeOptions } from './BlockList';
import WorksheetPlayer from './WorksheetPlayer';
import EditorSideToolbar from './EditorSideToolbar';
import UnsavedChangesModal from './UnsavedChangesModal';
import SubmitForReviewDialog from './SubmitForReviewDialog';
import PresentationIsland from './PresentationIsland';
import { EDITOR_WINDOW_GUARD_KEY, type EditorWindowGuard } from '@/lib/ui/deskWindow';
import { ICON_TOOLTIP_BUBBLE_CLASS, ICON_TOOLTIP_TRIGGER_CLASS } from '@/lib/ui/iconTooltip';

/**
 * The window title bar's own `<span>` ids ("desktop" redesign PART 6b) —
 * `DeskWindow.astro`'s own `titleId`/`statusId` DEFAULTS, which `[id].astro`
 * relies on by never overriding them. Two separate hydration islands (this
 * one and `DeskWindow`'s own inline script) cannot share one React state, so
 * this is the one explicit, documented contract between them: this island
 * writes `textContent` directly onto these two ids whenever the title or the
 * autosave status changes, instead of a portal (unlike the title bar's
 * EDITABLE title group and ACTIONS below, which this island owns entirely —
 * see `DESK_WINDOW_TITLE_GROUP_ID`/`DESK_WINDOW_ACTIONS_ID`'s own doc).
 * `DESK_WINDOW_TITLE_ID` targets a visually-hidden `aria-labelledby` span
 * once `titleEditable` is set (PART 6b polish) — this effect itself needs no
 * change either way, same id, same `textContent` write.
 */
const DESK_WINDOW_TITLE_ID = 'desk-window-title';
const DESK_WINDOW_STATUS_ID = 'desk-window-status';
/**
 * The window title bar's own EDITABLE title group ("desktop" redesign PART
 * 6b polish — owner report: a duplicated title, once in the title bar, once
 * again in the card's own header row). `DeskWindow.astro` renders this slot
 * (empty) only when its own `titleEditable` prop is set; this island
 * `createPortal`s the REAL controlled title `<input>` (same value/onChange,
 * same validation, same autosave as before — just relocated) plus the level
 * `<select>` and the review-status badge right after it, same technique
 * `DESK_WINDOW_ACTIONS_ID` below already uses. `null` for a standalone
 * render with no `DeskWindow` shell (e.g. a test that mounts just this
 * island) — nothing renders there, same posture as the actions portal.
 */
const DESK_WINDOW_TITLE_GROUP_ID = 'desk-window-title-group';
/**
 * The window title bar's own `actions` slot container — `DeskWindow.astro`
 * renders it (empty) unconditionally; "Ver como presentación" and "Enviar a
 * revisión" need the SAME React state (`doc`/`blocks`/`title`) this whole
 * island already owns, so rather than duplicating that state into a second
 * island, this one `createPortal`s its own buttons straight into that DOM
 * node — same technique `WorksheetPracticePlayer.tsx` already uses to reach
 * a header slot outside its own subtree.
 */
const DESK_WINDOW_ACTIONS_ID = 'desk-window-actions';

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
  /**
   * "Duplicar y adaptar" credit line (D7): the activity THIS one was
   * duplicated from, or `null`/`undefined` for an ordinary activity.
   * `href` is `null` once the source is no longer live — see
   * `[id].astro`'s own practice-page credit line for the same rule.
   */
  sourceActivity?: { title: string; href: string | null } | null;
}

/** The editor's whole undo/redo-able document. */
interface ActivityDoc {
  title: string;
  level: Level | null;
  blocks: Block[];
}

const resolveImageUrl = imagePreviewUrl;

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
  sourceActivity = null,
}: ActivityEditorIslandProps) {
  const t = UI_LABELS[lang].activities.editor;
  const levelLabels = UI_LABELS[lang].english.levels;
  const tCommon = UI_LABELS[lang].common;

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
  // "Open the first block on entry" (creator polish round 4, owner
  // feedback #1): a brand-new editor used to land with EVERY block
  // collapsed — a lost, huge-empty-card first impression. On first mount,
  // expand the FIRST block (the desktop "focus" layout `BlockList.tsx`
  // already derives from a one-element `expandedBlockIds`) instead, UNLESS
  // the URL's own hash already targets a different one — `goToBlock`'s own
  // `#block-<id>` convention (the block-index popover's deep link), read
  // straight out of `window.location.hash` since this island is client-only
  // (no SSR value to agree with). A brand-new, zero-block activity has
  // nothing to expand — its empty state (the type picker/uploader) is
  // already unconditionally open via `showAddFlow` below. "Collapse all"
  // (`collapseAllBlocks`) keeps working exactly as before: this only seeds
  // the INITIAL state, nothing pins it open afterward.
  const [expandedBlockIds, setExpandedBlockIds] = useState<ReadonlySet<string>>(() => {
    if (initialBlocks.length === 0) return new Set();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const hashBlockId = hash.startsWith('#block-') ? hash.slice('#block-'.length) : null;
    const targeted = hashBlockId && initialBlocks.some((b) => b.id === hashBlockId) ? hashBlockId : null;
    return new Set([targeted ?? initialBlocks[0].id]);
  });
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  // Empty activity (creator polish round 4, owner feedback #3): the add-flow
  // (picker, then the worksheet uploader) is ALWAYS open while there are
  // zero blocks — no separate "+" click needed first, matching
  // `BlockList.tsx`'s own "Elige con qué seguir" empty-state heading right
  // above it in the same scroll column.
  const showAddFlow = addingBlock || blocks.length === 0;

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
      // Toast IN ADDITION TO the icon (owner spec), only on the transition
      // INTO "error" — not on every status callback while it stays there —
      // so a failed autosave surfaces once, not a toast spam loop.
      onStatusChange: (status) => {
        setSaveState((prev) => {
          if (status === 'error' && prev !== 'error') {
            toast.error(tCommon.toast.autosaveError);
          }
          return status;
        });
      },
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
  //
  // Bug 3 ("two contradictory unsaved-changes prompts"): this listener must
  // be gone BEFORE any navigation WE initiate from the modal below (`window
  // .location.href = …`, a real browser navigation) — otherwise that very
  // navigation also fires `beforeunload`, and the native "leave site?"
  // prompt stacks right behind the modal the learner/author just answered.
  // The handler reference is kept in `onBeforeUnloadRef` precisely so
  // `removeBeforeUnloadGuard` below can detach the SAME listener instance
  // on demand, synchronously, instead of waiting for this effect's own
  // cleanup to run on a future render — a render that a same-tick
  // `window.location.href` assignment never gives React the chance to
  // flush before the browser starts tearing the page down.
  const onBeforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);
  useEffect(() => {
    if (!isDirty) return undefined;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    onBeforeUnloadRef.current = onBeforeUnload;
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      onBeforeUnloadRef.current = null;
    };
  }, [isDirty]);

  const removeBeforeUnloadGuard = useCallback(() => {
    if (!onBeforeUnloadRef.current) return;
    window.removeEventListener('beforeunload', onBeforeUnloadRef.current);
    onBeforeUnloadRef.current = null;
  }, []);

  // Owner request #9: for an IN-APP navigation (a link inside the site, or
  // an Astro ClientRouter transition) while dirty, show our own modal
  // instead of silently losing work. Two independent hooks into "the user
  // is about to leave this page for another one":
  //  - a capture-phase click listener on every `a[href]` (works whether or
  //    not the ClientRouter is even active on this route);
  //  - `astro:before-preparation`, the ClientRouter's own pre-navigation
  //    event, cancelable via `preventDefault()` — belt and suspenders with
  //    the click listener above; whichever fires first wins, the other is
  //    a no-op (the modal is already open for the same decision).
  //
  // RESOLVER-BASED (PART 6b, was `{ href, saving, error }` straight in
  // state): the window's own red/yellow lights (`DeskWindow`'s traffic
  // lights, now wrapping this whole island) ALSO need this exact modal —
  // see `EditorWindowGuard`'s `confirmClose` below — but `deskWindow.ts`,
  // not this component, decides what "close"/"minimize" means once the
  // author answers. So the modal no longer performs its own navigation: it
  // just resolves one `Promise<'save' | 'discard' | 'cancel'>` that EVERY
  // caller (this click listener, `astro:before-preparation`, and the window
  // guard) awaits and reacts to on its own terms. `'save'`/`'discard'` both
  // mean "the author's decision is done — safe to proceed now" (the actual
  // save, if any, already happened before the modal resolves); `'cancel'`
  // means "stay right here". Ordinary in-app link navigation (the one case
  // THIS component still performs itself) is below.
  const [navGuard, setNavGuard] = useState<{ open: boolean; saving: boolean; error: boolean }>({
    open: false,
    saving: false,
    error: false,
  });
  const navGuardResolveRef = useRef<((action: 'save' | 'discard' | 'cancel') => void) | null>(null);

  const requestNavGuardDecision = useCallback((): Promise<'save' | 'discard' | 'cancel'> => {
    return new Promise((resolve) => {
      navGuardResolveRef.current = resolve;
      setNavGuard({ open: true, saving: false, error: false });
    });
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
      const href = anchor.href;
      void requestNavGuardDecision().then((action) => {
        if (action === 'cancel') return;
        window.location.href = href;
      });
    }
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [requestNavGuardDecision]);

  useEffect(() => {
    function onBeforePreparation(e: Event) {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      const to = (e as unknown as { to?: URL | string }).to;
      const href = typeof to === 'string' ? to : (to?.href ?? null);
      void requestNavGuardDecision().then((action) => {
        if (action === 'cancel' || !href) return;
        window.location.href = href;
      });
    }
    document.addEventListener('astro:before-preparation', onBeforePreparation);
    return () => document.removeEventListener('astro:before-preparation', onBeforePreparation);
  }, [requestNavGuardDecision]);

  const resolveNavGuard = useCallback((action: 'save' | 'discard' | 'cancel') => {
    navGuardResolveRef.current?.(action);
    navGuardResolveRef.current = null;
  }, []);

  const handleLeaveWithoutSaving = useCallback(() => {
    // Bug 3: gone immediately — nothing was saved, but the learner/author
    // explicitly chose to discard the warning by picking this option, so
    // the native prompt must not also ask the same question again.
    removeBeforeUnloadGuard();
    setNavGuard({ open: false, saving: false, error: false });
    resolveNavGuard('discard');
  }, [removeBeforeUnloadGuard, resolveNavGuard]);

  const handleSaveAndLeave = useCallback(async () => {
    setNavGuard((g) => ({ ...g, saving: true, error: false }));
    try {
      const value = docRef.current;
      const res = await fetch(`/api/actividades/${activityId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: value.title, level: value.level, blocks: value.blocks }),
      });
      if (!res.ok) throw new Error('save failed');
      // Bug 3: only removed once the save actually succeeded — a FAILED
      // save (the `catch` below) must leave it armed, since the work is
      // still genuinely unsaved and no navigation happens either.
      removeBeforeUnloadGuard();
      setNavGuard({ open: false, saving: false, error: false });
      resolveNavGuard('save');
    } catch {
      setNavGuard((g) => ({ ...g, saving: false, error: true }));
    }
  }, [activityId, removeBeforeUnloadGuard, resolveNavGuard]);

  const handleCancelNavGuard = useCallback(() => {
    setNavGuard((g) => (g.saving ? g : { open: false, saving: false, error: false }));
    resolveNavGuard('cancel');
  }, [resolveNavGuard]);

  /**
   * The `EditorWindowGuard` bridge (PART 6b, `@lib/ui/deskWindow.ts`): the
   * window shell is plain vanilla TS with no React state of its own, so it
   * reads exactly these three functions off `window` to decide whether its
   * own close()/minimize() may navigate away right now. Registered on every
   * mount (never conditionally) — every window OTHER than this editor's own
   * simply never reads this key, so there is nothing to gate here.
   */
  const flushForMinimize = useCallback(async (): Promise<boolean> => {
    try {
      const value = docRef.current;
      const res = await fetch(`/api/actividades/${activityId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: value.title, level: value.level, blocks: value.blocks }),
      });
      if (!res.ok) return false;
      removeBeforeUnloadGuard();
      return true;
    } catch {
      return false;
    }
  }, [activityId, removeBeforeUnloadGuard]);

  const confirmCloseForWindow = useCallback(async (): Promise<'saved' | 'discarded' | 'cancelled'> => {
    const action = await requestNavGuardDecision();
    if (action === 'save') return 'saved';
    if (action === 'discard') return 'discarded';
    return 'cancelled';
  }, [requestNavGuardDecision]);

  useEffect(() => {
    const guard: EditorWindowGuard = {
      isDirty: () => isDirtyRef.current,
      flush: flushForMinimize,
      confirmClose: confirmCloseForWindow,
    };
    (window as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = guard;
    return () => {
      delete (window as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY];
    };
  }, [flushForMinimize, confirmCloseForWindow]);

  // The window title bar's own live title/status (PART 6b) — see
  // `DESK_WINDOW_TITLE_ID`/`DESK_WINDOW_STATUS_ID`'s own doc above for why
  // this is a direct `textContent` write rather than a portal.
  useEffect(() => {
    const el = document.getElementById(DESK_WINDOW_TITLE_ID);
    if (el) el.textContent = title.trim() || t.titleFallback;
  }, [title, t.titleFallback]);

  useEffect(() => {
    const el = document.getElementById(DESK_WINDOW_STATUS_ID);
    if (!el) return;
    if (saveState === 'saving') el.textContent = t.titlebarSaving;
    else if (saveState === 'error') el.textContent = t.errorStatus;
    // 'idle'/'pending'/'saved' all read as the SAME ambient "saved a moment
    // ago" copy here (approved mockup) — the SIDE TOOLBAR's own indicator
    // (`saveLabels` below) is where the finer-grained "unsaved" state still
    // shows, unchanged.
    else el.textContent = t.titlebarSaved;
  }, [saveState, t.titlebarSaving, t.errorStatus, t.titlebarSaved]);

  // The window title bar's own `actions` slot (PART 6b) — resolved once on
  // mount; `DeskWindow.astro` always renders this node (empty) before this
  // island ever hydrates, so it is never missing in practice. `null` only
  // in a test that mounts this island with no `DeskWindow` shell around it.
  const [actionsPortalTarget, setActionsPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setActionsPortalTarget(document.getElementById(DESK_WINDOW_ACTIONS_ID));
  }, []);
  /** "Ver como presentación" icon button's own tooltip id (icon-only pass, 2026-10-07) — same `ICON_TOOLTIP_*` pattern `ReportActivityButton`/`DuplicateActivityButton` already use. */
  const viewAsPresentationTooltipId = useId();

  // The window title bar's own EDITABLE title group slot (PART 6b polish) —
  // same resolve-once-on-mount posture as the actions slot above; `null`
  // for a standalone render with no `DeskWindow` shell (or one whose
  // `titleEditable` prop is unset, e.g. the practice window).
  const [titleGroupPortalTarget, setTitleGroupPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTitleGroupPortalTarget(document.getElementById(DESK_WINDOW_TITLE_GROUP_ID));
  }, []);

  const openSubmitDialog = useCallback(() => {
    setSubmitDialog({ open: true, submitting: false, error: null });
  }, []);

  const closeSubmitDialog = useCallback(() => {
    setSubmitDialog((s) => (s.submitting ? s : { open: false, submitting: false, error: null }));
  }, []);

  // "Ver como presentación" (worksheet zoom tour, sprint week 3): a
  // full-screen overlay presenting the editor's own CURRENT document —
  // `doc.blocks` straight from `history.present`, unsaved changes included,
  // no new route. `PresentationIsland` itself has no idea it is inside an
  // overlay rather than its own page; `onExit` is what tells it to close
  // instead of navigating (see that prop's own header there). Focus
  // restoration on close is THIS component's job (the button that opened
  // it is the one thing the island itself cannot know about) — a plain
  // `document.querySelector` on the button's own `data-testid`, same
  // direct-DOM-focus style `goToBlock`/`handleConfirmSubmit` already use
  // above, rather than a `Button`-forwarded ref (that shared component is a
  // bare function component, not `forwardRef`-wrapped).
  const [showPresentationPreview, setShowPresentationPreview] = useState(false);
  const openPresentationPreview = useCallback(() => setShowPresentationPreview(true), []);
  const closePresentationPreview = useCallback(() => {
    setShowPresentationPreview(false);
    if (typeof document === 'undefined') return;
    document.querySelector<HTMLButtonElement>('[data-testid="view-as-presentation-button"]')?.focus();
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
      toast.success(tCommon.toast.submittedForReview);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'submit_failed';
      const message = t.submitErrors[code as keyof typeof t.submitErrors] ?? t.submitErrors.submit_failed;
      setSubmitDialog((s) => ({ ...s, submitting: false, error: message }));
    }
  }, [activityId, t.submitErrors]);

  const handleWorksheetChosen = useCallback(() => {
    setShowUploader(true);
  }, []);

  // Unlike Worksheet (which needs an upload step first, via `showUploader`),
  // Questions has nothing to upload — the new block is appended immediately,
  // empty, and becomes the sole active one, same accordion rule
  // `handleUploadComplete` follows for its own last-uploaded block.
  const handleQuestionsChosen = useCallback(() => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'quiz',
      payload: { pools: {}, slots: [] },
    };
    changeBlocks([...blocks, newBlock]);
    setAddingBlock(false);
    setExpandedBlockIds(new Set([newBlock.id]));
  }, [blocks, changeBlocks]);

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
    no_image: 'incompleteNoImage',
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

  // The scoped `ScrollToTop`'s target: whichever of these two is the
  // ACTUAL scrolling element for the currently-mounted mode (`preview` and
  // the block list are mutually exclusive, so exactly one of these two refs
  // is ever attached to anything at a time).
  //
  // WRONG-REF BUG, FIXED (nav buttons pass): `previewScrollRef` below is a
  // real, self-contained scroll container — but the non-preview branch's OWN
  // wrapper div (further down) ALSO carries `overflow-y-auto`, and used to
  // be the ref `ScrollToTop` tracked. It is not the element that actually
  // scrolls there: `BlockList.tsx`'s own `<ul>` is `lg:flex-1 lg:min-h-0
  // lg:overflow-y-auto` INSIDE it, so that inner list fills the wrapper's
  // exact height and scrolls internally, while the wrapper itself stays
  // sized to fit (no overflow of its own) in ordinary use. Tracking the
  // wrapper's `scrollTop` therefore near-permanently read `0`, so the
  // button's appear threshold was never crossed — see `ScrollToTop.tsx`'s own
  // header for the other half of the "never appears in the editor" fix.
  // `blockListRef` is threaded through as `BlockList`'s new `listRef` prop
  // instead, straight onto that real `<ul>`.
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const blockListRef = useRef<HTMLUListElement>(null);

  return (
    // Desktop "one-screen" layout, creator polish round 3: ONE framed card
    // (border, rounded, `bg-card`) with real vertical margins from the site
    // header AND the footer.
    //
    // SIZED VIA THE REAL FLEX CHAIN, NOT A HARDCODED CALC (floating side
    // toolbar pass, owner request — "no page-level scroll, remove the empty
    // back-button row"): `[id].astro` now renders `<BaseLayout fullHeight>`,
    // whose `<main>` is a real, bounded `flex-1 min-h-0` at `lg:` (see that
    // layout's own header) — this root is `lg:flex-1 lg:min-h-0` inside the
    // ROW `[id].astro`'s section lays out (this island beside the floating
    // `BackButton`, which top-aligns itself via its own `lg:self-start` —
    // see that section's own comment on the FULL-HEIGHT CARD FIX). This root
    // has NO explicit height of its own, so the row's default cross-axis
    // STRETCH (unlike the old `items-start` the row used to force on every
    // item) is exactly what gives it the row's real `lg:h-full` height end to
    // end — no separate `BackButton` row above it any more, and no
    // pixel-perfect header-height math to keep in sync here). `astro-island`
    // (this component's own wrapper tag) renders as `display: contents`, so the
    // flex chain passes straight through it. `lg:pr-16` reserves room for
    // `EditorSideToolbar`'s `fixed right-3` icon rail (docked position) so
    // it never overlaps the canvas/properties column — unchanged by the
    // toolbar's own floating pass: that reserved space stays put regardless
    // of whether the toolbar is currently docked or floating elsewhere, so
    // undocking it never shifts this layout. Below `lg:` this is
    // intentionally untouched — today's stacked, scrollable layout keeps
    // working; a dedicated mobile layout comes later.
    <div
      data-testid="activity-editor-island"
      // Mobile layout pass: `pb-*` reserves room for `EditorSideToolbar`'s
      // own fixed bottom action bar there (safe-area aware, same pattern as
      // the practice page's sticky Comprobar bar) — cleared entirely at
      // `lg:`, where that component goes back to its original floating
      // rail and `lg:pr-16` (unchanged) reserves ITS docked slot instead.
      className="flex flex-col gap-4 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:min-h-0 lg:flex-1 lg:gap-2 lg:pb-0 lg:pr-16"
    >
      {/* THE card (PART 6b polish, "double framing" fix — owner report:
          "se ve el marco de la ventana y encima el marco de la tarjeta"):
          this used to be its OWN bordered/rounded/`bg-card` surface nested
          inside `DeskWindow`'s identical-looking frame — the WINDOW is the
          frame now, so only the structural flex/scroll classes stay
          (`lg:min-h-0` + `lg:overflow-hidden` are the actual "stays fully
          visible on screen" guarantee); the consistent ~16px inset that
          used to come from this card's own padding now lives on
          `[id].astro`'s own section (one level up), edge to edge at every
          breakpoint. The title/level/status-badge header row that used to
          open this card is GONE too — "Desktop" redesign PART 6b/its own
          polish pass moved the title into `DeskWindow`'s own title bar as
          the window's now-EDITABLE title (a `createPortal`, see
          `DESK_WINDOW_TITLE_GROUP_ID` below), level + the review-status
          badge riding along right after it; "Ver como presentación"/"Enviar
          a revisión" already lived in that same title bar's `actions` slot. */}
      <div
        data-testid="activity-editor-card"
        className="relative flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-hidden"
      >
        {/* "Duplicar y adaptar" credit line (D7) — only ever set for a
            duplicate's own editor; an ordinary activity never renders this. */}
        {/* No horizontal padding of its own any more (PART 6b polish,
            "double framing" fix): the side inset now lives once, on
            `[id].astro`'s own section — this would only double it. */}
        {sourceActivity && (
          <p data-testid="activity-based-on" className="flex-none pt-2 text-xs text-muted-foreground">
            {sourceActivity.href ? (
              <>
                {t.basedOnPrefix}
                <a href={sourceActivity.href} className="text-accent-ink hover:underline">
                  {sourceActivity.title}
                </a>
                {t.basedOnSuffix}
              </>
            ) : (
              <>
                {t.basedOnPrefix}
                {sourceActivity.title}
                {t.basedOnSuffix}
              </>
            )}
          </p>
        )}

        {preview ? (
          <div
            ref={previewScrollRef}
            data-testid="activity-preview"
            // No `lg:px-*` of its own any more (PART 6b polish, "double
            // framing" fix): the ~16px side inset now lives once, on
            // `[id].astro`'s own section — this would only double it.
            className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:py-3"
          >
            {blocks
              // A brand-new worksheet block with no image yet (creator
              // polish round 4, owner feedback #2) has nothing to preview —
              // skipped here entirely rather than crashing `WorksheetPlayer`,
              // which requires a real `image`.
              .filter((b): b is WorksheetBlock & { image: NonNullable<WorksheetBlock['image']> } =>
                b.type === 'worksheet' && b.image !== undefined,
              )
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
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:gap-3 lg:overflow-y-auto lg:py-3">
            <BlockList
              listRef={blockListRef}
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
            {!showAddFlow && (
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

            {showAddFlow && !showUploader && (
              <BlockTypePicker
                lang={lang}
                onSelectWorksheet={handleWorksheetChosen}
                onSelectQuestions={handleQuestionsChosen}
              />
            )}

            {showAddFlow && showUploader && <WorksheetUploader lang={lang} onComplete={handleUploadComplete} />}
          </div>
        )}

        {/* Scoped "back to top" for the card's own scroll container (block
            list or preview, whichever is mounted) — reuses the same island
            `BaseLayout` mounts globally, targeted at the REAL scrolling
            element for whichever mode is active (see `previewScrollRef`'s
            own header above) instead of the window. Positioned inside THIS
            card (the `relative` ancestor above), never the page. Clicking it
            scrolls that container to its top — in the block-list mode, that
            IS the first block, since `BlockList.tsx`'s `<ul>` renders blocks
            in order with nothing else above them. */}
        <ScrollToTop labels={{ scrollToTop: tCommon.scrollToTop }} targetRef={preview ? previewScrollRef : blockListRef} />
      </div>

      {/* Polish pass 2026-10-06 (owner report, `editor-window-1440.png`): the
          "Elige con qué seguir" type picker (`showAddFlow` above, rendered
          while `blocks.length === 0`) has nothing yet for collapse-all/
          expand-all/block-index/undo/redo/preview to act on — the rail used
          to render anyway, floating next to an editor with no content. It
          now only mounts once the activity has at least one block. */}
      {blocks.length > 0 && (
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
      )}

      <UnsavedChangesModal
        open={navGuard.open}
        saving={navGuard.saving}
        error={navGuard.error}
        labels={navGuardLabels}
        onSaveAndLeave={() => void handleSaveAndLeave()}
        onLeaveWithoutSaving={handleLeaveWithoutSaving}
        onCancel={handleCancelNavGuard}
      />

      <SubmitForReviewDialog
        lang={lang}
        open={submitDialog.open}
        submitting={submitDialog.submitting}
        errorMessage={submitDialog.error}
        blocks={blocks}
        onConfirm={() => void handleConfirmSubmit()}
        onCancel={closeSubmitDialog}
      />

      {/* "Ver como presentación" (worksheet zoom tour, sprint week 3): the
          SAME island `presentar.astro` mounts, reused here against the
          CURRENT in-memory draft — `onExit` closes the overlay instead of
          navigating anywhere (no `practiceUrl`/`qrSvg`, neither makes sense
          for an unsaved/unpublished draft). */}
      {showPresentationPreview && (
        <PresentationIsland
          lang={lang}
          title={title}
          level={level}
          blocks={blocks}
          onExit={closePresentationPreview}
        />
      )}

      {/* "Desktop" redesign PART 6b: the window's own title bar `actions`
          slot (ghost "Ver como presentación" + yellow primary "Enviar a
          revisión") — see `DESK_WINDOW_ACTIONS_ID`'s own doc above for why
          this is a portal rather than plain JSX in the header row. */}
      {actionsPortalTarget &&
        createPortal(
          <>
            <button
              type="button"
              data-testid="view-as-presentation-button"
              aria-label={t.viewAsPresentation}
              aria-describedby={viewAsPresentationTooltipId}
              className={ICON_TOOLTIP_TRIGGER_CLASS}
              onClick={openPresentationPreview}
            >
              <MagnifyingGlassPlusIcon aria-hidden="true" size={16} />
              <span role="tooltip" id={viewAsPresentationTooltipId} className={ICON_TOOLTIP_BUBBLE_CLASS}>
                {t.viewAsPresentation}
              </span>
            </button>
            <Button
              type="button"
              size="sm"
              data-testid="submit-for-review-button"
              className="border-pop-yellow bg-pop-yellow text-[#3a2e00] hover:bg-pop-yellow/80"
              onClick={openSubmitDialog}
            >
              {t.submitForReview}
            </Button>
          </>,
          actionsPortalTarget,
        )}

      {/* "Desktop" redesign PART 6b polish: the window's own title bar
          EDITABLE title group — the SAME controlled title `<input>` (value/
          onChange/validation/autosave unchanged, just relocated out of the
          card's own old header row), the level `<select>`, and the
          review-status badge right after it. See `DESK_WINDOW_TITLE_GROUP_ID`'s
          own doc above for why this is a portal. */}
      {titleGroupPortalTarget &&
        createPortal(
          <>
            <label className="flex min-w-0 flex-1 items-center">
              <span className="sr-only">{t.titleLabel}</span>
              <input
                type="text"
                data-testid="activity-title-input"
                aria-label={t.titleLabel}
                value={title}
                onChange={(e) => changeTitle(e.target.value)}
                placeholder={t.titleFallback}
                // Matches the title bar's own static `<b>` typography
                // (`DeskWindow.astro`) when idle — transparent, no border —
                // and only reveals a field-like border on hover/focus, the
                // click/keyboard-focus affordance for "this is editable now".
                className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 font-display text-[19px] font-extrabold tracking-[-0.01em] text-foreground outline-none placeholder:font-semibold placeholder:text-muted-foreground hover:border-border focus-visible:border-border focus-visible:bg-(--color-field) focus-visible:outline-none focus-visible:ring-0"
              />
            </label>
            <label className="flex shrink-0 items-center gap-1 text-sm">
              <span className="sr-only">{t.levelLabel}</span>
              <Select
                data-testid="activity-level-select"
                aria-label={t.levelLabel}
                fieldSize="sm"
                value={level ?? ''}
                onChange={(e) => changeLevel(e.target.value)}
              >
                <option value="">{t.levelNone}</option>
                {LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {levelLabels[lvl]}
                  </option>
                ))}
              </Select>
            </label>
            <div
              className="flex shrink-0 flex-wrap items-center gap-2"
              data-testid="activity-status-badge"
              data-status={status}
            >
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
          </>,
          titleGroupPortalTarget,
        )}
    </div>
  );
}
