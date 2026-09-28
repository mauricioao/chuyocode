/**
 * WorksheetZoneEditor — the canvas + properties panel for drawing/editing a
 * worksheet block's answer zones (PR B, "Activities creator"; canvas UX
 * fixes in the "creator canvas UX" pass).
 *
 * The image + its zones are ONE canvas: pointer drag on empty space draws a
 * new zone, drag on a zone's body moves it, drag on one of its four corner
 * handles resizes it — every one of those delegates its math to
 * `src/lib/activities/zoneGeometry.ts` (pure, unit-tested there), this
 * component only translates pointer coordinates into calls.
 *
 * CANVAS VIEWPORT (zoom/pan): the canvas' content box always renders at
 * `image.width * zoom` by `image.height * zoom` CSS pixels, inside a
 * scrollable, screen-bounded viewport — `src/lib/activities/canvasViewport.ts`
 * (pure, unit-tested there) owns the zoom range, fit calculation, and the
 * zoom-around-pointer scroll math. Every zone/pointer coordinate below stays
 * in the SAME container-relative pixel space regardless of zoom, because it
 * is always read off the content box's own `getBoundingClientRect()`, which
 * already reflects the current zoom — so none of the drawing/move/resize
 * math above needs to know a zoom level exists.
 *
 * PROPERTIES PANEL IS ALWAYS RENDERED, fixed width, whether or not a zone is
 * selected — with no zone selected it shows a quiet empty state instead of
 * disappearing. This is deliberate: hiding the panel let the canvas column
 * grow to fill the freed width, which "zoomed" the image in and out every
 * time a zone was selected/deselected (the bug this fixes).
 *
 * POINTER-ONLY ZONE CREATION (canvas tools pass, owner-approved design):
 * drawing a zone is a left-drag with the Zona tool active — there is no
 * button-based fallback any more (the previous "+ Zona" text button is
 * REMOVED; the Zona tool replaces it, per the owner's own instruction). This
 * is a real, accepted accessibility gap for a keyboard-only user — arrow
 * keys/Delete still work on an ALREADY-selected zone (see
 * `handleZoneKeyDown`), but nothing here can DRAW a first zone without a
 * pointer. jsdom has no real layout (`getBoundingClientRect` always returns
 * zeros — matching this codebase's own precedent for `imagePipeline.ts`'s
 * canvas functions), so every draw/move/resize/pan test below mocks it
 * explicitly; true pointer physics stay a manual/Playwright check.
 *
 * TWO TOOLS, `'zone' | 'hand'` (default `'zone'`): the toolbar's Zona/Mano
 * toggle (and the `V`/`H` shortcuts) pick which one a plain left-drag means;
 * a middle-button drag always pans regardless of tool, and holding Space
 * temporarily forces the hand tool (see `effectiveTool` below) — releasing
 * it restores whichever tool was actually selected. Switching tools never
 * touches `selectedZoneId` or the properties panel.
 *
 * Selecting a zone opens its properties panel (kind, answers, options) —
 * this component's analogue of the editor's "right panel". Arrow keys nudge
 * the selected zone; Delete/Backspace removes it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { FrameCornersIcon } from '@phosphor-icons/react/dist/ssr/FrameCorners';
import { BoundingBoxIcon } from '@phosphor-icons/react/dist/ssr/BoundingBox';
import { HandIcon } from '@phosphor-icons/react/dist/ssr/Hand';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { ImageRef, Rotation, Zone } from '@/lib/activities/blocks';
import {
  rectFromDrag,
  moveRect,
  resizeRect,
  nudgeRect,
  MIN_ZONE_SIZE,
  type Handle,
  type Direction,
  type Rect,
} from '@/lib/activities/zoneGeometry';
import {
  clampZoom,
  clampZoomInput,
  parseZoomPercentInput,
  fitZoom,
  stepZoom,
  zoomAroundPoint,
  wheelZoom,
  clampPanScroll,
  contentSize,
  rotatedSize,
} from '@/lib/activities/canvasViewport';
import { Button } from '@/components/ui/button';

export interface ZonesChangeOptions {
  /**
   * `false` while a drag gesture (move/resize) is still in progress — the
   * caller must NOT create an undo step for every pointermove frame.
   * Omitted/`true` for a discrete change (add/delete/nudge/answers/options,
   * or the final pointerup of a drag), which DOES create one.
   */
  commit?: boolean;
}

