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
 * DOCKED/FLOATING split (desk window dock pass): a `docked` boolean plus a
 * `{ x, y }` `position` — ALWAYS live, in BOTH states — drive the rail's own
 * placement. The rail (and its ghost dock-target) is ALWAYS portaled
 * straight to `document.body` (`createPortal`, `railAndGhost`'s own header
 * below) — the container NEVER changes based on `docked`, for two compounding
 * reasons: `#desk-window` gets a non-`none` CSS `translate` the instant it
 * has ever been dragged (`deskWindowDrag.ts`'s own `applyOffset`, persisted
 * across reloads), which — per the CSS spec — makes it the containing block
 * for ANY `position: fixed`/`absolute` DESCENDANT instead of the real
 * viewport; and React tears a portaled subtree down and remounts it
 * (confirmed empirically — losing `railRef`, any in-flight drag, and every
 * DOM reference a test already holds) the moment its OWN container target
 * changes between renders, even outside a live gesture. One stable target
 * for this component's whole lifetime is the only shape that is
 * simultaneously correct (truly viewport-relative while floating) and
 * remount-free.
 *
 * DOCKED — the default: `position` is kept synced to the WINDOW's own
 * current dock slot (`dockTargetPosition(size, measureBounds())` —
 * `measureBounds` prefers `[data-desk-window-body]`'s real rect) by a
 * `MutationObserver` on `#desk-window`'s own `style` attribute (dragging or
 * maximizing the window writes `style.translate`/classes there) plus a
 * `resize` listener — so it still visually tracks the window being dragged,
 * maximized, or resized, just via an explicit, event-driven resync instead
 * of a free CSS containing-block trick (which a single stable portal target
 * rules out — see above).
 *
 * UNDOCKED — released by dragging the handle, a keyboard nudge, or the
 * dock/float toggle (the "clip", `toolbar-dock-toggle`, pinned ⇄ unpinned —
 * `aria-pressed` mirrors `docked` so the state reads at a glance): `position`
 * is clamped by `src/lib/activities/toolbarPosition.ts` (pure, unit-tested
 * there) to the full VIEWPORT (`measureViewportBounds`, header-to-footer) —
 * NOT the window — so it can float anywhere, including over the desk outside
 * the window entirely. The ghost "dock" target shown while undocked (and the
 * snap-back distance check) still targets the WINDOW's own current slot
 * (`measureBounds`) — floating is viewport-wide, but re-docking always aims
 * back at the window, wherever it currently sits on screen.
 *
 * Z-INDEX: `z-[60]`, one above the window's own `z-50` — same convention
 * `MinimizedWindowsTray.astro` uses for the same reason (a plain
 * `document.body`-level sibling of the window must always win the stacking
 * comparison against it) — applies in BOTH states now, not just floating.
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
import { createPortal } from 'react-dom';
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
import { PushPinSlashIcon } from '@phosphor-icons/react/dist/ssr/PushPinSlash';
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

/** The full viewport, minus the site `<header>`/`<footer>` when present — shared by {@link measureBounds} (its own fallback) and {@link measureViewportBounds} (always). */
function headerFooterBounds(): Bounds {
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  return {
    left: 0,
    right: window.innerWidth,
    top: header?.getBoundingClientRect().bottom ?? 0,
    bottom: footer?.getBoundingClientRect().top ?? window.innerHeight,
  };
}

/**
 * Where the editor window's own DOCKED slot currently sits on screen — used
 * ONLY for the ghost dock-target's position and the drag-release snap-back
 * check (`shouldSnapToDock`/`dockTargetPosition`), never to clamp the
 * floating rail itself any more (see {@link measureViewportBounds}).
 *
 * `[data-desk-window-body]` (`DeskWindow.astro`'s own body wrapper) is
 * checked first and, when present, is the bounds — real docking is now pure
 * CSS against that same element (its own header), but the GHOST still needs
 * real viewport pixels to draw itself and to judge "close enough to
 * re-dock". Falls back to the header-to-footer measurement when no desk
 * window is mounted (every other, non-editor caller of this component, and
 * this file's own tests). Only ever called client-side (inside an effect or
 * an event handler, never during the render body while `docked` could still
 * be the server-matching default) — `document`/`window` don't exist during
 * SSR, and the guard below is defensive insurance on top of that, not the
 * only thing preventing an SSR crash.
 */
function measureBounds(): Bounds {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  const windowBody = document.querySelector('[data-desk-window-body]');
  if (windowBody) {
    const rect = windowBody.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }
  return headerFooterBounds();
}

