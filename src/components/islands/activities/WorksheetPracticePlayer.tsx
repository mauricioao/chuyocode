/**
 * WorksheetPracticePlayer — the learner's real, gradable worksheet view
 * (`/[lang]/ingles/actividades/[id]`, PR D "Activities practice"; rebuilt on
 * the CAMERA model in the "practice player redesign" pass). Wraps
 * `WorksheetPlayer` in its `practice` mode (see that component's own header)
 * with the one thing it does not own: ZOOM/PAN, reused directly from the
 * creator canvas' own camera math (`src/lib/activities/canvasViewport.ts` —
 * `fitCamera`, `zoomAt`, `panBy`, `clampCamera`, `stepZoomInput`,
 * `wheelZoomInput`) instead of a re-derived clamp. The OLD desktop model —
 * a plain `zoom` number driving a `width: N%` wrapper inside a horizontally
 * scrolling strip, via the narrower `clampZoom`/`stepZoom` pair — is fully
 * retired here: `stepZoom`/`clampZoom`/`FIT_ZOOM` are now dead in this file
 * (still exported/tested in `canvasViewport.ts` itself, same as `wheelZoom`
 * already was before this pass — see that file's own header).
 *
 * TWO INTERACTION MODELS, split at `lg` (mobile layout pass, unchanged by
 * this redesign): below `lg`, this mounts `WorksheetPracticePlayerMobile`
 * instead — a bounded, pinch/pan CAMERA viewport with a tap-to-open
 * per-zone bottom sheet (see that file's own header). `useIsDesktop()`
 * picks ONE of the two in JS (never a CSS-only `hidden lg:block` toggle) so
 * only one ever mounts — two copies would double every input's id/state.
 *
 * DESKTOP (rebuilt, practice player redesign): a BOUNDED, `overflow: hidden`
 * viewport — fills whatever height its flex ancestors give it (the active
 * tab's own body, in `ActivityPracticeIsland`) — with one child, the
 * content layer, always rendered at its own native (unscaled) size and
 * moved/scaled via a CSS `transform: translate(x, y) scale(scale)` driven by
 * `camera` state, exactly the shape `WorksheetZoneEditor.tsx`'s own canvas
 * already established. Starts in FIT on every mount (and `ActivityPracticeIsland`
 * remounts this component — `key={block.id}` — on every tab switch, which is
 * what gives "starts in FIT … on tab switch" for free, no special-case code
 * needed here). Wheel zooms around the pointer; a left-drag pans only while
 * the Mano/"hand" tool is active (or Space is held), matching the editor's
 * own tool convention — there is no drawing tool here to switch AWAY from,
 * so "hand off" simply leaves a left-drag to the browser (clicking into a
 * zone's own input focuses it normally); a middle-button drag always pans
 * regardless of tool.
 *
 * ZOOM CONTROLS LIVE IN THE TAB BAR (owner-approved design: "zoom controls
 * live in the tab bar's right side, only for worksheet tabs"), not in a
 * toolbar row of this component's own: `toolbarSlot` is a DOM node
 * `ActivityPracticeIsland` renders as part of its tab row
 * (`worksheet-zoom-slot`), and this component PORTALS its own −/Ajustar/+/Mano
 * buttons into it via `createPortal` — the camera state stays owned entirely
 * HERE (this is the only thing that ever mounts a camera for the currently
 * active worksheet tab), while the buttons that drive it simply render
 * somewhere else in the DOM. `toolbarSlot` is CSS-hidden below `lg` by its
 * own owner, so the portaled buttons never flash on a phone even during the
 * pre-hydration dual-render below.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { FrameCornersIcon } from '@phosphor-icons/react/dist/ssr/FrameCorners';
import { HandIcon } from '@phosphor-icons/react/dist/ssr/Hand';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { WorksheetBlock } from '@/lib/activities/blocks';
import {
  fitCamera,
  clampCamera,
  zoomAt,
  panBy,
  stepZoomInput,
  wheelZoomInput,
  rotatedSize,
  type Camera,
  type Size,
} from '@/lib/activities/canvasViewport';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useHydrated } from '@/hooks/useHydrated';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import WorksheetPlayer, { type WorksheetPracticeState } from './WorksheetPlayer';
import WorksheetPracticePlayerMobile from './WorksheetPracticePlayerMobile';

const IDENTITY_CAMERA: Camera = { scale: 1, x: 0, y: 0 };

export interface WorksheetPracticePlayerProps {
  lang: Lang;
  block: WorksheetBlock;
  imageUrl: string;
  practice: WorksheetPracticeState;
  /**
   * The tab bar's own zoom-controls slot — see the file header. Omitted
   * (or not yet attached) simply renders no zoom toolbar; the canvas itself
   * is still fully usable via wheel/drag either way. Ignored by the mobile
   * view.
   */
  toolbarSlot?: HTMLElement | null;
}