export interface WorksheetZoneEditorProps {
  lang: Lang;
  image: ImageRef;
  imageUrl: string;
  zones: Zone[];
  selectedZoneId: string | null;
  onZonesChange: (zones: Zone[], opts?: ZonesChangeOptions) => void;
  onSelectZone: (zoneId: string | null) => void;
  /** The worksheet's own rotation (creator polish round 2). Defaults to `0` — every image saved before rotation existed. */
  rotation?: Rotation;
  /**
   * This block's own incomplete spot, if `enviar.ts` pointed back at it
   * (creator polish round 3, owner feedback #1): `undefined` means this
   * block has nothing to show; `null` means the gap is BLOCK-level (a
   * worksheet with no zones at all); a real zone id shows the message in
   * that zone's own properties panel instead.
   */
  incompleteZoneId?: string | null;
  incompleteMessage?: string | null;
}

/** The two canvas tools (owner-approved design) — see the file header. */
type Tool = 'zone' | 'hand';

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
};

type DragMode =
  | { kind: 'draw'; start: { x: number; y: number } }
  | { kind: 'move'; zoneId: string; start: { x: number; y: number }; original: Rect }
  | { kind: 'resize'; zoneId: string; handle: Handle; start: { x: number; y: number }; original: Rect }
  | { kind: 'pan'; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number };

