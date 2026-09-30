/**
 * WorksheetZoneEditor — the canvas + properties panel for drawing/editing a
 * worksheet block's answer zones (PR B, "Activities creator"; canvas UX
 * fixes in the "creator canvas UX" pass; camera model in the "canvas camera"
 * pass).
 *
 * The image + its zones are ONE canvas: pointer drag on empty space draws a
 * new zone, drag on a zone's body moves it, drag on one of its four corner
 * handles resizes it — every one of those delegates its math to
 * `src/lib/activities/zoneGeometry.ts` (pure, unit-tested there), this
 * component only translates pointer coordinates into calls.
 *
 * CAMERA (canvas camera pass — replaces the old scroll-based viewport): the
 * canvas is a BOUNDED, `overflow: hidden` viewport (no native scrollbars —
 * it fills whatever height its flex ancestors give it, same as before) with
 * one child, the "content layer" (`containerRef`, `data-testid="zone-canvas"`),
 * always rendered at its own NATIVE (unscaled) size — `displaySize`, the
 * already-ROTATED image dimensions — and moved/scaled entirely via a CSS
 * `transform: translate(x, y) scale(scale)` (`transform-origin: 0 0`) driven
 * by the `camera` state, `{ scale, x, y }`. `src/lib/activities/canvasViewport.ts`
 * (pure, unit-tested there) owns the camera math: `fitCamera` (whole image
 * centered), `zoomAt` (keeps a viewport-relative point fixed under a scale
 * change), `panBy`/`clampCamera` (bounded translation — every corner of an
 * oversized image reachable, no empty overshoot; a smaller-than-viewport
 * axis is always centered), and `screenToContentPoint` (viewport-relative
 * pixels -> the content layer's own native pixel space). Every zone
 * draw/move/resize below goes through THAT conversion — never the content
 * layer's own (CSS-transformed) `getBoundingClientRect()` — so none of
 * `zoneGeometry.ts`'s math needs to know a camera exists at all: it always
 * receives points/sizes in the image's native, unscaled pixel space,
 * regardless of the current `camera.scale`.
 *
 * FIT MODE: `fitMode` tracks whether the camera should still auto-refit on a
 * viewport/image resize (block expand/collapse, sibling reflow, a properties
 * panel change — none of which fire a window `resize` event). Any EXPLICIT
 * zoom (buttons, wheel, +/-/0 keys, the typed % field) or PAN (Mano drag,
 * middle-drag, Space-drag) turns it off — a later resize then RE-CLAMPS the
 * user's own camera instead of silently re-fitting it away and discarding
 * their pan/zoom. "Ajustar" and the `0` key turn it back on.
 *
 * PERFORMANCE: an active PAN drag never calls `setCamera` per pointer event
 * — every pointermove during a pan only computes the candidate camera and
 * stores it in a ref; ONE `requestAnimationFrame` per frame flushes the
 * latest candidate into real React state (same batching shape as the wheel
 * listener below, already established before this pass). The drag commits
 * its FINAL camera into state synchronously on pointerup/cancel, canceling
 * any still-pending frame, so the camera is never left one frame stale.
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { FrameCornersIcon } from '@phosphor-icons/react/dist/ssr/FrameCorners';
import { HandIcon } from '@phosphor-icons/react/dist/ssr/Hand';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import {
  MAX_ZONE_SPEAK_LENGTH,
  MAX_ZONE_EXPLANATION_LENGTH,
  type ImageRef,
  type Rotation,
  type Zone,
} from '@/lib/activities/blocks';
import {
  rectFromDrag,
  moveRect,
  resizeRect,
  nudgeRect,
  centeredZoneRect,
  MIN_ZONE_SIZE,
  type Handle,
  type Direction,
  type Rect,
} from '@/lib/activities/zoneGeometry';
import {
  clampZoomInput,
  parseZoomPercentInput,
  stepZoomInput,
  wheelZoomInput,
  fitCamera,
  clampCamera,
  zoomAt,
  panBy,
  screenToContentPoint,
  rotatedSize,
  visibleImageRect,
  type Camera,
  type Size,
} from '@/lib/activities/canvasViewport';
import {
  reduceTouchGesture,
  INITIAL_TOUCH_GESTURE_STATE,
  type TouchGestureState,
} from '@/lib/activities/touchGesture';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useHydrated } from '@/hooks/useHydrated';
import { Button } from '@/components/ui/button';
import BottomSheet from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

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

const IDENTITY_CAMERA: Camera = { scale: 1, x: 0, y: 0 };

type DragMode =
  | { kind: 'draw'; start: { x: number; y: number } }
  | { kind: 'move'; zoneId: string; start: { x: number; y: number }; original: Rect }
  | { kind: 'resize'; zoneId: string; handle: Handle; start: { x: number; y: number }; original: Rect }
  | { kind: 'pan'; startClientX: number; startClientY: number; startCamera: Camera }
  /** Mobile layout pass: a two-finger touch pinch/pan — see `touchGesture.ts`'s own header; all the actual math lives there, this is just the marker `handlePointerMove`/`handlePointerUp` branch on. */
  | { kind: 'touch-pinch' };

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
  // Mobile layout pass: two-finger pinch/pan tracking, TOUCH pointers only
  // (see `touchGesture.ts`'s own header — mouse/pen never reach it, so
  // their behavior is completely unchanged).
  const touchGestureRef = useRef<TouchGestureState>(INITIAL_TOUCH_GESTURE_STATE);

  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [fitMode, setFitMode] = useState(true);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [tool, setTool] = useState<Tool>('zone');

  // Keyboard zone creation (accessibility, Enter/N — see the file header):
  // an `aria-live` announcement, and the pending focus handoff into the
  // newly-created zone's first answer field. `pendingFocusZoneIdRef` is set
  // right before selecting the new zone and cleared once the focus effect
  // below actually moves focus (or on a later mount that never matches, e.g.
  // the panel wasn't rendered at all).
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const pendingFocusZoneIdRef = useRef<string | null>(null);
  const firstAnswerInputRef = useRef<HTMLInputElement | null>(null);

  // Mobile layout pass: below `lg`, the properties column becomes a
  // BottomSheet instead — see the render below and its own comment.
  // `mobilePanelExpanded` starts (and resets to) collapsed/peek on every
  // NEW selection, so tapping a zone always shows the compact peek first,
  // never jumping straight to the full form.
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false);
  useEffect(() => {
    setMobilePanelExpanded(false);
  }, [selectedZoneId]);

  // Keyboard zone creation's focus handoff (see `handleCreateZoneAtCenter`
  // above): once `selectedZoneId` actually matches the zone that requested
  // focus, the properties panel has re-rendered with that zone's own first
  // answer field mounted (desktop panel — always rendered; the mobile
  // BottomSheet stays collapsed on a new selection like any other zone
  // creation, same as a pointer-drawn zone, so this only fires there). Runs
  // AFTER that render is committed, so the ref is populated by then.
  useEffect(() => {
    if (pendingFocusZoneIdRef.current && pendingFocusZoneIdRef.current === selectedZoneId) {
      firstAnswerInputRef.current?.focus();
      pendingFocusZoneIdRef.current = null;
    }
  }, [selectedZoneId, zones]);

  // Kept in sync every render (not just on change) so the wheel listener and
  // the pan pointer-move handler below — both read this inside a
  // `requestAnimationFrame`-batched closure that must never go stale — can
  // always read the CURRENT camera without depending on `camera` itself (a
  // dependency that would tear down/re-attach the wheel listener on every
  // zoom, fighting its own in-flight batching).
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // A pending pan frame: the LATEST candidate camera from a still-in-flight
  // pointermove batch, and the `requestAnimationFrame` id flushing it — see
  // the file header's Performance note. `target` is read (and cleared) by
  // `endDrag` on pointerup/cancel to commit the final position even if a
  // frame is still pending.
  const panFrameRef = useRef<{ id: number | null; target: Camera | null }>({ id: null, target: null });

  // Space temporarily forces the hand tool regardless of the selected one —
  // see the file header. Every pointer handler below branches on THIS, never
  // on `tool` directly.
  const effectiveTool: Tool = spaceHeld ? 'hand' : tool;

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  // The DISPLAYED size, after rotation — every fit/camera calculation below
  // must use this, not `image.width`/`image.height` directly (a 90/270
  // rotation swaps the two). MEMOIZED (canvas camera pass): `rotatedSize`
  // returns a fresh object every call, and it feeds the camera
  // reconcile effect's own dependency array below — an unmemoized new
  // reference on EVERY render would re-run that effect every render, and
  // since a `Camera` is an object (never `Object.is`-equal to the last one
  // even with identical numbers, unlike the old plain-number `zoom` state),
  // that would call `setCamera` every render, in turn causing another
  // render — an infinite loop. Keying on the primitive `width`/`height`/
  // `rotation` values (not the `image` prop's own object identity) means
  // this stays stable even if a parent re-renders with a structurally
  // identical but newly-allocated `image` object.
  const displaySize = useMemo(
    () => rotatedSize(image, rotation),
    [image.width, image.height, rotation],
  );

  const viewportSize = useCallback((): Size => {
    const el = viewportRef.current;
    if (!el) return { width: 0, height: 0 };
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }, []);

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
  // FIT BUG FIX (canvas tools pass), STILL synchronous here (canvas camera
  // pass): computing the fit camera in a `useLayoutEffect` (runs after the
  // DOM is committed but before the browser paints) removes the race
  // against the very first paint that a plain `useEffect` + async
  // `ResizeObserver` callback alone would have. The observer below re-runs
  // this on LATER resizes; while NOT in fit mode, a resize RE-CLAMPS the
  // user's own camera instead (see the file header) rather than leaving it
  // referencing a viewport size that no longer exists.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const reconcile = () => {
      const vp = viewportSize();
      setCamera((prev) => (fitMode ? fitCamera(displaySize, vp) : clampCamera(prev, displaySize, vp)));
    };
    reconcile();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(reconcile);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitMode, displaySize, viewportSize]);

  // Zoom to `nextScale` (already computed/clamped by the caller — see
  // `stepZoomInput`/`wheelZoomInput`/the typed % field below), anchored at
  // `anchor` (viewport-relative pixels) or the viewport's own center when no
  // anchor is given (a plain button/keyboard zoom has no pointer position to
  // anchor to). Always turns fit mode off — an explicit zoom is the user
  // taking the camera away from "whatever fits".
  const applyCameraZoom = useCallback(
    (nextScale: number, anchor?: { x: number; y: number }) => {
      setFitMode(false);
      setCamera((prev) => {
        const vp = viewportSize();
        const point = anchor ?? { x: vp.width / 2, y: vp.height / 2 };
        return zoomAt(prev, nextScale, point, { image: displaySize, viewport: vp });
      });
    },
    [displaySize, viewportSize],
  );

  // Unified 10%-400% range for every explicit zoom entry point in this
  // editor (owner-approved design) — `stepZoomInput`/`wheelZoomInput` are
  // the WIDER-floor siblings of `stepZoom`/`wheelZoom`
  // (`WorksheetPracticePlayer.tsx` keeps using the narrower, unchanged
  // originals directly — see `canvasViewport.ts`'s own header on each).
  const handleZoomIn = useCallback(
    () => applyCameraZoom(stepZoomInput(camera.scale, 'in')),
    [applyCameraZoom, camera.scale],
  );
  const handleZoomOut = useCallback(
    () => applyCameraZoom(stepZoomInput(camera.scale, 'out')),
    [applyCameraZoom, camera.scale],
  );
  const handleZoomFit = useCallback(() => {
    setFitMode(true);
    setCamera(fitCamera(displaySize, viewportSize()));
  }, [displaySize, viewportSize]);

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
  // (the previous behavior) meant a zoom + camera-recompute DOM write per
  // event, which was visibly janky. Every event in the same frame instead
  // only accumulates `deltaY` and remembers the latest pointer anchor; ONE
  // `requestAnimationFrame` flushes the accumulated delta through
  // `wheelZoomInput` (proportional to the current zoom, clamped per frame —
  // see `canvasViewport.ts`) right before the next paint.
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
      applyCameraZoom(wheelZoomInput(cameraRef.current.scale, delta), anchor);
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
  }, [applyCameraZoom]);

  // V/H switch tools, 0 fits, +/- zoom, Space temporarily forces the hand
  // tool — all while the canvas viewport itself is focused (never global:
  // typing "v"/"h" in the title/block-name fields elsewhere in the editor
  // must never be caught by this, and it structurally can't be — those
  // inputs are outside this component's own subtree entirely).
  // Keyboard zone creation (accessibility): `Enter`/`N` with the Zona tool
  // active and the canvas focused creates a new zone centered in the
  // currently VISIBLE part of the image — `visibleImageRect` (camera-aware,
  // works at any pan/zoom) feeds `centeredZoneRect`'s own default ~20%x6%
  // size, already clamped inside the image. One history entry, same shape as
  // a pointer-drawn zone (`handlePointerUp`'s own draw branch): a single
  // `onZonesChange` call (default `commit: true`) plus `onSelectZone`.
  // `pendingFocusZoneIdRef` hands the new zone's id to the focus effect
  // below, which moves focus into its first answer field once the
  // properties panel actually renders it; `liveAnnouncement` drives the
  // `aria-live` region in the render below.
  const handleCreateZoneAtCenter = useCallback(() => {
    const vp = viewportSize();
    const visible = visibleImageRect(cameraRef.current, displaySize, vp);
    const rect = centeredZoneRect(visible);
    const zone: Zone = { id: crypto.randomUUID(), ...rect, kind: 'text', answers: [''] };
    pendingFocusZoneIdRef.current = zone.id;
    onZonesChange([...zones, zone]);
    onSelectZone(zone.id);
    setLiveAnnouncement(t.zoneCreatedAnnouncement);
  }, [zones, onZonesChange, onSelectZone, viewportSize, displaySize, t.zoneCreatedAnnouncement]);

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
      } else if (
        (e.key === 'Enter' || e.key === 'n' || e.key === 'N') &&
        effectiveTool === 'zone' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        handleCreateZoneAtCenter();
      } else if (e.key === ' ' && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    },
    [handleZoomIn, handleZoomOut, handleZoomFit, effectiveTool, handleCreateZoneAtCenter],
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
      if (dragRef.current) endDrag();
    }
    window.addEventListener('keyup', onWindowKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keyup', onWindowKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
    // `endDrag` is declared below with `useCallback([])` (stable identity),
    // so it is safe to reference here without adding it to the deps array
    // and re-subscribing every render — matches this effect's original,
    // mount-only shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convert a pointer event into the content layer's own NATIVE (unscaled)
  // pixel space — see the file header's Camera note. Every draw/move/resize
  // call below already expects points in exactly this space (the same one
  // `displaySize` describes), regardless of the current `camera.scale`.
  const pointFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = viewportRef.current;
    const box = el?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const screenPoint = { x: e.clientX - box.left, y: e.clientY - box.top };
    return screenToContentPoint(screenPoint, cameraRef.current);
  }, []);

  /**
   * The VIEWPORT-relative point (not `pointFromEvent`'s content-native
   * space) — what `touchGesture.ts`'s pinch math (and the camera it wraps
   * via `anchoredZoom`) expects, same convention `WorksheetPracticePlayerMobile.tsx`'s
   * own pinch already uses.
   */
  const viewportPointFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = viewportRef.current;
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
    dragRef.current = {
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCamera: cameraRef.current,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  // Ends whatever ONE-FINGER/mouse/pen gesture is currently in `dragRef`
  // WITHOUT committing anything: a draw's draft is simply dropped, a
  // move/resize's live (`commit: false`) edits stay wherever they last
  // landed but no final `commit: true` step is pushed (`handlePointerUp` is
  // what does that, on a NORMAL end), and an in-progress pan's last frame is
  // still applied so the camera doesn't visually snap back. Used both by a
  // genuine cancel (OS/browser pointercancel, losing capture) AND — mobile
  // layout pass — by a second touch finger landing mid-gesture, which must
  // cancel the first finger's action the exact same way (see
  // `handleTouchGesturePointerDown` below and `touchGesture.ts`'s own
  // header: "no history entry" for that case).
  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraftRect(null);
    setIsPanning(false);
    if (panFrameRef.current.id != null) {
      cancelAnimationFrame(panFrameRef.current.id);
      panFrameRef.current.id = null;
    }
    if (drag?.kind === 'pan') {
      // Commit the FINAL camera synchronously, even if a batched frame was
      // still pending — see the file header's Performance note.
      const finalCamera = panFrameRef.current.target ?? drag.startCamera;
      panFrameRef.current.target = null;
      cameraRef.current = finalCamera;
      setCamera(finalCamera);
      // An actual pan (not just a middle-click with zero movement) exits fit
      // mode too — otherwise the NEXT resize-driven re-fit would silently
      // discard it (see the file header).
      if (finalCamera.x !== drag.startCamera.x || finalCamera.y !== drag.startCamera.y) {
        setFitMode(false);
      }
    }
  }, []);

  /**
   * Mobile layout pass — the touch multi-pointer GATE every `onPointerDown`
   * handler below calls FIRST. Feeds `touchGesture.ts`'s pure reducer a
   * `pointerdown` and applies whatever it decides:
   *  - a non-touch pointer (mouse/pen) is untouched — returns `false`
   *    immediately, the caller proceeds exactly as before this pass.
   *  - the FIRST touch finger: the reducer enters its `'single'` phase, this
   *    returns `false` too — the caller starts its own normal draw/move/
   *    resize/pan for that one finger, unchanged.
   *  - a SECOND touch finger: the reducer emits `cancel-single` (the
   *    caller's in-progress one-finger action is discarded via `endDrag()`,
   *    never committed — no history entry) and enters `'pinch'`; this sets
   *    `dragRef` to `{ kind: 'touch-pinch' }` and returns `true`, so the
   *    caller returns immediately WITHOUT starting its own draw/move/resize
   *    for this second finger.
   */
  const handleTouchGesturePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): boolean => {
      if (e.pointerType !== 'touch') return false;
      const point = viewportPointFromEvent(e);
      const { state, effect } = reduceTouchGesture(
        touchGestureRef.current,
        { type: 'pointerdown', id: e.pointerId, point, camera: cameraRef.current },
        { image: displaySize, viewport: viewportSize() },
      );
      touchGestureRef.current = state;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (effect.type === 'cancel-single') endDrag();
      if (state.phase === 'pinch') {
        dragRef.current = { kind: 'touch-pinch' };
        return true;
      }
      return false;
    },
    [viewportPointFromEvent, displaySize, viewportSize, endDrag],
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return; // a zone/handle handles its own pointer down
      if (handleTouchGesturePointerDown(e)) return;
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
    [effectiveTool, onSelectZone, pointFromEvent, startPan, handleTouchGesturePointerDown],
  );

  const handleZonePointerDown = useCallback(
    (zone: Zone) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (handleTouchGesturePointerDown(e)) return;
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
    [effectiveTool, onSelectZone, pointFromEvent, startPan, handleTouchGesturePointerDown],
  );

  const handleHandlePointerDown = useCallback(
    (zone: Zone, handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (handleTouchGesturePointerDown(e)) return;
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
    [effectiveTool, onSelectZone, pointFromEvent, startPan, handleTouchGesturePointerDown],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;

      // Mobile layout pass: every TOUCH move keeps `touchGesture.ts`'s own
      // tracked point fresh — even during a one-finger draw/move/resize —
      // so a SECOND finger landing later anchors its pinch to where the
      // first finger actually is right now, not where it started.
      if (e.pointerType === 'touch' && e.pointerId in touchGestureRef.current.pointers) {
        const bounds = { image: displaySize, viewport: viewportSize() };
        const { state, effect } = reduceTouchGesture(
          touchGestureRef.current,
          { type: 'pointermove', id: e.pointerId, point: viewportPointFromEvent(e) },
          bounds,
        );
        touchGestureRef.current = state;
        if (drag?.kind === 'touch-pinch' && effect.type === 'camera') {
          cameraRef.current = effect.camera;
          setCamera(effect.camera);
          setFitMode(false);
        }
      }

      // Every kind of pinch move is fully handled above; nothing below this
      // applies to it (draw/move/resize/pan all belong to a ONE-finger — or
      // mouse/pen — gesture only). Checked unconditionally (not nested under
      // the touch branch above) so TypeScript can narrow `drag`'s type for
      // the rest of this function too.
      if (drag?.kind === 'touch-pinch') return;
      if (!drag) return;

      if (drag.kind === 'pan') {
        // Never `setCamera` per pointer event here — see the file header's
        // Performance note. Only the LATEST candidate is kept; at most one
        // `requestAnimationFrame` is ever in flight for this drag.
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        const next = panBy(drag.startCamera, dx, dy, { image: displaySize, viewport: viewportSize() });
        panFrameRef.current.target = next;
        if (panFrameRef.current.id == null) {
          panFrameRef.current.id = requestAnimationFrame(() => {
            panFrameRef.current.id = null;
            const cam = panFrameRef.current.target;
            if (cam) {
              cameraRef.current = cam;
              setCamera(cam);
            }
          });
        }
        return;
      }

      const point = pointFromEvent(e);

      if (drag.kind === 'draw') {
        // The rubber-band rectangle, live: re-derived from the drag start to
        // the CURRENT pointer position on every move, and committed as a
        // real zone only on pointer up (or discarded if it never grew past
        // the minimum size — see `handlePointerUp`).
        setDraftRect(rectFromDrag(drag.start, point, displaySize));
        return;
      }
      if (displaySize.width <= 0 || displaySize.height <= 0) return;

      const dx = (point.x - drag.start.x) / displaySize.width;
      const dy = (point.y - drag.start.y) / displaySize.height;

      if (drag.kind === 'move') {
        // Live frame: no undo step per pixel — see `ZonesChangeOptions`.
        updateZoneRect(drag.zoneId, moveRect(drag.original, dx, dy), { commit: false });
      } else if (drag.kind === 'resize') {
        updateZoneRect(drag.zoneId, resizeRect(drag.original, drag.handle, dx, dy), { commit: false });
      }
    },
    [pointFromEvent, updateZoneRect, displaySize, viewportSize, viewportPointFromEvent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;

      // Mobile layout pass: a touch finger lifting — feed it to
      // `touchGesture.ts` first. While still `'touch-pinch'` (this WAS the
      // active pinch and at least 2 fingers remain down), stay in pinch mode
      // entirely: no `endDrag()`, no zone commit, just keep tracking. Once
      // the reducer says the pinch itself has ended (dropped below 2
      // fingers — `'suppressed'`/`'idle'`), fall through to `endDrag()`
      // below to null `dragRef` out, then return before the move/resize/draw
      // commit logic (none of which applies to a pinch).
      if (e.pointerType === 'touch' && e.pointerId in touchGestureRef.current.pointers) {
        const bounds = { image: displaySize, viewport: viewportSize() };
        const { state } = reduceTouchGesture(
          touchGestureRef.current,
          { type: 'pointerup', id: e.pointerId },
          bounds,
        );
        touchGestureRef.current = state;
        if (drag?.kind === 'touch-pinch') {
          if (state.phase === 'pinch') return; // still >= 2 fingers — keep pinching
          endDrag();
          return;
        }
      }

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

      const end = pointFromEvent(e);
      if (displaySize.width <= 0 || displaySize.height <= 0) return;

      // A drag that never grew past the minimum zone size (including a
      // plain click with no movement at all) is discarded rather than
      // committed as a tiny default-sized zone — no flicker, no accidental
      // zone. `MIN_ZONE_SIZE` is `zoneGeometry.ts`'s own floor, checked here
      // on the RAW (unclamped) drag distance before `rectFromDrag` would
      // otherwise floor it up to a real zone.
      const rawW = Math.abs(end.x - drag.start.x) / displaySize.width;
      const rawH = Math.abs(end.y - drag.start.y) / displaySize.height;
      if (rawW < MIN_ZONE_SIZE && rawH < MIN_ZONE_SIZE) return;

      const rect = rectFromDrag(drag.start, end, displaySize);
      const zone: Zone = { id: crypto.randomUUID(), ...rect, kind: 'text', answers: [''] };
      onZonesChange([...zones, zone]);
      onSelectZone(zone.id);
    },
    [pointFromEvent, zones, onZonesChange, onSelectZone, endDrag, displaySize, viewportSize],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (e.pointerType === 'touch' && e.pointerId in touchGestureRef.current.pointers) {
        const bounds = { image: displaySize, viewport: viewportSize() };
        const { state } = reduceTouchGesture(
          touchGestureRef.current,
          { type: 'pointercancel', id: e.pointerId },
          bounds,
        );
        touchGestureRef.current = state;
        if (drag?.kind === 'touch-pinch' && state.phase === 'pinch') return; // still >= 2 fingers
      }
      // An OS/browser-cancelled gesture never commits — same "no flicker, no
      // accidental zone" rule as a too-small drag in `handlePointerUp`.
      endDrag();
    },
    [endDrag, displaySize, viewportSize],
  );

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
          ? {
              id: selectedZone.id,
              x: selectedZone.x,
              y: selectedZone.y,
              w: selectedZone.w,
              h: selectedZone.h,
              kind: 'text',
              answers: selectedZone.answers.length > 0 ? selectedZone.answers : [''],
              speak: selectedZone.speak,
              explanation: selectedZone.explanation,
            }
          : {
              id: selectedZone.id,
              x: selectedZone.x,
              y: selectedZone.y,
              w: selectedZone.w,
              h: selectedZone.h,
              kind: 'choice',
              answers: [],
              options: selectedZone.options && selectedZone.options.length >= 2 ? selectedZone.options : ['', ''],
              speak: selectedZone.speak,
              explanation: selectedZone.explanation,
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

  /**
   * D4 "Escuchar/Listen": the zone's optional speak text. An empty field
   * clears the affordance entirely (stored as `undefined`, matching
   * `parseZone`'s own "blank after trim = absent" rule) rather than an
   * empty string, so a cleared field and a never-set one are the same
   * on-disk shape.
   */
  const setSpeak = useCallback(
    (speak: string) => {
      if (!selectedZone) return;
      const trimmed = speak.trim();
      onZonesChange(
        zones.map((z) => (z.id === selectedZone.id ? { ...z, speak: trimmed.length > 0 ? speak : undefined } : z)),
      );
    },
    [selectedZone, zones, onZonesChange],
  );

  /**
   * D5 "¿Por qué?": the zone's optional explanation, shown to the learner
   * only after an incorrect check. Same "blank after trim = absent" rule as
   * {@link setSpeak} above.
   */
  const setExplanation = useCallback(
    (explanation: string) => {
      if (!selectedZone) return;
      const trimmed = explanation.trim();
      onZonesChange(
        zones.map((z) =>
          z.id === selectedZone.id ? { ...z, explanation: trimmed.length > 0 ? explanation : undefined } : z,
        ),
      );
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
  // kept in sync with the actual `camera.scale` whenever the input is NOT
  // focused (a toolbar zoom, Ajustar, a wheel, a pan, or a resize-driven
  // re-fit/re-clamp must all still update the displayed number), left alone
  // while the author is actively typing so their keystrokes are never
  // clobbered mid-edit.
  const zoomInputFocusedRef = useRef(false);
  const [zoomDraft, setZoomDraft] = useState('100');
  useEffect(() => {
    if (!zoomInputFocusedRef.current) setZoomDraft(String(Math.round(camera.scale * 100)));
  }, [camera.scale]);

  const handleZoomInputFocus = useCallback(() => {
    zoomInputFocusedRef.current = true;
  }, []);

  // Enter or blur applies; accepts "80" or "80%"; an unparseable value
  // reverts to the last-applied zoom instead of guessing. Same unified
  // 10%-400% clamp as every other zoom entry point in this editor now (see
  // `handleZoomIn`/`handleZoomOut`'s own header).
  const commitZoomDraft = useCallback(() => {
    zoomInputFocusedRef.current = false;
    const parsed = parseZoomPercentInput(zoomDraft);
    if (parsed === null) {
      setZoomDraft(String(Math.round(camera.scale * 100)));
      return;
    }
    const clamped = clampZoomInput(parsed / 100);
    applyCameraZoom(clamped);
    setZoomDraft(String(Math.round(clamped * 100)));
  }, [zoomDraft, camera.scale, applyCameraZoom]);

  const handleZoomInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitZoomDraft();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        zoomInputFocusedRef.current = false;
        setZoomDraft(String(Math.round(camera.scale * 100))); // revert, discard the draft
        e.currentTarget.blur();
      }
    },
    [commitZoomDraft, camera.scale],
  );

  // Cursor reflects the EFFECTIVE tool (Space's temporary hand included),
  // not the persisted `tool` — see the file header.
  const canvasCursorClass = isPanning
    ? 'cursor-grabbing'
    : effectiveTool === 'hand'
      ? 'cursor-grab'
      : 'cursor-crosshair';

  // The selected zone's short kind label ("Texto"/"Opción") — the mobile
  // properties sheet's peek bar and title (see below); `null` with nothing
  // selected, which is also what makes that sheet disappear entirely.
  const selectedZoneKindLabel = selectedZone
    ? selectedZone.kind === 'text'
      ? t.zoneKindText
      : t.zoneKindChoice
    : null;

  // The properties FORM itself — identical markup for the desktop column
  // and the mobile bottom sheet (mobile layout pass), computed once here
  // instead of duplicated in both render branches below. `null` with
  // nothing selected; the desktop branch falls back to its own empty-state
  // card, the mobile sheet simply renders nothing (see the file header).
  const zonePropertiesContent = selectedZone ? (
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

      {/* D4 "Escuchar/Listen": optional per-zone text for the practice
          player's speaker affordance — a worksheet image has no
          machine-readable text otherwise. Applies to both zone kinds. */}
      <div className="mt-4 flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t.zoneSpeakLabel}</span>
        <Input
          type="text"
          fieldSize="sm"
          data-testid="zone-properties-speak-input"
          aria-label={t.zoneSpeakLabel}
          value={selectedZone.speak ?? ''}
          maxLength={MAX_ZONE_SPEAK_LENGTH}
          placeholder={t.zoneSpeakPlaceholder}
          onChange={(e) => setSpeak(e.target.value)}
        />
      </div>

      {selectedZone.kind === 'text' && (
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t.zoneAnswersLabel}</span>
          {selectedZone.answers.map((answer, i) => (
            <div key={i} className="flex gap-1">
              <Input
                type="text"
                fieldSize="sm"
                // Keyboard zone creation's focus target (see
                // `handleCreateZoneAtCenter`'s own header): the FIRST answer
                // field of whichever zone is currently selected — every
                // selection change re-renders this from scratch, so this
                // ref always points at the right zone's own first field.
                ref={i === 0 ? firstAnswerInputRef : undefined}
                value={answer}
                placeholder={t.zoneAnswerPlaceholder}
                aria-label={`${t.zoneAnswersLabel} ${i + 1}`}
                onChange={(e) => {
                  const next = [...selectedZone.answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
                className="flex-1"
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
              <Checkbox
                aria-label={t.zoneOptionCorrect}
                checked={selectedZone.answers.includes(option)}
                onCheckedChange={(checked) => toggleOptionCorrect(option, checked === true)}
              />
              <Input
                type="text"
                fieldSize="sm"
                value={option}
                placeholder={t.zoneOptionPlaceholder}
                aria-label={`${t.zoneOptionsLabel} ${i + 1}`}
                onChange={(e) => {
                  const options = [...(selectedZone.options ?? [])];
                  options[i] = e.target.value;
                  setOptions(options);
                }}
                className="flex-1"
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

      {/* D5 "¿Por qué?": optional per-zone explanation, shown to the
          learner only once they check and get THIS zone wrong. Sits under
          the answers, for both zone kinds — same placement as the answers
          section itself relative to the rest of the panel. */}
      <div className="mt-4 flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t.zoneExplanationLabel}</span>
        <Textarea
          data-testid="zone-properties-explanation-input"
          aria-label={t.zoneExplanationLabel}
          value={selectedZone.explanation ?? ''}
          maxLength={MAX_ZONE_EXPLANATION_LENGTH}
          placeholder={t.zoneExplanationPlaceholder}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          className="resize-none"
        />
        <span className="text-xs text-muted-foreground">{t.zoneExplanationHint}</span>
      </div>
    </div>
  ) : null;

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row"
      data-testid="worksheet-zone-editor"
    >
      {/* Keyboard zone creation's announcement (accessibility) — visually
          hidden, `aria-live="polite"` so a screen reader announces "Zona
          creada" without stealing focus from wherever it just landed (the
          new zone's first answer field, via the focus effect above). */}
      <div aria-live="polite" role="status" className="sr-only" data-testid="worksheet-live-region">
        {liveAnnouncement}
      </div>
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
              25/50/100/125 preset row and the "+ Zona" button entirely. The
              Zona tool uses the SAME plus/cross icon component (`PlusIcon`,
              same weight) as the side toolbar's "Agregar bloque" button, to
              match this tool's own crosshair cursor — see
              `EditorSideToolbar.tsx`'s `toolbar-add-block`. Its own tooltip
              stays "Zona (V)"; only the icon is shared. */}
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
            <PlusIcon aria-hidden="true" />
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
          // harness with no real layout). `overflow-hidden`, no native
          // scrollbars (canvas camera pass) — panning is entirely the
          // content layer's own CSS transform now, never native scroll.
          // `touch-none` (mobile layout pass) lives HERE, on the viewport —
          // not the content layer below, which can be smaller OR larger
          // than the viewport at any given zoom — so the browser's own
          // touch gestures (page scroll, pinch-zoom-the-page) never fire
          // anywhere inside this bounded box, matching this component's own
          // two-finger pinch/pan (`touchGesture.ts`) rather than fighting it.
          className="relative min-h-80 flex-1 touch-none overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
            className={`absolute left-0 top-0 select-none ${canvasCursorClass}`}
            style={{
              width: displaySize.width,
              height: displaySize.height,
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
              transformOrigin: '0 0',
              willChange: isPanning ? 'transform' : undefined,
            }}
          >
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute object-contain"
              style={{
                top: '50%',
                left: '50%',
                width: image.width,
                height: image.height,
                // Rotation (creator polish round 2) is a pure CSS transform
                // around the image's own center — the outer content layer
                // above is already sized to the ROTATED dimensions
                // (`displaySize`), so the rotated image exactly fills it.
                // The camera's own scale/translate lives on that OUTER
                // layer, so this transform stays rotation-only.
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
                        // `before:` grows the TOUCH hit area to >= 32px
                        // (mobile layout pass) without touching the dot's
                        // own visual size: a transparent `::before` box,
                        // 10px past each edge of the 12px (`h-3 w-3`) dot on
                        // every side, still resolves a tap anywhere inside
                        // it to THIS element (a pseudo-element is never
                        // itself an event target).
                        className={`absolute h-3 w-3 rounded-full border border-primary-foreground bg-primary before:absolute before:-inset-2.5 before:content-[''] ${
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

      {/* Desktop ALWAYS renders this column, fixed width (~280-300px) — see
          the file header. Hiding it when nothing is selected is exactly the
          bug that made the canvas "zoom" on select/deselect. Below `lg`
          (mobile layout pass) this becomes a `BottomSheet` instead: a
          collapsed PEEK bar (the selected zone's own kind label) while
          `mobilePanelExpanded` is false, tap it to expand to the full
          properties form, and it disappears ENTIRELY on deselect (no
          "select a zone" empty-state card floating at the bottom of a
          phone — that hint is what `addZoneHint` below the canvas already
          says). `zonePropertiesContent` is the exact same JSX either way,
          computed once. */}
      {(() => {
        const desktopPanel = (
          <div className="w-full flex-none overflow-y-auto lg:min-h-0 lg:w-72" data-testid="zone-properties-panel">
            {zonePropertiesContent ?? (
              <div data-testid="zone-properties-empty" className="rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">{t.panelEmpty}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t.panelEmptyHint}</p>
              </div>
            )}
          </div>
        );
        const mobileSheet = (
          <BottomSheet
            open={mobilePanelExpanded && selectedZone !== null}
            onOpenChange={setMobilePanelExpanded}
            title={selectedZoneKindLabel ?? t.zoneKindLabel}
            testId="zone-properties-sheet"
            peek={selectedZoneKindLabel !== null ? <span>{selectedZoneKindLabel}</span> : undefined}
          >
            {zonePropertiesContent}
          </BottomSheet>
        );

        // No-flash split (mobile layout pass, priority fix): these are two
        // genuinely different subtrees (a plain always-visible column vs. a
        // Radix-backed BottomSheet) — a CSS-only `hidden lg:block` toggle
        // would mount BOTH (duplicate zone-properties inputs/ids). `isDesktop`
        // alone defaults to `true` before hydration, so it used to render the
        // desktop column's structure on a phone's very first paint. `!hydrated`
        // (server render + the very first client paint) instead renders BOTH,
        // gated purely by CSS `lg:` classes (real media queries, correct on
        // every viewport immediately, no JS needed) — see `useHydrated`'s own
        // header. The mobile sheet is additionally `inert` there: a STATIC
        // (not `isDesktop`-driven) choice matching `useIsDesktop`'s own
        // desktop-first SSR default, so the attribute itself never disagrees
        // between the server and the first client render either. Once
        // `hydrated` is true (flushed synchronously by Testing Library's own
        // `render()` — every existing test above still finds exactly one of
        // `zone-properties-panel`/`zone-properties-sheet`), this collapses to
        // mounting only the one `isDesktop` says matches, same as before.
        if (hydrated) return isDesktop ? desktopPanel : mobileSheet;
        return (
          <>
            <div className="hidden lg:contents">{desktopPanel}</div>
            <div className="contents lg:hidden" inert>
              {mobileSheet}
            </div>
          </>
        );
      })()}
    </div>
  );
}