/**
 * The FLOATING (undocked) rail's own clamp bounds — always the full
 * viewport (header-to-footer), NEVER the window: releasing the rail lets it
 * sit anywhere on the desk, including outside the window entirely (the
 * component's own header). Used for every undocked clamp: the initial
 * restore-from-`localStorage`, every live drag frame, the release, the
 * keyboard nudge, and the resize/scroll re-clamp.
 */
function measureViewportBounds(): Bounds {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  return headerFooterBounds();
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
  pressed,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  /** Shows the shared `Button`'s own spinner in place of the icon — the manual save button's own in-flight state (coherent loading states, item 3). Every other toolbar icon leaves this unset. */
  loading?: boolean;
  /** Toggle buttons only (the dock/float "clip") — forwarded as `aria-pressed`, with a subtle pinned-looking fill so the state reads at a glance (`aria-pressed:` is a built-in Tailwind 4 variant, same pattern `aria-expanded:` already uses on `Button`'s own `ghost` variant). Every other toolbar icon leaves this unset, which renders byte-identical to before. */
  pressed?: boolean;
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
      aria-pressed={pressed}
      className={pressed !== undefined ? 'aria-pressed:bg-muted aria-pressed:text-foreground' : undefined}
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

  // ONE unified effect for both "hydrate from localStorage on mount" and
  // "keep `position` synced to the window's own dock slot while docked" —
  // deliberately NOT two separate effects: a `useLayoutEffect`-triggered
  // state update forces a synchronous re-render before paint, but a
  // SEPARATE `useEffect` already scheduled for the ORIGINAL (pre-update)
  // render still fires against that original render's own closed-over
  // `docked` value, not the updated one — confirmed empirically (an
  // undocked restore kept getting clobbered back to the docked slot by a
  // second, stale-`docked` effect run). One effect, one sequential function
  // body, no such race: the mount-only localStorage branch `return`s
  // immediately when it restores undocked, skipping the dock-sync branch
  // below ENTIRELY on that same call, rather than relying on two effects
  // somehow agreeing on ordering.
  //
  // `useLayoutEffect` so the FIRST real position (restored, or the window's
  // own dock slot) applies before the first paint, never after a visible
  // flash at `{0,0}` — and so every LATER resync (the window being dragged,
  // maximized, or the viewport resizing) stays equally flash-free.
  //
  // `mountedOnceRef` is what makes `[docked]` a safe dependency here without
  // re-reading `localStorage` (and re-fighting an in-progress drag/the
  // persist effect) on every docked<->undocked transition: the hydration
  // branch only ever runs on the true first call.
  const mountedOnceRef = useRef(false);
  useLayoutEffect(() => {
    const size = measureSize(railRef.current);
    setRailSize(size);

    if (!mountedOnceRef.current) {
      mountedOnceRef.current = true;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const restored = parsePersistedToolbarState(parsed);
        if (!restored.docked) {
          const clamped = clampToolbarPosition({ x: restored.x, y: restored.y }, size, measureViewportBounds());
          setPosition(clamped);
          setDocked(false);
          return undefined; // restored undocked -> no dock-sync/observer this run.
        }
      } catch {
        // Invalid/missing -> fall through to the DOCKED sync below (already
        // the default `docked`/`useState`).
      }
    }

    if (!docked) return undefined;

    // Keep `position` synced to the WINDOW's own current dock slot: a
    // `MutationObserver` on the window's own `style` attribute
    // (`deskWindowDrag.ts`'s own `applyOffset` writes `style.translate`
    // there) plus a `resize` listener — event-driven, never polled: the
    // window never fires its own custom "moved" event, but it DOES always
    // touch its own `style` when it moves, which this observes directly.
    function resync() {
      setPosition(dockTargetPosition(measureSize(railRef.current), measureBounds()));
    }
    resync();
    const windowEl = document.getElementById('desk-window');
    const observer = windowEl ? new MutationObserver(resync) : null;
    if (windowEl && observer) {
      observer.observe(windowEl, { attributes: true, attributeFilter: ['style'] });
    }
    window.addEventListener('resize', resync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resync);
    };
  }, [docked]);

  // Persist on every `docked`/`position` change — EXCEPT the very first run
  // (mount), which would otherwise write the not-yet-hydrated DOCKED default
  // right over a real persisted value before the hydration+sync effect
  // above's own state updates (from the SAME initial commit) have landed.
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
      setPosition((prev) => clampToolbarPosition(prev, size, measureViewportBounds()));
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

  // Release to float, from the "clip" toggle (not a drag): captures the
  // rail's REAL, live on-screen rect (not just the last synced `position` —
  // self-correcting even if a resync is somehow stale) so undocking never
  // jumps, same "measure, don't assume" posture as `handlePointerDown`.
  const undock = useCallback(() => {
    const rect = railRef.current?.getBoundingClientRect();
    if (rect) setPosition({ x: rect.left, y: rect.top });
    setDocked(false);
  }, []);

  /** The "clip": pinned (docked) <-> released (floating) — `toolbar-dock-toggle`'s own `onClick`. */
  const toggleDocked = useCallback(() => {
    if (docked) undock();
    else dock();
  }, [docked, undock, dock]);

  // Pointer-drag undock/move — the handle's own `onPointerDown`/Move/Up.
  // Dragging FROM docked captures the rail's REAL on-screen rect (not just
  // the last synced `position` — self-correcting even if a resync is
  // somehow stale), so undocking never jumps: it detaches exactly where it
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
    const clamped = clampToolbarPosition(proposed, size, measureViewportBounds());
    latestDragPositionRef.current = clamped;
    setPosition(clamped);
  }, []);

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag) return;
    const size = measureSize(railRef.current);
    // Final resting spot: clamped to the VIEWPORT (floating is viewport-wide
    // now) — but "close enough to re-dock" still targets the WINDOW's own
    // current slot (`measureBounds`), wherever it is on screen.
    const finalPosition = clampToolbarPosition(latestDragPositionRef.current, size, measureViewportBounds());
    const target = dockTargetPosition(size, measureBounds());
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
      // Starting point: the WINDOW's own docked slot when nudging FROM
      // docked (`measureBounds`) — but the nudged result is a floating
      // position, clamped to the full VIEWPORT like every other undocked
      // move.
      const current = docked ? dockTargetPosition(size, measureBounds()) : position;
      const clamped = clampToolbarPosition(
        { x: current.x + delta.x * step, y: current.y + delta.y * step },
        size,
        measureViewportBounds(),
      );
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

  // ALWAYS PORTALED TO `document.body`, NEVER CONDITIONALLY (dock pass
  // bugfix — see the file's own header: a single stable target is the only
  // shape that is both truly viewport-relative while floating AND
  // remount-free). Gated on `hydrated` (the SAME flag the mobile/desktop
  // SSR split already uses below), not a raw `typeof document` check: a
  // `renderToStaticMarkup` call still has `document` as a jsdom global in
  // this file's OWN tests despite never running an effect, and
  // `ReactDOMServer` refuses to render a portal at all — `hydrated` only
  // flips once a real client commit has happened, which is exactly when
  // `document.body` is both safe AND meaningful to target.
  const railAndGhost = (
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
        // `z-[60]`: one above the window's own `z-50` — same convention
        // `MinimizedWindowsTray.astro` uses — so this (now body-portaled,
        // see `railAndGhost`'s own header) ghost always wins the stacking
        // comparison wherever it lands, including directly over the window.
        className="glass-floating fixed z-[60] flex h-8 w-8 items-center justify-center rounded-(--radius-pill) border border-dashed border-border text-muted-foreground shadow-(--shadow-floating) transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        // Both states are `fixed` at an explicit `{ left, top }` now (see
        // the file header) — `position` is kept live either way, so there is
        // no more separate "pure CSS" docked branch. DOCKED: an ordinary
        // opaque system surface (never glass — glass reads as "floating
        // above the page", which a docked rail is not). UNDOCKED: the same
        // glass-floating recipe `BackButton`/`ScrollToTop` use, since once
        // released it IS a floating control. `z-[60]` in both: one above the
        // window's own `z-50` (`MinimizedWindowsTray.astro`'s own
        // convention) — this is a plain `document.body`-level sibling of
        // `#desk-window` now, not a descendant, so without it the window
        // would win ordinary stacking comparisons wherever the two overlap.
        docked
          ? 'fixed z-[60] flex flex-col items-center gap-1 rounded-(--radius-pill) border border-border bg-card p-1.5 shadow-elevation-2'
          : 'glass-floating fixed z-[60] flex flex-col items-center gap-1 rounded-(--radius-pill) p-1.5 ring-1 ring-(--color-glass-ring) shadow-(--shadow-floating)'
      }
      style={{ left: position.x, top: position.y }}
    >
      <ToolbarIconButton
        label={docked ? t.undockToolbar : t.dockToolbar}
        testId="toolbar-dock-toggle"
        pressed={docked}
        onClick={toggleDocked}
      >
        {docked ? <PushPinIcon aria-hidden="true" /> : <PushPinSlashIcon aria-hidden="true" />}
      </ToolbarIconButton>

      <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />

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

  const desktopRail = hydrated ? createPortal(railAndGhost, document.body) : railAndGhost;

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