/** No drawing tool exists here (practice, not the editor) — "hand" is the only thing a left-drag can ever mean once active. */
type Tool = 'none' | 'hand';

function DesktopWorksheetCamera({
  lang,
  block,
  imageUrl,
  practice,
  toolbarSlot,
}: {
  lang: Lang;
  block: WorksheetBlock;
  imageUrl: string;
  practice: WorksheetPracticeState;
  toolbarSlot?: HTMLElement | null;
}) {
  const t = UI_LABELS[lang].activities.worksheet;
  const viewportRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>(IDENTITY_CAMERA);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startCamera: Camera } | null>(null);
  const spaceHeldRef = useRef(false);

  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [fitMode, setFitMode] = useState(true);
  const [tool, setTool] = useState<Tool>('none');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  cameraRef.current = camera;

  const rotation = block.rotation ?? 0;
  const displaySize = useMemo(
    () => rotatedSize(block.image, rotation),
    [block.image.width, block.image.height, rotation],
  );

  const viewportSize = useCallback((): Size => {
    const el = viewportRef.current;
    if (!el) return { width: 0, height: 0 };
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }, []);

  // Fit-on-mount (and on every resize while still in fit mode), same
  // `useLayoutEffect` + `ResizeObserver` shape as `WorksheetZoneEditor.tsx`'s
  // own canvas — see that file's header for why a plain mount effect isn't
  // enough (this viewport's own height is layout-driven, not a fixed CSS
  // value). A resize while the learner already zoomed/panned RE-CLAMPS their
  // camera instead of silently re-fitting it away.
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

  const applyZoom = useCallback(
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

  const zoomIn = useCallback(() => applyZoom(stepZoomInput(cameraRef.current.scale, 'in')), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(stepZoomInput(cameraRef.current.scale, 'out')), [applyZoom]);
  const zoomFit = useCallback(() => {
    setFitMode(true);
    setCamera(fitCamera(displaySize, viewportSize()));
  }, [displaySize, viewportSize]);

  // Wheel always zooms, in either tool — a native, non-passive listener:
  // React's synthetic wheel handler is attached passively and cannot
  // reliably `preventDefault` (same reasoning as the editor's own wheel
  // effect). No rAF batching here (unlike the editor's canvas, which also
  // has to keep a draw/resize drag smooth in the same frame budget): a
  // worksheet with no drawing tool has nothing else competing for the
  // frame, so applying each wheel event directly stays smooth.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = viewport!.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      applyZoom(wheelZoomInput(cameraRef.current.scale, e.deltaY), anchor);
    }
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  // Space temporarily forces pan mode regardless of the selected tool, same
  // convention as the editor's own Mano/Space handling — scoped to this
  // viewport itself (never global typing elsewhere on the page), released
  // on `keyup`/`blur` even if focus moved away meanwhile.
  const handleViewportKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' && !spaceHeldRef.current) {
      e.preventDefault();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    }
  }, []);

  useEffect(() => {
    function releaseSpace() {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    }
    function onWindowKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') releaseSpace();
    }
    window.addEventListener('keyup', onWindowKeyUp);
    window.addEventListener('blur', releaseSpace);
    return () => {
      window.removeEventListener('keyup', onWindowKeyUp);
      window.removeEventListener('blur', releaseSpace);
    };
  }, []);

  const effectiveTool: Tool = spaceHeld ? 'hand' : tool;

  const startPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startCamera: cameraRef.current };
    setIsPanning(true);
    setFitMode(false);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        // Middle-button drag always pans, in either tool.
        startPan(e);
        return;
      }
      if (e.button !== 0) return;
      if (effectiveTool === 'hand') startPan(e);
      // "none" tool: a left-drag is left alone entirely — clicking into a
      // zone's own input/select underneath focuses it normally.
    },
    [effectiveTool, startPan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      const next = panBy(drag.startCamera, dx, dy, { image: displaySize, viewport: viewportSize() });
      cameraRef.current = next;
      setCamera(next);
    },
    [displaySize, viewportSize],
  );

  const endPan = useCallback(() => {
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  return (
    <>
      <div
        ref={viewportRef}
        data-testid="practice-camera-viewport"
        tabIndex={0}
        onKeyDown={handleViewportKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        className={cn(
          'relative min-h-0 w-full flex-1 overflow-hidden rounded-lg bg-muted focus-visible:outline-none',
          effectiveTool === 'hand' && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
        )}
      >
        <div
          data-testid="practice-camera-content"
          className="absolute left-0 top-0"
          style={{
            width: displaySize.width,
            height: displaySize.height,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <WorksheetPlayer
            lang={lang}
            image={block.image}
            zones={block.zones}
            rotation={block.rotation}
            imageUrl={imageUrl}
            practice={practice}
          />
        </div>
      </div>

      {toolbarSlot &&
        createPortal(
          <div className="flex items-center gap-1" role="group" aria-label={t.zoomLevel}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.zoomOut}
              data-testid="practice-zoom-out"
              onClick={zoomOut}
            >
              <MinusIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t.zoomFit}
              data-testid="practice-zoom-fit"
              onClick={zoomFit}
            >
              <FrameCornersIcon aria-hidden="true" />
              {t.zoomFit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.zoomIn}
              data-testid="practice-zoom-in"
              onClick={zoomIn}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
            <Button
              type="button"
              variant={tool === 'hand' ? 'default' : 'ghost'}
              size="icon-sm"
              aria-pressed={tool === 'hand'}
              aria-label={t.toolHand}
              title={t.toolHandTooltip}
              data-testid="practice-tool-hand"
              onClick={() => setTool((prev) => (prev === 'hand' ? 'none' : 'hand'))}
            >
              <HandIcon aria-hidden="true" />
            </Button>
          </div>,
          toolbarSlot,
        )}
    </>
  );
}

export default function WorksheetPracticePlayer({ lang, block, imageUrl, practice, toolbarSlot }: WorksheetPracticePlayerProps) {
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();

  const desktopView = (
    <DesktopWorksheetCamera lang={lang} block={block} imageUrl={imageUrl} practice={practice} toolbarSlot={toolbarSlot} />
  );

  const mobileView = (
    <WorksheetPracticePlayerMobile lang={lang} block={block} imageUrl={imageUrl} practice={practice} />
  );

  // No-flash split (mobile layout pass, priority fix, unchanged by this
  // redesign): the desktop camera and the mobile pinch/pan camera are two
  // genuinely different subtrees, not a CSS-only toggle away from each
  // other. `isDesktop` alone defaults to `true` before hydration, so it used
  // to render the desktop structure on a phone's very first paint. `!hydrated`
  // (server render + the very first client paint) instead renders BOTH,
  // gated purely by CSS `lg:` classes — see `useHydrated`'s own header. The
  // mobile view is additionally `inert` there. Once `hydrated` is true, this
  // collapses to mounting only the one `isDesktop` says matches, same as
  // before.
  if (hydrated) return isDesktop ? desktopView : mobileView;
  return (
    <>
      <div className="hidden lg:contents">{desktopView}</div>
      <div className="contents lg:hidden" inert>
        {mobileView}
      </div>
    </>
  );
}