export default function WorksheetZoneEditor({
  lang,
  image,
  imageUrl,
  zones,
  selectedZoneId,
  onZonesChange,
  onSelectZone,
  rotation = 0,
  incompleteZoneId,
  incompleteMessage = null,
}: WorksheetZoneEditorProps) {
  const t = UI_LABELS[lang].activities.worksheet;
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const spaceHeldRef = useRef(false);

  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [tool, setTool] = useState<Tool>('zone');

  // Kept in sync every render (not just on change) so the wheel listener
  // below — attached once, never re-attached per zoom change, to avoid
  // fighting its own in-flight `requestAnimationFrame` batching — can always
  // read the CURRENT zoom without going stale inside its closure.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Space temporarily forces the hand tool regardless of the selected one —
  // see the file header. Every pointer handler below branches on THIS, never
  // on `tool` directly.
  const effectiveTool: Tool = spaceHeld ? 'hand' : tool;

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  // The DISPLAYED size, after rotation — every fit/content-box calculation
  // below must use this, not `image.width`/`image.height` directly (a 90/270
  // rotation swaps the two).
  const displaySize = rotatedSize(image, rotation);

  const computeFitZoom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return 1;
    const box = el.getBoundingClientRect();
    return fitZoom({ width: box.width, height: box.height }, displaySize);
  }, [displaySize]);

  // Default view is fit-to-view (decision #5: the whole worksheet visible on
  // load, however tall/portrait it is — and again on the block re-opening,
  // since `BlockList.tsx` only renders this component while its block is
  // expanded, so every open is a fresh mount with `fitMode` back at its
  // default `true`). The viewport's own box is layout-driven (creator
  // "one-screen" pass: it grows to fill whatever height the active block's
  // flex row gives it — see `BlockList.tsx` — instead of a fixed/clamped CSS
  // height), so a plain mount effect + window `resize` listener is not
  // enough: collapsing/expanding a SIBLING block, switching which block is
  // active, or the properties panel reflowing all change this element's
  // height with no window resize event at all.
  //
  // FIT BUG FIX (canvas tools pass): this used to be a plain `useEffect`
  // that only (re)computed fit INSIDE the `ResizeObserver`'s own callback —
  // relying entirely on the observer firing once, asynchronously, right
  // after `observe()`. That is correct per spec, but it raced the very
  // first paint: `zoom` started at the hardcoded 100% (see its `useState`
  // above) and stayed there — a real, wrong-looking "fit is broken, shows
  // 100% instead" — until that async callback eventually landed. Computing
  // the fit SYNCHRONOUSLY here, in a `useLayoutEffect` (runs after the DOM
  // is committed but before the browser paints), removes that race
  // entirely: the very first paint already shows the correct fit zoom. The
  // observer below still exists, unchanged, to re-fit on LATER resizes
  // (sibling block collapsing, properties panel reflowing, etc.) — jsdom has
  // no `ResizeObserver` (see this file's own tests, which mock it where the
  // behavior matters), guarded the same way `WorksheetPlayer.tsx`'s own
  // resize watcher is.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    if (fitMode) setZoom(computeFitZoom());
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (fitMode) setZoom(computeFitZoom());
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitMode, computeFitZoom]);

  const applyZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    setFitMode(false);
    setZoom((prev) => {
      const clamped = clampZoom(next);
      const viewport = viewportRef.current;
      if (viewport && anchor) {
        const nextScroll = zoomAroundPoint(
          anchor,
          { left: viewport.scrollLeft, top: viewport.scrollTop },
          prev,
          clamped,
        );
        // Applied after the state write lands, once the content box's new
        // (zoomed) size is actually in the DOM — a same-tick write would
        // clamp against the OLD scrollable range.
        requestAnimationFrame(() => {
          if (!viewportRef.current) return;
          viewportRef.current.scrollLeft = nextScroll.left;
          viewportRef.current.scrollTop = nextScroll.top;
        });
      }
      return clamped;
    });
  }, []);

  const handleZoomIn = useCallback(() => applyZoom(stepZoom(zoom, 'in')), [applyZoom, zoom]);
  const handleZoomOut = useCallback(() => applyZoom(stepZoom(zoom, 'out')), [applyZoom, zoom]);
  const handleZoomFit = useCallback(() => {
    setFitMode(true);
    setZoom(computeFitZoom());
  }, [computeFitZoom]);

  // Wheel over the canvas viewport zooms, in EITHER tool (owner-approved
  // design — no Ctrl/⌘ required any more; Ctrl/⌘+wheel still zooms the same
  // way, since it is just another wheel event with modifier keys nobody here
  // reads). `preventDefault` stops the page/block-list from also scrolling —
  // a native, non-passive listener, since React's synthetic wheel handler is
  // attached passively and cannot reliably prevent that. Wheel events over
  // anything OUTSIDE this viewport (e.g. the toolbar's own % input) never
  // reach this listener at all — it is not a sibling in the DOM, not a
  // Ctrl-key check — so the page/block-list scrolls normally there.
  //
  // BATCHED PER ANIMATION FRAME: a trackpad/high-resolution wheel can fire
  // many `wheel` events within a single frame; applying each one immediately
  // (the previous behavior) meant a zoom + scroll-compensation DOM write per
  // event, which was visibly janky. Every event in the same frame instead
  // only accumulates `deltaY` and remembers the latest pointer anchor; ONE
  // `requestAnimationFrame` flushes the accumulated delta through
  // `wheelZoom` (proportional to the current zoom, clamped per frame — see
  // `canvasViewport.ts`) right before the next paint.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let accumulatedDelta = 0;
    let anchor: { x: number; y: number } | null = null;
    let rafId: number | null = null;

    function flush() {
      rafId = null;
      const delta = accumulatedDelta;
      accumulatedDelta = 0;
      if (delta === 0 || !anchor) return;
      applyZoom(wheelZoom(zoomRef.current, delta), anchor);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = viewport!.getBoundingClientRect();
      anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      accumulatedDelta += e.deltaY;
      if (rafId == null) rafId = requestAnimationFrame(flush);
    }

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [applyZoom]);

  // V/H switch tools, 0 fits, +/- zoom, Space temporarily forces the hand
  // tool — all while the canvas viewport itself is focused (never global:
  // typing "v"/"h" in the title/block-name fields elsewhere in the editor
  // must never be caught by this, and it structurally can't be — those
  // inputs are outside this component's own subtree entirely).
  const handleViewportKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleZoomFit();
      } else if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTool('zone');
      } else if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTool('hand');
      } else if (e.key === ' ' && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    },
    [handleZoomIn, handleZoomOut, handleZoomFit],
  );

  // Space's "temporary hand" and any drag/pan in flight MUST release even
  // when the keyup lands somewhere else (focus moved mid-hold) or never
  // arrives at all (the window lost focus entirely — alt-tab, a devtools
  // panel, a native file picker). A React `onKeyUp` bound only to the
  // viewport misses both cases; this listens on `window` instead. `blur`
  // additionally ends any in-progress drag/pan — no `pointerup` will ever
  // arrive for a gesture that was mid-flight when focus left the window.
  useEffect(() => {
    function releaseSpace() {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    }
    function onWindowKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') releaseSpace();
    }
    function onWindowBlur() {
      releaseSpace();
      if (dragRef.current) {
        dragRef.current = null;
        setDraftRect(null);
        setIsPanning(false);
      }
    }
    window.addEventListener('keyup', onWindowKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keyup', onWindowKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const containerSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { width: 0, height: 0 };
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }, []);

  const pointFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = containerRef.current;
    const box = el?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }, []);

  const updateZoneRect = useCallback(
    (zoneId: string, rect: Rect, opts?: ZonesChangeOptions) => {
      onZonesChange(
        zones.map((z) => (z.id === zoneId ? { ...z, ...rect } : z)),
        opts,
      );
    },
    [zones, onZonesChange],
  );

  // Middle-button drag pans regardless of tool; browsers open their own
  // autoscroll UI on a middle-button press unless it's prevented.
  const startPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const viewport = viewportRef.current;
    dragRef.current = {
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollLeft: viewport?.scrollLeft ?? 0,
      startScrollTop: viewport?.scrollTop ?? 0,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return; // a zone/handle handles its own pointer down
      if (e.button === 1) {
        startPan(e); // middle-button: always pans, in either tool
        return;
      }
      if (e.button !== 0) return; // ignore right-click etc.
      if (effectiveTool === 'hand') {
        startPan(e); // Mano tool (or a temporary Space-hand): left-drag pans
        return;
      }
      onSelectZone(null);
      const start = pointFromEvent(e);
      dragRef.current = { kind: 'draw', start };
      setDraftRect(null);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [effectiveTool, onSelectZone, pointFromEvent, startPan],
  );

  const handleZonePointerDown = useCallback(
    (zone: Zone) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        startPan(e); // middle-button on a zone still pans, not moves it
        return;
      }
      if (effectiveTool === 'hand') {
        // Mano tool: zones are NOT selectable/movable — dragging one pans
        // the canvas instead, same as dragging empty space.
        startPan(e);
        return;
      }
      e.stopPropagation();
      onSelectZone(zone.id);
      const start = pointFromEvent(e);
      dragRef.current = { kind: 'move', zoneId: zone.id, start, original: zone };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [effectiveTool, onSelectZone, pointFromEvent, startPan],
  );

  const handleHandlePointerDown = useCallback(
    (zone: Zone, handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        startPan(e);
        return;
      }
      if (effectiveTool === 'hand') {
        startPan(e);
        return;
      }
      e.stopPropagation();
      onSelectZone(zone.id);
      const start = pointFromEvent(e);
      dragRef.current = { kind: 'resize', zoneId: zone.id, handle, start, original: zone };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [effectiveTool, onSelectZone, pointFromEvent, startPan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.kind === 'pan') {
        const viewport = viewportRef.current;
        if (viewport) {
          const proposed = {
            left: drag.startScrollLeft - (e.clientX - drag.startClientX),
            top: drag.startScrollTop - (e.clientY - drag.startClientY),
          };
          // Pan bounds (canvas tools pass): the content box may be dragged
          // until (at most) its far edge reaches the viewport's own center —
          // see `clampPanScroll`'s own header. A no-op once content is
          // bigger than the viewport (the browser's own native scroll
          // clamping is already tighter there); it only actually matters
          // once zoomed out below the viewport's own size, where there is no
          // native scrollable range at all.
          const viewportBox = viewport.getBoundingClientRect();
          const content = contentSize(displaySize, zoom);
          const clamped = clampPanScroll(
            proposed,
            { width: viewportBox.width, height: viewportBox.height },
            content,
          );
          viewport.scrollLeft = clamped.left;
          viewport.scrollTop = clamped.top;
        }
        return;
      }

      const size = containerSize();
      const point = pointFromEvent(e);

      if (drag.kind === 'draw') {
        // The rubber-band rectangle, live: re-derived from the drag start to
        // the CURRENT pointer position on every move, and committed as a
        // real zone only on pointer up (or discarded if it never grew past
        // the minimum size — see `handlePointerUp`).
        setDraftRect(rectFromDrag(drag.start, point, size));
        return;
      }
      if (size.width <= 0 || size.height <= 0) return;

      const dx = (point.x - drag.start.x) / size.width;
      const dy = (point.y - drag.start.y) / size.height;

      if (drag.kind === 'move') {
        // Live frame: no undo step per pixel — see `ZonesChangeOptions`.
        updateZoneRect(drag.zoneId, moveRect(drag.original, dx, dy), { commit: false });
      } else if (drag.kind === 'resize') {
        updateZoneRect(drag.zoneId, resizeRect(drag.original, drag.handle, dx, dy), { commit: false });
      }
    },
    [containerSize, pointFromEvent, updateZoneRect, displaySize, zoom],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDraftRect(null);
    setIsPanning(false);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      endDrag();
      // Seal a move/resize gesture into exactly ONE undo step now that it is
      // done — every pointermove frame during it was a `commit: false`
      // live update (see `handlePointerMove`); `zones` here already holds
      // the final position from the last of those.
      if (drag && (drag.kind === 'move' || drag.kind === 'resize')) {
        onZonesChange(zones, { commit: true });
        return;
      }
      if (!drag || drag.kind !== 'draw') return;

      const size = containerSize();
      const end = pointFromEvent(e);
      if (size.width <= 0 || size.height <= 0) return;

      // A drag that never grew past the minimum zone size (including a
      // plain click with no movement at all) is discarded rather than
      // committed as a tiny default-sized zone — no flicker, no accidental
      // zone. `MIN_ZONE_SIZE` is `zoneGeometry.ts`'s own floor, checked here
      // on the RAW (unclamped) drag distance before `rectFromDrag` would
      // otherwise floor it up to a real zone.
      const rawW = Math.abs(end.x - drag.start.x) / size.width;
      const rawH = Math.abs(end.y - drag.start.y) / size.height;
      if (rawW < MIN_ZONE_SIZE && rawH < MIN_ZONE_SIZE) return;

      const rect = rectFromDrag(drag.start, end, size);
      const zone: Zone = { id: crypto.randomUUID(), ...rect, kind: 'text', answers: [''] };
      onZonesChange([...zones, zone]);
      onSelectZone(zone.id);
    },
    [containerSize, pointFromEvent, zones, onZonesChange, onSelectZone, endDrag],
  );

  const handlePointerCancel = useCallback(() => {
    // An OS/browser-cancelled gesture never commits — same "no flicker, no
    // accidental zone" rule as a too-small drag in `handlePointerUp`.
    endDrag();
  }, [endDrag]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedZoneId) return;
    onZonesChange(zones.filter((z) => z.id !== selectedZoneId));
    onSelectZone(null);
  }, [selectedZoneId, zones, onZonesChange, onSelectZone]);

  const handleZoneKeyDown = useCallback(
    (zone: Zone) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      const directions: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const direction = directions[e.key];
      if (direction) {
        e.preventDefault();
        updateZoneRect(zone.id, nudgeRect(zone, direction));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }
    },
    [updateZoneRect, handleDeleteSelected],
  );

  const setKind = useCallback(
    (kind: Zone['kind']) => {
      if (!selectedZone) return;
      const next: Zone =
        kind === 'text'
          ? { id: selectedZone.id, x: selectedZone.x, y: selectedZone.y, w: selectedZone.w, h: selectedZone.h, kind: 'text', answers: selectedZone.answers.length > 0 ? selectedZone.answers : [''] }
          : {
              id: selectedZone.id,
              x: selectedZone.x,
              y: selectedZone.y,
              w: selectedZone.w,
              h: selectedZone.h,
              kind: 'choice',
              answers: [],
              options: selectedZone.options && selectedZone.options.length >= 2 ? selectedZone.options : ['', ''],
            };
      onZonesChange(zones.map((z) => (z.id === next.id ? next : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  const setAnswers = useCallback(
    (answers: string[]) => {
      if (!selectedZone) return;
      onZonesChange(zones.map((z) => (z.id === selectedZone.id ? { ...z, answers } : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  const setOptions = useCallback(
    (options: string[]) => {
      if (!selectedZone) return;
      const answers = selectedZone.answers.filter((a) => options.includes(a));
      onZonesChange(zones.map((z) => (z.id === selectedZone.id ? { ...z, options, answers } : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  const toggleOptionCorrect = useCallback(
    (option: string, correct: boolean) => {
      if (!selectedZone) return;
      const answers = correct
        ? [...selectedZone.answers, option]
        : selectedZone.answers.filter((a) => a !== option);
      onZonesChange(zones.map((z) => (z.id === selectedZone.id ? { ...z, answers } : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  // Editable zoom % field (owner-approved design): a local "draft" string,
  // kept in sync with the actual `zoom` whenever the input is NOT focused (a
  // toolbar zoom, Ajustar, a wheel, or a resize-driven re-fit must all still
  // update the displayed number), left alone while the author is actively
  // typing so their keystrokes are never clobbered mid-edit.
  const zoomInputFocusedRef = useRef(false);
  const [zoomDraft, setZoomDraft] = useState('100');
  useEffect(() => {
    if (!zoomInputFocusedRef.current) setZoomDraft(String(Math.round(zoom * 100)));
  }, [zoom]);

  const handleZoomInputFocus = useCallback(() => {
    zoomInputFocusedRef.current = true;
  }, []);

  // Enter or blur applies; accepts "80" or "80%"; an unparseable value
  // reverts to the last-applied zoom instead of guessing. Wider clamp than
  // the toolbar buttons (10%–400% — see `clampZoomInput`'s own header).
  const commitZoomDraft = useCallback(() => {
    zoomInputFocusedRef.current = false;
    const parsed = parseZoomPercentInput(zoomDraft);
    if (parsed === null) {
      setZoomDraft(String(Math.round(zoom * 100)));
      return;
    }
    const clamped = clampZoomInput(parsed / 100);
    setFitMode(false);
    setZoom(clamped);
    setZoomDraft(String(Math.round(clamped * 100)));
  }, [zoomDraft, zoom]);

  const handleZoomInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitZoomDraft();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        zoomInputFocusedRef.current = false;
        setZoomDraft(String(Math.round(zoom * 100))); // revert, discard the draft
        e.currentTarget.blur();
      }
    },
    [commitZoomDraft, zoom],
  );

  const canvasSize = contentSize(displaySize, zoom);
  // The <img> itself always renders at its OWN (unrotated) content size —
  // rotation is a pure CSS transform around its center, and the OUTER
  // canvas (sized to `canvasSize` above, using the ROTATED dimensions) is
  // what the rotated image ends up filling exactly.
  const imageContentSize = contentSize(image, zoom);
  // Cursor reflects the EFFECTIVE tool (Space's temporary hand included),
  // not the persisted `tool` — see the file header.
  const canvasCursorClass = isPanning
    ? 'cursor-grabbing'
    : effectiveTool === 'hand'
      ? 'cursor-grab'
      : 'cursor-crosshair';

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row"
      data-testid="worksheet-zone-editor"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="mb-1 flex flex-none flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1"
          data-testid="zoom-toolbar"
        >
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t.zoomOut} data-testid="zoom-out" onClick={handleZoomOut}>
            <MinusIcon aria-hidden="true" />
          </Button>
          {/* Editable zoom % (owner-approved design, replacing the old
              read-only span): Enter/blur applies, Escape reverts, accepts
              "80" or "80%", clamped 10%-400%. Wheel over this input does NOT
              zoom — it is outside `viewportRef`'s own subtree entirely, so
              the wheel listener attached there never sees it. */}
          <input
            type="text"
            inputMode="numeric"
            data-testid="zoom-input"
            aria-label={t.zoomInputLabel}
            value={zoomDraft}
            onChange={(e) => setZoomDraft(e.target.value)}
            onFocus={handleZoomInputFocus}
            onBlur={commitZoomDraft}
            onKeyDown={handleZoomInputKeyDown}
            className="h-7 w-12 rounded border border-border bg-background text-center text-xs tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t.zoomIn} data-testid="zoom-in" onClick={handleZoomIn}>
            <PlusIcon aria-hidden="true" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          <Button type="button" size="sm" variant="outline" data-testid="zoom-fit" onClick={handleZoomFit}>
            <FrameCornersIcon aria-hidden="true" />
            {t.zoomFit}
          </Button>
          <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          {/* Tool toggle (owner-approved design): icon-only, active tool in
              brand yellow (`variant="default"`) — replaces the old
              25/50/100/125 preset row and the "+ Zona" button entirely. */}
          <Button
            type="button"
            size="icon-sm"
            variant={tool === 'zone' ? 'default' : 'ghost'}
            aria-label={t.toolZone}
            aria-pressed={tool === 'zone'}
            title={t.toolZoneTooltip}
            data-testid="tool-zone"
            onClick={() => setTool('zone')}
          >
            <BoundingBoxIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={tool === 'hand' ? 'default' : 'ghost'}
            aria-label={t.toolHand}
            aria-pressed={tool === 'hand'}
            title={t.toolHandTooltip}
            data-testid="tool-hand"
            onClick={() => setTool('hand')}
          >
            <HandIcon aria-hidden="true" />
          </Button>
        </div>

        <div
          ref={viewportRef}
          data-testid="zone-viewport"
          tabIndex={0}
          onKeyDown={handleViewportKeyDown}
          // Layout-driven height (creator "one-screen" pass): this viewport
          // fills whatever height its flex ancestors give it (the active
          // block's row in `BlockList.tsx`, ultimately the editor page's own
          // `100dvh`-based column) instead of a fixed/clamped CSS height —
          // `min-h-80` is only a FLOOR so it still renders usably outside
          // that flex chain (narrow/stacked layout below `lg:`, or a test
          // harness with no real layout).
          className="relative min-h-80 flex-1 overflow-auto rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div
            ref={containerRef}
            data-testid="zone-canvas"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            // A safety net for state leaks (canvas tools pass): capture can
            // be released for reasons other than a cancel/up event too (the
            // OS/browser deciding to reclaim it, the element momentarily
            // leaving the DOM, etc). Bubbles up from a zone/handle child the
            // same way `onPointerCancel` already does — see the file header.
            onLostPointerCapture={handlePointerCancel}
            className={`relative touch-none select-none ${canvasCursorClass}`}
            style={{ width: canvasSize.width, height: canvasSize.height }}
          >
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute object-contain"
              style={{
                top: '50%',
                left: '50%',
                width: imageContentSize.width,
                height: imageContentSize.height,
                // Rotation (creator polish round 2) is a pure CSS transform
                // around the image's own center — the outer canvas above is
                // already sized to the ROTATED dimensions, so the rotated
                // image exactly fills it.
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }}
            />
            {zones.map((zone) => {
              const selected = zone.id === selectedZoneId;
              const style = {
                left: `${zone.x * 100}%`,
                top: `${zone.y * 100}%`,
                width: `${zone.w * 100}%`,
                height: `${zone.h * 100}%`,
              };
              return (
                <div
                  key={zone.id}
                  data-testid={`zone-${zone.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={zone.kind === 'text' ? t.zoneKindText : t.zoneKindChoice}
                  aria-pressed={selected}
                  onPointerDown={handleZonePointerDown(zone)}
                  onKeyDown={handleZoneKeyDown(zone)}
                  // In the Mano tool (or a temporary Space-hand), a zone is
                  // not movable — it shows the same grab/grabbing cursor as
                  // empty canvas instead of the Zona tool's "move" cursor,
                  // since dragging it now pans (see `handleZonePointerDown`).
                  className={`absolute rounded border-2 ${
                    effectiveTool === 'hand' ? canvasCursorClass : 'cursor-move'
                  } ${
                    selected ? 'border-primary bg-primary/20' : 'border-accent/70 bg-accent/10'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
                  style={style}
                >
                  {selected &&
                    HANDLES.map((handle) => (
                      <div
                        key={handle}
                        data-testid={`handle-${zone.id}-${handle}`}
                        onPointerDown={handleHandlePointerDown(zone, handle)}
                        className={`absolute h-3 w-3 rounded-full border border-primary-foreground bg-primary ${
                          effectiveTool === 'hand' ? canvasCursorClass : HANDLE_CURSOR[handle]
                        } ${handle.includes('n') ? '-top-1.5' : '-bottom-1.5'} ${
                          handle.includes('w') ? '-left-1.5' : '-right-1.5'
                        }`}
                      />
                    ))}
                </div>
              );
            })}
            {draftRect && (
              <div
                data-testid="zone-draft"
                aria-hidden="true"
                className="pointer-events-none absolute rounded border-2 border-dashed border-primary bg-primary/10"
                style={{
                  left: `${draftRect.x * 100}%`,
                  top: `${draftRect.y * 100}%`,
                  width: `${draftRect.w * 100}%`,
                  height: `${draftRect.h * 100}%`,
                }}
              />
            )}
          </div>
        </div>
        {/* One compact line (creator "one-screen" pass: every extra row here
            is height the canvas doesn't get) instead of two stacked hints. */}
        <div className="mt-1 flex flex-none flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {zones.length === 0 && <span>{t.noZonesYet}</span>}
          <span>{t.addZoneHint}</span>
        </div>
        {/* Block-level incomplete pointer (creator polish round 3, owner
            feedback #1): `incompleteZoneId === null` means the gap is
            "this worksheet has no zones at all" rather than one specific
            zone — see `WorksheetZoneEditorProps`'s own doc. */}
        {incompleteMessage && incompleteZoneId === null && (
          <p
            data-testid="worksheet-incomplete-message"
            className="mt-1 flex-none rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
          >
            {incompleteMessage}
          </p>
        )}
      </div>

      {/* ALWAYS rendered, fixed width (~280-300px) — see the file header.
          Hiding this column when nothing is selected is exactly the bug that
          made the canvas "zoom" on select/deselect. `overflow-y-auto` +
          `min-h-0` (creator "one-screen" pass): once this row has a real,
          bounded height (from the flex chain above), a long properties
          panel scrolls WITHIN its own column instead of growing the row and
          pushing the canvas off-screen. */}
      <div
        className="w-full flex-none overflow-y-auto lg:min-h-0 lg:w-72"
        data-testid="zone-properties-panel"
      >
        {selectedZone ? (
          <div data-testid="zone-properties-content">
            {/* Zone-level incomplete pointer (creator polish round 3, owner
                feedback #1) — only shown while THIS zone is the one
                `enviar.ts` pointed back at. */}
            {incompleteMessage && incompleteZoneId === selectedZone.id && (
              <p
                data-testid="zone-incomplete-message"
                className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
              >
                {incompleteMessage}
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t.zoneKindLabel}</span>
              <Button type="button" size="icon-sm" variant="ghost" data-testid="delete-zone" aria-label={t.zoneDelete} onClick={handleDeleteSelected}>
                <XIcon aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t.zoneKindLabel}>
              <Button
                type="button"
                size="sm"
                variant={selectedZone.kind === 'text' ? 'default' : 'outline'}
                role="radio"
                aria-checked={selectedZone.kind === 'text'}
                onClick={() => setKind('text')}
              >
                {t.zoneKindText}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedZone.kind === 'choice' ? 'default' : 'outline'}
                role="radio"
                aria-checked={selectedZone.kind === 'choice'}
                onClick={() => setKind('choice')}
              >
                {t.zoneKindChoice}
              </Button>
            </div>

            {selectedZone.kind === 'text' && (
              <div className="mt-4 flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t.zoneAnswersLabel}</span>
                {selectedZone.answers.map((answer, i) => (
                  <div key={i} className="flex gap-1">
                    <input
                      type="text"
                      value={answer}
                      placeholder={t.zoneAnswerPlaceholder}
                      aria-label={`${t.zoneAnswersLabel} ${i + 1}`}
                      onChange={(e) => {
                        const next = [...selectedZone.answers];
                        next[i] = e.target.value;
                        setAnswers(next);
                      }}
                      className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm text-foreground"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t.zoneAnswerRemove}
                      disabled={selectedZone.answers.length <= 1}
                      onClick={() => setAnswers(selectedZone.answers.filter((_, j) => j !== i))}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setAnswers([...selectedZone.answers, ''])}>
                  + {t.zoneAnswerAdd}
                </Button>
              </div>
            )}

            {selectedZone.kind === 'choice' && (
              <div className="mt-4 flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t.zoneOptionsLabel}</span>
                {(selectedZone.options ?? []).map((option, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      aria-label={t.zoneOptionCorrect}
                      checked={selectedZone.answers.includes(option)}
                      onChange={(e) => toggleOptionCorrect(option, e.target.checked)}
                    />
                    <input
                      type="text"
                      value={option}
                      placeholder={t.zoneOptionPlaceholder}
                      aria-label={`${t.zoneOptionsLabel} ${i + 1}`}
                      onChange={(e) => {
                        const options = [...(selectedZone.options ?? [])];
                        options[i] = e.target.value;
                        setOptions(options);
                      }}
                      className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm text-foreground"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t.zoneOptionRemove}
                      disabled={(selectedZone.options ?? []).length <= 2}
                      onClick={() => setOptions((selectedZone.options ?? []).filter((_, j) => j !== i))}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOptions([...(selectedZone.options ?? []), ''])}
                >
                  + {t.zoneOptionAdd}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div data-testid="zone-properties-empty" className="rounded-lg border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">{t.panelEmpty}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t.panelEmptyHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
