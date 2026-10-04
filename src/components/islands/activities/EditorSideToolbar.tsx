/**
 * EditorSideToolbar — the editor's icon rail (creator polish round 2, owner
 * request #7; FLOATING in the "floating side toolbar" pass). Everything
 * that used to sit scattered across the top bar (preview toggle, save
 * button, save status) plus the new block-navigation/collapse controls and
 * undo/redo now live here, keeping the top bar down to just title + level
 * (owner request #1).
 *
 * Every button is icon-only with an accessible `aria-label` (also its
 * `title`, so a mouse user gets a native tooltip for free) — no icon here
 * needs a visible text caption, matching `SaveStatusIndicator`'s own
 * icon-only posture.
 *
 * FLOATING (this pass): a `docked` boolean plus an `{ x, y }` `position`
 * (meaningful only while undocked) drive the rail's own placement. DOCKED —
 * the default, and every existing caller's prior behavior — renders the
 * ORIGINAL fixed/centered/right-aligned classes unchanged, no inline style,
 * no measurement, no localStorage read even attempted. Only dragging the
 * handle (or a keyboard nudge) actually undocks it; from then on the rail is
 * `fixed` at an explicit `{ left, top }` inline style, clamped by
 * `src/lib/activities/toolbarPosition.ts` (pure, unit-tested there) to stay
 * fully within the visible area BETWEEN the site header and footer — this
 * component only measures the real `<header>`/`<footer>` elements and the
 * rail's own box, then hands plain numbers to that module.
 *
 * PERSISTENCE: `{ docked, x, y }` in `localStorage`, wrapped in try/catch on
 * every read AND write (a private window, blocked storage, or a corrupted
 * value must never crash the editor) — invalid/missing data is read back as
 * the DOCKED default via `parsePersistedToolbarState`. The very first
 * write-effect run (right after the read-effect's own initial hydration) is
 * skipped so a not-yet-hydrated default state can never clobber a real
 * persisted value with a redundant write.
 *
 * NO LAYOUT SHIFT ON UNDOCK: `ActivityEditorIsland.tsx`'s own root still
 * reserves `lg:pr-16` unconditionally (this component's docked slot's own
 * width) regardless of whether THIS component is currently docked there or
 * floating anywhere else — see that component's own header.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowsInIcon } from '@phosphor-icons/react/dist/ssr/ArrowsIn';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/ssr/ArrowsOut';
import { ListBulletsIcon } from '@phosphor-icons/react/dist/ssr/ListBullets';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { EyeIcon } from '@phosphor-icons/react/dist/ssr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/ssr/EyeSlash';
import { ArrowUUpLeftIcon } from '@phosphor-icons/react/dist/ssr/ArrowUUpLeft';
import { ArrowUUpRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowUUpRight';
import { KeyboardIcon } from '@phosphor-icons/react/dist/ssr/Keyboard';
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/ssr/FloppyDisk';
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/ssr/DotsSixVertical';
import { PushPinIcon } from '@phosphor-icons/react/dist/ssr/PushPin';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block } from '@/lib/activities/blocks';
import type { AutosaveStatus } from '@/lib/activities/autosave';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useHydrated } from '@/hooks/useHydrated';
import {
  clampToolbarPosition,
  dockTargetPosition,
  keyboardStep,
  parsePersistedToolbarState,
  shouldSnapToDock,
  type Bounds,
  type Point,
  type ToolbarSize,
} from '@/lib/activities/toolbarPosition';
import { blockDisplayName } from './BlockList';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SaveStatusIndicator, { type SaveStatusLabels } from './SaveStatusIndicator';

/** `localStorage` key — one fixed key is enough (per-BROWSER, not per-activity — see the file header). */
const STORAGE_KEY = 'chuyocode:editor-side-toolbar';

/** The ghost dock target's own rendered size (`h-8 w-8`, 2rem). */
const DOCK_TARGET_SIZE = 32;

/**
 * The visible area the floating rail (and the ghost dock target) may occupy
 * — between the real `<header>`/`<footer>` elements' own edges, full window
 * width. Only ever called client-side (inside an effect or an event
 * handler, never during the render body while `docked` could still be the
 * server-matching default) — `document`/`window` don't exist during SSR,
 * and the guard below is defensive insurance on top of that, not the only
 * thing preventing an SSR crash.
 */
function measureBounds(): Bounds {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  return {
    left: 0,
    right: window.innerWidth,
    top: header?.getBoundingClientRect().bottom ?? 0,
    bottom: footer?.getBoundingClientRect().top ?? window.innerHeight,
  };
}

