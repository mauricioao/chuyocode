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
import { PresentationIcon } from '@phosphor-icons/react/dist/ssr/Presentation';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { LEVELS, isLevel, type Level } from '@/lib/exerciseTaxonomy';
import type { Block, IncompleteBlockInfo, WorksheetBlock } from '@/lib/activities/blocks';
import { imagePreviewUrl, audioPreviewUrl } from '@/lib/activities/paths';
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
import QuizLivePreview from './QuizLivePreview';
import EditorSideToolbar from './EditorSideToolbar';
import UnsavedChangesModal from './UnsavedChangesModal';
import SubmitForReviewDialog from './SubmitForReviewDialog';
import PresentationIsland from './PresentationIsland';
import { EDITOR_WINDOW_GUARD_KEY, type EditorWindowGuard } from '@/lib/ui/deskWindow';
import { ICON_TOOLTIP_BUBBLE_CLASS, ICON_TOOLTIP_TRIGGER_CLASS } from '@/lib/ui/iconTooltip';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useHydrated } from '@/hooks/useHydrated';

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
const resolveAudioUrl = audioPreviewUrl;

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent ?? '');
}

/** `sessionStorage` key for the one active block remembered per activity (owner decision 2026-10-07, "Barra fina debajo"). */
function activeBlockStorageKey(activityId: string): string {
  return `chuyocode:editor-active-block:${activityId}`;
}

/**
 * The active block to open on mount: the URL's own `#block-<id>` hash (the
 * sheet-switcher popover's deep link) wins first, then the last block
 * remembered for THIS activity in `sessionStorage`, falling back to the
 * first block. `null` for a brand-new, zero-block activity — nothing to
 * activate yet (see `showAddFlow`).
 */