/** The rail's own current rendered size, or `{0,0}` before it has ever mounted. */
function measureSize(el: HTMLElement | null): ToolbarSize {
  if (!el) return { width: 0, height: 0 };
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export interface EditorSideToolbarProps {
  lang: Lang;
  blocks: Block[];
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onGoToBlock: (blockId: string) => void;
  onAddBlock: () => void;
  preview: boolean;
  onTogglePreview: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  saveState: AutosaveStatus | 'idle';
  saveLabels: SaveStatusLabels;
}

/** A single icon button in the rail — factored out so every entry gets the same shape/spacing. */
function ToolbarIconButton({
  label,
  testId,
  disabled,
  loading,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  /** Shows the shared `Button`'s own spinner in place of the icon — the manual save button's own in-flight state (coherent loading states, item 3). Every other toolbar icon leaves this unset. */
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** The block-index popover: lists every block's display name, click to go to it. */
function BlockIndexPopover({
  lang,
  blocks,
  onGoToBlock,
  /** Mobile layout pass: the bottom action bar opens this UPWARD (above the trigger) instead of sideways — a `right-full` popover from a bottom-edge bar would run off the left/bottom of a narrow screen. */
  openUpward = false,
}: {
  lang: Lang;
  blocks: Block[];
  onGoToBlock: (blockId: string) => void;
  openUpward?: boolean;
}) {
  const t = UI_LABELS[lang].activities.editor;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className="relative">
      <ToolbarIconButton label={t.blockIndex} testId="block-index-trigger" onClick={() => setOpen((v) => !v)}>
        <ListBulletsIcon aria-hidden="true" />
      </ToolbarIconButton>
      {open && (
        <div
          data-testid="block-index-popover"
          role="menu"
          className={
            openUpward
              ? 'absolute bottom-full left-0 mb-2 w-56 rounded-md border border-border bg-popover p-2 shadow-lg'
              : 'absolute right-full top-0 mr-2 w-56 rounded-md border border-border bg-popover p-2 shadow-lg'
          }
        >
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t.blockIndexTitle}</p>
          {blocks.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t.blocksEmpty}</p>
          ) : (
            <ul className="flex flex-col">
              {blocks.map((block, index) => (
                <li key={block.id}>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`block-index-item-${block.id}`}
                    onClick={() => {
                      onGoToBlock(block.id);
                      close();
                    }}
                    className="w-full truncate rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {blockDisplayName(block, index, t.blockDefaultNamePrefix)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The keyboard-shortcuts help dialog (owner request #7). */
function ShortcutsDialog({ lang }: { lang: Lang }) {
  const t = UI_LABELS[lang].activities.editor;
  const [open, setOpen] = useState(false);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent ?? '');
  const mod = mac ? '⌘' : 'Ctrl';

  const shortcuts: Array<[string, string]> = [
    [t.shortcutUndo, `${mod}+Z`],
    [t.shortcutRedo, `${mod}+Shift+Z`],
    [t.shortcutSave, `${mod}+S`],
    [t.shortcutEscape, 'Esc'],
    [t.shortcutZoomIn, '+'],
    [t.shortcutZoomOut, '-'],
    [t.shortcutNewZone, 'Enter / N'],
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ToolbarIconButton label={t.shortcutsHelp} testId="shortcuts-trigger" onClick={() => setOpen(true)}>
        <KeyboardIcon aria-hidden="true" />
      </ToolbarIconButton>
      <DialogContent data-testid="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>{t.shortcutsTitle}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {shortcuts.map(([label, keys]) => (
            <li key={label} className="flex items-center justify-between gap-4">
              <span className="text-foreground">{label}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export default function EditorSideToolbar({
  lang,
  blocks,
  onCollapseAll,
  onExpandAll,
  onGoToBlock,
  onAddBlock,
  preview,
  onTogglePreview,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  saveDisabled,
  saveState,
  saveLabels,
}: EditorSideToolbarProps) {
  const t = UI_LABELS[lang].activities.editor;

  // Mobile layout pass: below `lg`, this whole component renders as a
  // compact, ALWAYS-DOCKED bottom action bar instead — see the early
  // return below. Undocking/floating (everything from here through
  // `handleKeyDown`) stays desktop-only, per the mobile layout brief; none
  // of those hooks ever fire on mobile since the drag handle that would
  // trigger them is not rendered there, so leaving them mounted (React
  // hooks cannot be called conditionally) is inert, not just harmless.
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();

  const railRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const [docked, setDocked] = useState(true);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // The rail's OWN size, measured once on mount (it never changes — a fixed
  // icon rail's own content never resizes itself) — only needed to position
  // the ghost dock target during render; every drag/keyboard handler below
  // re-measures live instead, on demand.
  const [railSize, setRailSize] = useState<ToolbarSize>({ width: 0, height: 0 });

  type DragState = { startClientX: number; startClientY: number; startPosition: Point; pointerId: number; preDrag: { docked: boolean; position: Point } };
  const dragRef = useRef<DragState | null>(null);
  // The latest CLAMPED candidate from an in-flight drag — read by pointerup
  // instead of the (possibly not-yet-re-rendered) `position` state, so the
  // drag never commits a stale position.
  const latestDragPositionRef = useRef<Point>({ x: 0, y: 0 });

  // Mount-only: measure the rail's own size once, and hydrate `docked`/
  // `position` from `localStorage` (wrapped in try/catch — a private
  // window, blocked storage, or corrupted JSON must never crash the
  // editor; anything invalid/missing reads back as the DOCKED default via
  // `parsePersistedToolbarState`, so `docked`/`position`'s own `useState`
  // defaults above already ARE that fallback). `useLayoutEffect` so an
  // undocked restore applies before the first paint, not after a visible
  // docked flash.
  useLayoutEffect(() => {
    const size = measureSize(railRef.current);
    setRailSize(size);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const restored = parsePersistedToolbarState(parsed);
      if (!restored.docked) {
        const clamped = clampToolbarPosition({ x: restored.x, y: restored.y }, size, measureBounds());
        setPosition(clamped);
        setDocked(false);
      }
    } catch {
      // Invalid/missing -> stay at the DOCKED default already set above.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every `docked`/`position` change — EXCEPT the very first run
  // (mount), which would otherwise write the not-yet-hydrated DOCKED default
  // right over a real persisted value before the hydration effect above's
  // own state updates have had a chance to land (both effects run in the
  // same initial commit, in declaration order — this one second).
  const skipNextPersistRef = useRef(true);
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ docked, x: position.x, y: position.y }));
    } catch {
      // Best-effort only.
    }
  }, [docked, position]);

  // Re-clamp (never re-fit — there is no "fit" here, just "stay visible")
  // on every window resize/scroll while undocked, so the rail can never end
  // up outside the visible header-to-footer area — e.g. the footer
  // scrolling into view, or the window shrinking. A no-op while docked: the
  // original fixed/centered CSS classes already keep it correctly placed on
  // their own, no JS involved.
  useEffect(() => {
    if (docked) return undefined;
    function reclamp() {
      const size = measureSize(railRef.current);
      setPosition((prev) => clampToolbarPosition(prev, size, measureBounds()));
    }
    window.addEventListener('resize', reclamp);
    window.addEventListener('scroll', reclamp, true);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('scroll', reclamp, true);
    };
  }, [docked]);

  // Escape DURING a drag cancels it back to the pre-drag state (docked
  // origin, or wherever it was already floating) — a WINDOW listener since
  // focus stays on the drag handle but the gesture is pointer-driven, not
  // itself a key event the handle would otherwise see mid-drag.
  useEffect(() => {
    if (!isDragging) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setIsDragging(false);
      setDocked(drag.preDrag.docked);
      setPosition(drag.preDrag.position);
      handleRef.current?.releasePointerCapture?.(drag.pointerId);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDragging]);

  const dock = useCallback(() => setDocked(true), []);

  // Pointer-drag undock/move — the handle's own `onPointerDown`/Move/Up.
  // Dragging FROM docked captures the rail's actual on-screen position
  // first (it has no JS-tracked position while docked — the CSS classes
  // place it), so undocking never jumps: it detaches exactly where it
  // already visually was.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const startPosition = docked ? { x: rect.left, y: rect.top } : position;
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPosition,
        pointerId: e.pointerId,
        preDrag: { docked, position },
      };
      latestDragPositionRef.current = startPosition;
      setIsDragging(true);
      if (docked) {
        setDocked(false);
        setPosition(startPosition);
      }
      handleRef.current?.setPointerCapture?.(e.pointerId);
    },
    [docked, position],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const size = measureSize(railRef.current);
    const proposed = {
      x: drag.startPosition.x + (e.clientX - drag.startClientX),
      y: drag.startPosition.y + (e.clientY - drag.startClientY),
    };
    const clamped = clampToolbarPosition(proposed, size, measureBounds());
    latestDragPositionRef.current = clamped;
    setPosition(clamped);
  }, []);

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag) return;
    const size = measureSize(railRef.current);
    const bounds = measureBounds();
    const finalPosition = clampToolbarPosition(latestDragPositionRef.current, size, bounds);
    const target = dockTargetPosition(size, bounds);
    if (shouldSnapToDock(finalPosition, target)) {
      setDocked(true);
    } else {
      setPosition(finalPosition);
    }
  }, []);

  const handlePointerUp = useCallback(() => endDrag(), [endDrag]);
  const handlePointerCancel = useCallback(() => endDrag(), [endDrag]);

  // Keyboard on the handle: arrows nudge (Shift = bigger step), Home docks.
  // A nudge from DOCKED undocks first, from its current on-screen position
  // (the dock target's own computed position — the same place the CSS
  // classes would have rendered it), same "never jumps" rule as a pointer
  // drag.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Home') {
        e.preventDefault();
        dock();
        return;
      }
      const deltas: Record<string, Point> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      const step = keyboardStep(e.shiftKey);
      const size = measureSize(railRef.current);
      const bounds = measureBounds();
      const current = docked ? dockTargetPosition(size, bounds) : position;
      const clamped = clampToolbarPosition({ x: current.x + delta.x * step, y: current.y + delta.y * step }, size, bounds);
      setDocked(false);
      setPosition(clamped);
    },
    [docked, position, dock],
  );

  // The ghost dock target's own position (small circle centered where the
  // full rail would sit if docked) — only computed while undocked; never
  // touches `document`/`window` during SSR since `docked` is always `true`
  // there (this component has no external control over its own initial
  // state).
  const ghostPosition = !docked
    ? (() => {
        const bounds = measureBounds();
        const target = dockTargetPosition(railSize, bounds);
        return {
          x: target.x + (railSize.width - DOCK_TARGET_SIZE) / 2,
          y: target.y + (railSize.height - DOCK_TARGET_SIZE) / 2,
        };
      })()
    : null;

  const mobileBar = (
    <div
      data-testid="editor-side-toolbar-mobile"
      role="toolbar"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-1 overflow-x-auto border-t border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur-sm pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
    >
      <ToolbarIconButton label={t.collapseAll} testId="collapse-all-button" onClick={onCollapseAll}>
        <ArrowsInIcon aria-hidden="true" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t.expandAll} testId="expand-all-button" onClick={onExpandAll}>
        <ArrowsOutIcon aria-hidden="true" />
      </ToolbarIconButton>
      <BlockIndexPopover lang={lang} blocks={blocks} onGoToBlock={onGoToBlock} openUpward />
      <ToolbarIconButton label={t.addBlock} testId="toolbar-add-block" onClick={onAddBlock}>
        <PlusIcon aria-hidden="true" />
      </ToolbarIconButton>

      <div className="mx-1 h-6 w-px flex-none bg-border" aria-hidden="true" />

      <ToolbarIconButton label={preview ? t.previewOff : t.previewOn} testId="preview-toggle" onClick={onTogglePreview}>
        {preview ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </ToolbarIconButton>

      <div className="mx-1 h-6 w-px flex-none bg-border" aria-hidden="true" />

      <ToolbarIconButton label={t.undo} testId="undo-button" disabled={!canUndo} onClick={onUndo}>
        <ArrowUUpLeftIcon aria-hidden="true" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t.redo} testId="redo-button" disabled={!canRedo} onClick={onRedo}>
        <ArrowUUpRightIcon aria-hidden="true" />
      </ToolbarIconButton>

      <div className="mx-1 h-6 w-px flex-none bg-border" aria-hidden="true" />

      <ShortcutsDialog lang={lang} />

      <div className="mx-1 h-6 w-px flex-none bg-border" aria-hidden="true" />

      <ToolbarIconButton
        label={t.save}
        testId="save-button"
        disabled={saveDisabled}
        loading={saveState === 'saving'}
        onClick={onSave}
      >
        <FloppyDiskIcon aria-hidden="true" />
      </ToolbarIconButton>
      <SaveStatusIndicator status={saveState} onRetry={onSave} labels={saveLabels} />
    </div>
  );

  const desktopRail = (
    <>
    {!docked && ghostPosition && (
      // Floating affordance (hovers over the page like `BackButton`/
      // `ScrollToTop`) — the system's own glass-floating recipe, not an
      // ad-hoc `bg-card/70 backdrop-blur-sm`. The dashed border stays: it is
      // what marks this specifically as a DROP TARGET, not an ordinary
      // floating control.
      <button
        type="button"
        data-testid="toolbar-dock-target"
        aria-label={t.dockToolbar}
        title={t.dockToolbar}
        onClick={dock}
        className="glass-floating fixed z-40 flex h-8 w-8 items-center justify-center rounded-(--radius-pill) border border-dashed border-border text-muted-foreground shadow-(--shadow-floating) transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ left: ghostPosition.x, top: ghostPosition.y }}
      >
        <PushPinIcon aria-hidden="true" />
      </button>
    )}
    <div
      ref={railRef}
      data-testid="editor-side-toolbar"
      data-docked={docked}
      className={
        // DOCKED: an ordinary opaque system surface, anchored to the card's
        // own edge — never glass (glass reads as "floating above the page",
        // which a docked rail is not). FLOATING (undocked): the same
        // glass-floating recipe `BackButton`/`ScrollToTop` use, since once
        // dragged free it IS a floating control.
        docked
          ? 'fixed top-1/2 right-3 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-(--radius-pill) border border-border bg-card p-1.5 shadow-elevation-2'
          : 'glass-floating fixed z-40 flex flex-col items-center gap-1 rounded-(--radius-pill) p-1.5 ring-1 ring-(--color-glass-ring) shadow-(--shadow-floating)'
      }
      style={docked ? undefined : { left: position.x, top: position.y }}
    >
      <div
        ref={handleRef}
        role="button"
        tabIndex={0}
        aria-label={t.moveToolbar}
        title={t.moveToolbar}
        data-testid="toolbar-drag-handle"
        className={`flex h-4 w-7 touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        onDoubleClick={dock}
        onKeyDown={handleKeyDown}
      >
        <DotsSixVerticalIcon aria-hidden="true" />
      </div>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton label={t.collapseAll} testId="collapse-all-button" onClick={onCollapseAll}>
        <ArrowsInIcon aria-hidden="true" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t.expandAll} testId="expand-all-button" onClick={onExpandAll}>
        <ArrowsOutIcon aria-hidden="true" />
      </ToolbarIconButton>
      <BlockIndexPopover lang={lang} blocks={blocks} onGoToBlock={onGoToBlock} />
      <ToolbarIconButton label={t.addBlock} testId="toolbar-add-block" onClick={onAddBlock}>
        <PlusIcon aria-hidden="true" />
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton
        label={preview ? t.previewOff : t.previewOn}
        testId="preview-toggle"
        onClick={onTogglePreview}
      >
        {preview ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton label={t.undo} testId="undo-button" disabled={!canUndo} onClick={onUndo}>
        <ArrowUUpLeftIcon aria-hidden="true" />
      </ToolbarIconButton>
      <ToolbarIconButton label={t.redo} testId="redo-button" disabled={!canRedo} onClick={onRedo}>
        <ArrowUUpRightIcon aria-hidden="true" />
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ShortcutsDialog lang={lang} />

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

      <ToolbarIconButton
        label={t.save}
        testId="save-button"
        disabled={saveDisabled}
        loading={saveState === 'saving'}
        onClick={onSave}
      >
        <FloppyDiskIcon aria-hidden="true" />
      </ToolbarIconButton>
      <SaveStatusIndicator status={saveState} onRetry={onSave} labels={saveLabels} />
    </div>
    </>
  );

  // No-flash split (mobile layout pass, priority fix): `isDesktop` alone
  // used to pick DOM structure directly, which defaults to `true` before
  // hydration and therefore briefly rendered the wrong (desktop) rail on a
  // phone's very first paint. `!hydrated` (server render + the first client
  // paint, before any effect has run) instead renders BOTH bars, gated
  // purely by CSS (`lg:` — real media queries, applied by the browser with
  // zero JS, correct on every viewport immediately) — see `useHydrated`'s
  // own header. The one that does not match the SSR-safe desktop-first
  // default is also `inert`, so none of its buttons are reachable by tab
  // order or a screen reader before hydration has run; this is a STATIC
  // (not `isDesktop`-driven) choice on purpose, so the `inert` attribute
  // itself never disagrees between server and the first client render
  // either. Once `hydrated` is true (flushed synchronously by Testing
  // Library's own `render()`, so every existing test above still queries a
  // single bar), this collapses to mounting only the one `isDesktop` says
  // matches — identical to this component's previous behavior from then on.
  if (hydrated) {
    return isDesktop ? desktopRail : mobileBar;
  }

  return (
    <>
      <div className="contents lg:hidden" inert>
        {mobileBar}
      </div>
      <div className="hidden lg:contents">{desktopRail}</div>
    </>
  );
}