function readInitialActiveBlockId(activityId: string, blocks: Block[]): string | null {
  if (blocks.length === 0) return null;
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const hashBlockId = hash.startsWith('#block-') ? hash.slice('#block-'.length) : null;
  if (hashBlockId && blocks.some((b) => b.id === hashBlockId)) return hashBlockId;
  try {
    const stored = sessionStorage.getItem(activeBlockStorageKey(activityId));
    if (stored && blocks.some((b) => b.id === stored)) return stored;
  } catch {
    // Private window / blocked storage — fall through to the first block.
  }
  return blocks[0].id;
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
  // One active block at a time (owner decision 2026-10-07, "Barra fina
  // debajo" — replaces the earlier accordion). On first mount this reads,
  // in order: the URL's own `#block-<id>` hash (the sheet-switcher
  // popover's deep link), then the LAST active block remembered for THIS
  // activity in `sessionStorage` (so resuming mid-edit lands back where the
  // author left off), falling back to the first block. A brand-new,
  // zero-block activity has nothing to activate — its empty state (the
  // type picker/uploader) is already unconditionally open via `showAddFlow`
  // below.
  const [activeBlockId, setActiveBlockIdState] = useState<string | null>(() =>
    readInitialActiveBlockId(activityId, initialBlocks),
  );
  const setActiveBlockId = useCallback((blockId: string) => setActiveBlockIdState(blockId), []);
  // Persists the active block per activity (`sessionStorage`, best-effort —
  // a private window or blocked storage must never crash the editor).
  useEffect(() => {
    if (!activeBlockId) return;
    try {
      sessionStorage.setItem(activeBlockStorageKey(activityId), activeBlockId);
    } catch {
      // Best-effort only — the in-memory state is still correct.
    }
  }, [activityId, activeBlockId]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  // Empty activity (creator polish round 4, owner feedback #3): the add-flow
  // (picker, then the worksheet uploader) is open while there are zero
  // blocks — no separate "+" click needed first, matching `BlockList.tsx`'s
  // own "Elige con qué seguir" empty-state heading right above it in the
  // same scroll column. ONE BLOCK PER ACTIVITY (one-sheet redesign, owner
  // spec 2026-10-08): this is also now the ONLY way this flow ever opens —
  // there is no more "+ Agregar bloque" trigger once a block exists.
  const showAddFlow = blocks.length === 0;

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

  // The sheet-switcher popover (`EditorSideToolbar.tsx`'s own
  // `BlockIndexPopover`, formerly the "block index") — jumps straight to a
  // chosen block by making it the sole active one. No scroll needed any
  // more: the body always shows exactly the active block, full-bleed.

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

  // The window title bar's own live title (PART 6b) — see
  // `DESK_WINDOW_TITLE_ID`'s own doc above for why this is a direct
  // `textContent` write rather than a portal. The title bar's own muted
  // autosave status span is GONE (owner report: redundant with the side
  // toolbar's own save-status icon, which is now the ONE save indicator —
  // see `SaveStatusIndicator.tsx`); `[id].astro` no longer passes `status`/
  // `statusId` to `DeskWindow`, so there is nothing left here to sync.
  useEffect(() => {
    const el = document.getElementById(DESK_WINDOW_TITLE_ID);
    if (el) el.textContent = title.trim() || t.titleFallback;
  }, [title, t.titleFallback]);

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
  /**
   * Mobile title bar "⋯" menu (owner report: on a 390px phone the title bar
   * wrapped into three rows and the title truncated to "Hoj…") — see
   * `t.mobileMenuLabel`'s own doc. `useIsDesktop`/`useHydrated` pair exactly
   * like `WorksheetZoneEditor`'s own desktop-overlay/mobile-sheet split and
   * `EditorSideToolbar`'s own desktop-rail/mobile-bar split (see either
   * hook's own header): this is a real STRUCTURAL branch — the level
   * select/status badge/"Ver como presentación"/"Enviar a revisión" each
   * render in a DIFFERENT portal slot (or a different position within one)
   * depending on which side of the breakpoint wins, not just a CSS show/hide
   * of the same markup. `lg:` (1024px) is deliberately the SAME breakpoint
   * the rest of the editor's mobile layout already uses — not `sm:`/`desk:`
   * (used elsewhere, for unrelated windows) — so the whole editor flips from
   * mobile to desktop at one single width.
   */
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();
  const mobileMenuTooltipId = useId();

  // The window title bar's own EDITABLE title group slot (PART 6b polish) —
  // same resolve-once-on-mount posture as the actions slot above; `null`
  // for a standalone render with no `DeskWindow` shell (or one whose
  // `titleEditable` prop is unset, e.g. the practice window).
  const [titleGroupPortalTarget, setTitleGroupPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTitleGroupPortalTarget(document.getElementById(DESK_WINDOW_TITLE_GROUP_ID));
  }, []);

  // One-sheet redesign: the floating side toolbar's own worksheet-tools
  // slot (`EditorSideToolbar.tsx`'s `onWorksheetToolsSlotReady`) — threaded
  // down to `BlockList.tsx` as `sideToolsPortalTarget`, same ref-callback
  // pattern as the portal targets above.
  const [worksheetToolsSlot, setWorksheetToolsSlot] = useState<HTMLDivElement | null>(null);

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
  // direct-DOM-focus style `handleConfirmSubmit` already uses above, rather
  // than a `Button`-forwarded ref (that shared component is a
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
          // #1) — close the dialog, activate/select that block/zone, and
          // let `BlockList`/`WorksheetZoneEditor` show a short inline
          // message there. No scroll needed any more: the body always
          // shows exactly the active block, full-bleed.
          const { blockId, reason } = errBody;
          const zoneId = errBody.zoneId ?? null;
          setSubmitDialog({ open: false, submitting: false, error: null });
          setActiveBlockId(blockId);
          setSelectedZoneId(zoneId);
          setIncompleteTarget({
            blockId,
            zoneId,
            reason: reason as IncompleteBlockInfo['reason'],
          });
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
  }, [activityId, t.submitErrors, setActiveBlockId]);

  const handleWorksheetChosen = useCallback(() => {
    setShowUploader(true);
  }, []);

  // Unlike Worksheet (which needs an upload step first, via `showUploader`),
  // Questions has nothing to upload — the new block is appended immediately,
  // empty, and becomes the sole active one. ONE BLOCK PER ACTIVITY (one-sheet
  // redesign): `showAddFlow` only ever opens while `blocks.length === 0`, so
  // this always creates the activity's ONE AND ONLY block.
  const handleQuestionsChosen = useCallback(() => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'quiz',
      payload: { pools: {}, slots: [] },
    };
    changeBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
  }, [blocks, changeBlocks, setActiveBlockId]);

  // "Une las parejas" (start-gallery redesign, build item 4): same shape as
  // Questions above — appended immediately, empty, no upload step — just
  // tagged with the `'match'` template (`blocks.ts`'s `QuizTemplate`) so the
  // practice side opens straight into Parejas once there is enough content.
  const handleMatchChosen = useCallback(() => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'quiz',
      payload: { pools: {}, slots: [] },
      template: 'match',
    };
    changeBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
  }, [blocks, changeBlocks, setActiveBlockId]);

  // "Reordenar" (Wordwall templates build): same shape as Match above, just
  // tagged with the `'reorder'` template.
  const handleReorderChosen = useCallback(() => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'quiz',
      payload: { pools: {}, slots: [] },
      template: 'reorder',
    };
    changeBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
  }, [blocks, changeBlocks, setActiveBlockId]);

  // "Completar la frase" (cloze): same shape as Reorder above, just tagged
  // with the `'cloze'` template.
  const handleClozeChosen = useCallback(() => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'quiz',
      payload: { pools: {}, slots: [] },
      template: 'cloze',
    };
    changeBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
  }, [blocks, changeBlocks, setActiveBlockId]);

  // "Ordenar por grupos" (groupsort): same shape as Cloze above, just tagged
  // with the `'groupsort'` template.
  const handleGroupSortChosen = useCallback(() => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type: 'quiz',
      payload: { pools: {}, slots: [] },
      template: 'groupsort',
    };
    changeBlocks([...blocks, newBlock]);
    setActiveBlockId(newBlock.id);
  }, [blocks, changeBlocks, setActiveBlockId]);

  const handleUploadComplete = useCallback(
    (images: UploadedImage[]) => {
      // `WorksheetUploader` always hands back exactly ONE image now —
      // several dropped files/PDF pages are stitched into one sheet
      // client-side before upload (`sheetStitcher.ts`), which is also what
      // keeps this the activity's ONE AND ONLY block (see
      // `handleQuestionsChosen`'s own header). Any defensive extra is
      // simply ignored rather than spawning a second block.
      const [image] = images;
      if (!image) return;
      const newBlock: WorksheetBlock = { id: crypto.randomUUID(), type: 'worksheet', rotation: 0, image, zones: [] };
      changeBlocks([...blocks, newBlock]);
      setShowUploader(false);
      setActiveBlockId(newBlock.id);
    },
    [blocks, changeBlocks, setActiveBlockId],
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

  // The scoped `ScrollToTop`'s target — PREVIEW ONLY now (owner decision
  // 2026-10-07, "Barra fina debajo"): the editor body shows exactly the one
  // active block, full-bleed, with no outer list to scroll past any more —
  // `WorksheetZoneEditor`'s canvas pans internally and `QuizBlockEditor`'s
  // own columns scroll internally, so there is nothing left for a "scroll
  // to top" button to do there. Preview mode still lists every worksheet
  // block in sequence, so it keeps this unchanged.
  const previewScrollRef = useRef<HTMLDivElement>(null);

  // The level select, exactly as it renders on desktop today (byte-identical
  // markup/testid) — inline in the title bar's own editable title group,
  // right after the title input. See `isDesktop`/`hydrated`'s own header
  // above for why this (and the two variables below) is a real structural
  // branch, not a CSS media query.
  //
  // TITLE BAR ORDER (owner spec, build item 3 — "arriba ordena primero
  // 'Nivel | íconos | botón de enviar'"): the review-status badge used to
  // ride along right after the level select here, inside this very group —
  // moved OUT (see `statusPill` below) so desktop's title bar now reads
  // exactly title | Nivel | [icon actions | Enviar a revisión] (the actions
  // portal, `DESK_WINDOW_ACTIONS_ID`), with nothing competing for that row
  // in between.
  const desktopLevelAndStatus = (
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
  );

  /** One coloured dot per `activities.status` (build item 3's own floating pill) — same `bg-pop-*` tokens the window's own traffic lights use, so a glance at the corner reads consistently with the rest of the chrome. `draft` (and any unrecognized status) gets a neutral muted dot. */
  const STATUS_DOT_CLASS: Record<string, string> = {
    pending_review: 'bg-pop-yellow',
    live: 'bg-pop-green',
    rejected: 'bg-pop-red',
  };

  /**
   * The review-status badge, relocated (build item 3, owner spec: "lo de
   * 'Publicada' colócalo flotando en la parte inferior izquierda que no se
   * usa") out of the title bar into a small floating pill, glass/subtle,
   * anchored to the bottom-left corner of the editor's own work area
   * (`activity-editor-card`, already `position: relative`) — an area the
   * owner confirmed is otherwise empty. `pointer-events-none` + never
   * stretched: it can never intercept a click meant for the canvas beneath
   * it, nor cover real content. Desktop only (`lg:`, gated the same
   * `hydrated`/`isDesktop` way as every other structural branch in this
   * component) — phones keep the SAME testid/markup inside their own "⋯"
   * menu instead (`mobileMenu` below), unchanged.
   */
  // A template editor's authoring sheet (`TemplateEditorKit.tsx`) fills the
  // work area's whole left side, edge to edge with no window inset, so the
  // pill moves INTO the sheet's own bottom-left corner — aligned with its
  // content edge (16px margin + 20px padding) and level with the stage's
  // floating Comprobar on the right — instead of straddling the sheet's edge.
  const activeBlock = blocks.find((b) => b.id === activeBlockId) ?? blocks[0];
  const onTemplateCanvas = !preview && !showAddFlow && activeBlock?.type === 'quiz' && Boolean(activeBlock.template);

  const statusPill = (
    <div
      data-testid="activity-status-badge"
      data-status={status}
      className={`pointer-events-none absolute z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground shadow-elevation-1 backdrop-blur-sm ${onTemplateCanvas ? 'bottom-8 left-9' : 'bottom-3 left-3'}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 flex-none rounded-full ${STATUS_DOT_CLASS[status] ?? 'bg-muted-foreground'}`}
      />
      <span className="truncate">
        {STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS]
          ? t[STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS]]
          : t.statusDraft}
      </span>
      {status === 'rejected' && initialReviewNote && (
        <span data-testid="activity-review-note" className="truncate text-muted-foreground">
          {t.reviewNoteLabel}: {initialReviewNote}
        </span>
      )}
    </div>
  );

  // "Ver como presentación" + "Enviar a revisión", exactly as they render on
  // desktop today — ghost icon button + tooltip, yellow primary button —
  // portaled into the title bar's own far-right `actions` slot.
  const desktopActions = (
    <>
      <button
        type="button"
        data-testid="view-as-presentation-button"
        aria-label={t.viewAsPresentation}
        aria-describedby={viewAsPresentationTooltipId}
        className={ICON_TOOLTIP_TRIGGER_CLASS}
        onClick={openPresentationPreview}
      >
        <PresentationIcon aria-hidden="true" size={16} />
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
    </>
  );

  /**
   * Mobile title bar "⋯" menu (bug fix — owner report: on a 390px phone the
   * title bar wrapped into three rows and the title truncated to "Hoj…").
   * ONE compact row on a phone: traffic lights, the title (gets the
   * remaining width, still editable), and this single trigger — holding the
   * level select, the review-status badge, "Ver como presentación" AND
   * "Enviar a revisión". A pure checkbox + `<label>` CSS-only disclosure, NO
   * JS required for the show/hide itself — same pattern (and the same
   * no-JS-first posture) as the PRACTICE window's own "Más" overflow menu
   * (`global.css`'s `[data-desk-window-more]`, `[id].astro`'s own header),
   * just at `lg:` instead of `desk:` (see `isDesktop`'s own doc above for
   * why) and under a different attribute name (`data-desk-window-editor-more`)
   * so the two unrelated features never collide.
   *
   * JUDGMENT CALL: the bug report explicitly leaves "Enviar a revisión" as
   * either a kept compact button OR folded into this menu. It is folded in
   * here — keeping ANY second control beside the title (even a short
   * "Enviar" label) still competes with it for the row's width, which is
   * exactly the regression being fixed; "Enviar a revisión" is also a
   * once-in-a-while action (done at specific milestones, not every editing
   * session), so one tap into a clearly-labeled menu costs little. Both
   * actions keep their exact desktop testids/behaviour here (`onClick`
   * handlers unchanged) — only WHERE they render differs.
   */
  const mobileMenu = (
    <div className="relative" data-desk-window-editor-more>
      <input
        type="checkbox"
        id="desk-window-editor-more-toggle"
        className="peer sr-only"
        aria-label={t.mobileMenuLabel}
        aria-controls="desk-window-editor-more-content"
      />
      <label
        htmlFor="desk-window-editor-more-toggle"
        data-testid="activity-mobile-menu-trigger"
        className={`${ICON_TOOLTIP_TRIGGER_CLASS} cursor-pointer peer-focus-visible:outline-none peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50`}
      >
        <DotsThreeIcon aria-hidden="true" size={18} weight="bold" />
        <span role="tooltip" id={mobileMenuTooltipId} className={ICON_TOOLTIP_BUBBLE_CLASS}>
          {t.mobileMenuLabel}
        </span>
      </label>
      <div
        id="desk-window-editor-more-content"
        data-testid="activity-mobile-menu-content"
        // `z-30`: the worksheet canvas's own floating zoom pill/properties
        // overlay sit at `z-20` (`WorksheetZoneEditor.tsx`) — verified by
        // screenshot to otherwise paint OVER this menu, since both are
        // `position: absolute`. One rung above clears every canvas-level
        // overlay, while staying below the body-portaled side toolbar
        // (`z-[60]`) and any modal (`z-40`/`z-50`), neither of which is ever
        // open at the same time as this menu.
        className="hidden absolute right-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 rounded-lg border border-border bg-background p-2 shadow-elevation-2 peer-checked:flex"
      >
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{t.levelLabel}</span>
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
        <button
          type="button"
          data-testid="view-as-presentation-button"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          onClick={openPresentationPreview}
        >
          <PresentationIcon aria-hidden="true" size={16} />
          {t.viewAsPresentation}
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
      </div>
    </div>
  );

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
    // flex chain passes straight through it. `EditorSideToolbar`'s own
    // `fixed`/docked icon rail used to need an `lg:pr-16` gutter reserved
    // here so it never overlapped the canvas — CANVAS EVERYWHERE (owner
    // report: a white/grey strip ran down that reserved column): removed.
    // The dotted canvas now fills the window's full body edge to edge, and
    // the docked rail simply FLOATS OVER it (it is already `fixed`/
    // `z-[60]`, portaled to `document.body` — overlapping content beneath
    // it is the point, not a layout bug). Below `lg:` this is intentionally
    // untouched — today's stacked, scrollable layout keeps working; a
    // dedicated mobile layout comes later.
    <div
      data-testid="activity-editor-island"
      // Mobile layout pass: `pb-*` reserves room for `EditorSideToolbar`'s
      // own fixed bottom action bar there (safe-area aware, same pattern as
      // the practice page's sticky Comprobar bar) — cleared entirely at
      // `lg:`, where that component goes back to its own floating rail,
      // which no longer reserves a side gutter (see above).
      className="flex flex-col gap-4 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:min-h-0 lg:flex-1 lg:gap-2 lg:pb-0"
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
        className="relative flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-clip"
      >
        {/* Floating status pill (build item 3) — see `statusPill`'s own
            header above for why this lives here, desktop-only, rather than
            in the title bar. Hydration-gated the same way as every other
            structural desktop/mobile branch in this component: phones never
            mount this at all (their status stays inside `mobileMenu`'s own
            copy, unaffected). */}
        {hydrated && isDesktop && statusPill}

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
            {/* IMMEDIATE PREVIEW (owner spec, build item 2: "para los demás
                modelos no se ve el preview hasta que se envía a revisión y
                se aprueba, esto no debe ser así, debe ser inmediato"): every
                block type renders straight from the in-memory draft here —
                a worksheet as `WorksheetPlayer` (unchanged), a quiz block as
                the SAME real `QuizLivePreview` the per-block editor column
                already mounts (`QuizBlockEditor.tsx`) — a template plays as
                its own big game, Básico as its ordinary practice, exactly
                as a learner will see it once published. Never filtered out
                any more; only a worksheet with no image yet (an
                in-progress upload) has nothing to show. */}
            {blocks.map((block) => {
              if (block.type === 'worksheet') {
                // A brand-new worksheet block with no image yet (creator
                // polish round 4, owner feedback #2) has nothing to preview
                // — skipped rather than crashing `WorksheetPlayer`, which
                // requires a real `image`.
                if (!block.image) return null;
                return (
                  <WorksheetPlayer
                    key={block.id}
                    lang={lang}
                    image={block.image}
                    zones={block.zones}
                    rotation={block.rotation}
                    imageUrl={resolveImageUrl(block.image.path)}
                    audio={block.audio}
                    resolveAudioUrl={resolveAudioUrl}
                  />
                );
              }
              return (
                <QuizLivePreview
                  key={block.id}
                  blockId={block.id}
                  lang={lang}
                  payload={block.payload}
                  template={block.template}
                />
              );
            })}
          </div>
        ) : showAddFlow ? (
          // The add-block flow (picker, then the worksheet uploader) —
          // temporarily replaces the active sheet entirely rather than
          // stacking below it (owner decision 2026-10-07, "Barra fina
          // debajo": there is no more scrollable list for it to sit under).
          // Consistent inner padding (`p-3`) so nothing touches the card
          // edges; scrolls on its own if the picker/uploader ever overflows.
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            {/* Zero-block activity: `BlockList` itself renders the "Elige
                con qué seguir" heading right above this same picker — but
                only while the picker is actually still showing. Once the
                worksheet card has been chosen and the uploader's own drop
                zone is up (`showUploader`), that heading no longer applies
                to anything on screen, so `BlockList` (and its heading) is
                skipped entirely here. */}
            {!showUploader && (
              <BlockList
                lang={lang}
                blocks={blocks}
                activeBlockId={activeBlockId}
                selectedZoneId={selectedZoneId}
                resolveImageUrl={resolveImageUrl}
                resolveAudioUrl={resolveAudioUrl}
                onSetActiveBlock={setActiveBlockId}
                onSelectZone={setSelectedZoneId}
                onBlocksChange={changeBlocks}
                incompleteBlockId={incompleteTarget?.blockId ?? null}
                incompleteZoneId={incompleteTarget?.zoneId ?? null}
                incompleteMessage={incompleteMessage}
                sideToolsPortalTarget={worksheetToolsSlot}
              />
            )}

            {!showUploader && (
              <BlockTypePicker
                lang={lang}
                onSelectWorksheet={handleWorksheetChosen}
                onSelectQuestions={handleQuestionsChosen}
                onSelectMatch={handleMatchChosen}
                onSelectReorder={handleReorderChosen}
                onSelectCloze={handleClozeChosen}
                onSelectGroupSort={handleGroupSortChosen}
              />
            )}

            {/* CANVAS EVERYWHERE (owner spec): the dotted canvas pattern
                also fills this first-ever upload's own drop/loading area,
                same as a worksheet block's empty state in `BlockList.tsx`,
                so it reads as "the place to drop" before any block exists
                yet. */}
            {showUploader && (
              <div className="canvas-dots relative flex min-h-80 flex-1 flex-col overflow-hidden rounded-lg bg-muted">
                <WorksheetUploader lang={lang} onComplete={handleUploadComplete} />
              </div>
            )}
          </div>
        ) : (
          // The active block's own editor, edge to edge — no margins, no
          // card border (owner decision 2026-10-07, "Barra fina debajo").
          <BlockList
            lang={lang}
            blocks={blocks}
            activeBlockId={activeBlockId}
            selectedZoneId={selectedZoneId}
            resolveImageUrl={resolveImageUrl}
            resolveAudioUrl={resolveAudioUrl}
            onSetActiveBlock={setActiveBlockId}
            onSelectZone={setSelectedZoneId}
            onBlocksChange={changeBlocks}
            incompleteBlockId={incompleteTarget?.blockId ?? null}
            incompleteZoneId={incompleteTarget?.zoneId ?? null}
            incompleteMessage={incompleteMessage}
            sideToolsPortalTarget={worksheetToolsSlot}
          />
        )}

        {/* Scoped "back to top" — PREVIEW ONLY (see `previewScrollRef`'s own
            header above); only mounted while preview is, so it never floats
            over the add-flow or the full-bleed active block either. */}
        {preview && <ScrollToTop labels={{ scrollToTop: tCommon.scrollToTop }} targetRef={previewScrollRef} />}
      </div>

      {/* Polish pass 2026-10-06 (owner report, `editor-window-1440.png`): the
          "Elige con qué seguir" type picker (`showAddFlow` above, rendered
          while `blocks.length === 0`) has nothing yet for the sheet
          switcher/undo/redo/preview to act on — the rail used to render
          anyway, floating next to an editor with no content. It now only
          mounts once the activity has at least one block. */}
      {blocks.length > 0 && (
        <EditorSideToolbar
          lang={lang}
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
          onWorksheetToolsSlotReady={setWorksheetToolsSlot}
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
          this is a portal rather than plain JSX in the header row. Mobile
          bug fix: below `lg:` those same two actions move into the title
          group's own "⋯" menu instead (see `mobileMenu`'s own header) — this
          slot renders nothing there. `hydrated ? … : …` is the same
          "no layout flash" SSR split `WorksheetZoneEditor`/`EditorSideToolbar`
          already use (see `isDesktop`'s own doc above). */}
      {actionsPortalTarget &&
        createPortal(
          hydrated ? (
            isDesktop ? (
              desktopActions
            ) : null
          ) : (
            <div className="hidden lg:contents">{desktopActions}</div>
          ),
          actionsPortalTarget,
        )}

      {/* "Desktop" redesign PART 6b polish: the window's own title bar
          EDITABLE title group — the SAME controlled title `<input>` (value/
          onChange/validation/autosave unchanged, just relocated out of the
          card's own old header row). See `DESK_WINDOW_TITLE_GROUP_ID`'s own
          doc above for why this is a portal. Mobile bug fix: the level
          select/status badge (desktop) collapse into the "⋯" menu (mobile)
          right after the title input — see `desktopLevelAndStatus`/
          `mobileMenu`'s own headers above. */}
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
            {hydrated ? (
              isDesktop ? (
                desktopLevelAndStatus
              ) : (
                mobileMenu
              )
            ) : (
              <>
                <div className="hidden lg:contents">{desktopLevelAndStatus}</div>
                <div className="contents lg:hidden" inert>
                  {mobileMenu}
                </div>
              </>
            )}
          </>,
          titleGroupPortalTarget,
        )}
    </div>
  );
}
