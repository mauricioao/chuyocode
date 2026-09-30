/**
 * WorksheetPracticePlayerMobile — the phone-width worksheet viewer (mobile
 * layout pass, highest-priority build: "practice page on a phone"). The
 * worksheet fits the screen width by default (camera-style fit, the exact
 * same math the creator canvas already uses —
 * `src/lib/activities/canvasViewport.ts`'s `fitCamera`/`clampCamera`), with
 * real two-finger pinch-to-zoom and two-finger pan on the image itself.
 * `WorksheetPracticePlayer.tsx` mounts this instead of its own desktop
 * toolbar+horizontal-scroll zoom once `useIsDesktop()` says the viewport is
 * narrower than `lg` — see that file's own header for the split.
 *
 * TINY ZONES PROBLEM (the reason this file exists at all): at fit scale a
 * worksheet's answer zones are too small to type into on a phone. Rather
 * than forcing the learner to zoom in first, tapping a zone opens a
 * `BottomSheet` with just that zone's own input (a text field, or its
 * choice options as large tap targets) plus "Anterior"/"Siguiente" to step
 * through every zone in READING order (`orderZonesForReading` —
 * top-to-bottom, left-to-right, not creation order) and "Listo" to close.
 * `WorksheetPlayer`'s `onZoneTap`/`activeZoneId` props (added for exactly
 * this) turn each zone into a tap target showing the current answer instead
 * of an inline input; desktop never passes those props, so nothing there
 * changes.
 *
 * GESTURE OWNERSHIP, one finger vs two: two fingers ALWAYS pinch/pan the
 * image (tracked in `pointersRef`, a plain `Map<pointerId, Point>` — no
 * state, gestures update the camera ref directly and only commit to React
 * state once per move, same "pure math, dumb component" split
 * `WorksheetZoneEditor.tsx` already uses for its own camera). ONE finger
 * only pans the image once already zoomed PAST fit (`!fitMode`) — at fit
 * scale there is nothing to reveal by panning, so a one-finger drag is left
 * alone entirely (no listener claims it, `touch-action` allows native
 * `pan-y`) and falls through to the page's own vertical scroll, exactly the
 * "one-finger vertical swipe outside a zoomed image must still scroll the
 * page" requirement. Once zoomed in, `touch-action: none` hands the whole
 * gesture (pan AND pinch) to this component's own pointer handlers instead.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { ImageRef, WorksheetBlock, Zone } from '@/lib/activities/blocks';
import {
  fitCamera,
  clampCamera,
  clampZoom,
  anchoredZoom,
  panBy,
  distanceBetween,
  midpoint,
  rotatedSize,
  type Camera,
  type Size,
  type Point,
} from '@/lib/activities/canvasViewport';
import { orderZonesForReading } from '@/lib/activities/zoneGeometry';
import BottomSheet from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import WorksheetPlayer, { type WorksheetPracticeState } from './WorksheetPlayer';

const IDENTITY_CAMERA: Camera = { scale: 1, x: 0, y: 0 };

/** Same "always has a real image at practice time" narrowing as `WorksheetPracticePlayer.tsx`'s own `SubmittedWorksheetBlock` — see that file's header. */
type SubmittedWorksheetBlock = WorksheetBlock & { image: ImageRef };

export interface WorksheetPracticePlayerMobileProps {
  lang: Lang;
  block: SubmittedWorksheetBlock;
  imageUrl: string;
  practice: WorksheetPracticeState;
}

type Gesture =
  | { kind: 'pinch'; startCamera: Camera; startDistance: number; startMid: Point }
  | { kind: 'pan'; startCamera: Camera; startClientX: number; startClientY: number };

export default function WorksheetPracticePlayerMobile({
  lang,
  block,
  imageUrl,
  practice,
}: WorksheetPracticePlayerMobileProps) {
  const t = UI_LABELS[lang].activities.player;
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<Gesture | null>(null);
  const cameraRef = useRef<Camera>(IDENTITY_CAMERA);

  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [fitMode, setFitMode] = useState(true);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
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

  // Same fit-on-mount-and-resize shape as `WorksheetZoneEditor.tsx`'s own
  // `useLayoutEffect` — see that file's header for why it must run before
  // paint and why a resize re-clamps (rather than silently re-fitting away)
  // a camera the learner already moved.
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

  const pointFromClient = useCallback((clientX: number, clientY: number): Point => {
    const el = viewportRef.current;
    const box = el?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: clientX - box.left, y: clientY - box.top };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.set(e.pointerId, pointFromClient(e.clientX, e.clientY));
      e.currentTarget.setPointerCapture?.(e.pointerId);

      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        gestureRef.current = {
          kind: 'pinch',
          startCamera: cameraRef.current,
          startDistance: distanceBetween(pts[0], pts[1]),
          startMid: midpoint(pts[0], pts[1]),
        };
      } else if (pointersRef.current.size === 1 && !fitMode) {
        gestureRef.current = {
          kind: 'pan',
          startCamera: cameraRef.current,
          startClientX: e.clientX,
          startClientY: e.clientY,
        };
      }
    },
    [pointFromClient, fitMode],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, pointFromClient(e.clientX, e.clientY));
      const gesture = gestureRef.current;
      if (!gesture) return;
      const bounds = { image: displaySize, viewport: viewportSize() };

      if (gesture.kind === 'pinch') {
        if (pointersRef.current.size < 2 || gesture.startDistance <= 0) return;
        const pts = Array.from(pointersRef.current.values()).slice(0, 2);
        const nextScale = clampZoom(
          gesture.startCamera.scale * (distanceBetween(pts[0], pts[1]) / gesture.startDistance),
        );
        const next = anchoredZoom(gesture.startCamera, nextScale, gesture.startMid, midpoint(pts[0], pts[1]), bounds);
        cameraRef.current = next;
        setCamera(next);
        setFitMode(false);
        return;
      }

      const dx = e.clientX - gesture.startClientX;
      const dy = e.clientY - gesture.startClientY;
      const next = panBy(gesture.startCamera, dx, dy, bounds);
      cameraRef.current = next;
      setCamera(next);
    },
    [pointFromClient, displaySize, viewportSize],
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    // Dropping below 2 fingers always ends a pinch (even if one finger
    // remains — resuming as a plain pan from mid-pinch is not a gesture
    // this component offers, matching the "true pointer physics stay a
    // manual/Playwright check" posture already established for the canvas).
    if (pointersRef.current.size < 2) gestureRef.current = null;
  }, []);

  const orderedZones = useMemo(() => orderZonesForReading(block.zones), [block.zones]);
  const activeIndex = orderedZones.findIndex((z) => z.id === activeZoneId);
  const activeZone: Zone | undefined = activeIndex >= 0 ? orderedZones[activeIndex] : undefined;

  const goToOffset = useCallback(
    (offset: number) => {
      const next = orderedZones[activeIndex + offset];
      if (next) setActiveZoneId(next.id);
    },
    [activeIndex, orderedZones],
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={viewportRef}
        data-testid="practice-mobile-viewport"
        className="relative w-full overflow-hidden rounded-lg bg-muted"
        style={{
          aspectRatio: `${displaySize.width} / ${displaySize.height}`,
          // See the file header's "Gesture ownership": at fit scale, a
          // single finger is left to the browser's own vertical scroll;
          // once zoomed in, this component owns the whole gesture.
          touchAction: fitMode ? 'pan-y' : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
      >
        <div
          data-testid="practice-mobile-content"
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
            onZoneTap={setActiveZoneId}
            activeZoneId={activeZoneId}
          />
        </div>
      </div>

      <BottomSheet
        open={activeZone !== undefined}
        onOpenChange={(open) => {
          if (!open) setActiveZoneId(null);
        }}
        title={
          activeZone
            ? `${t.zoneSheetTitle} — ${t.zoneOf} ${activeIndex + 1}/${orderedZones.length}`
            : t.zoneSheetTitle
        }
        testId="zone-sheet"
      >
        {activeZone && (
          <div className="flex flex-col gap-4">
            {activeZone.kind === 'text' ? (
              // D4 "Escuchar/Listen": the speak affordance sits next to the
              // input itself (owner-approved design) — the tap target
              // rendered behind this sheet stays a plain answer preview.
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  autoFocus
                  fieldSize="lg"
                  data-testid="zone-sheet-text-input"
                  aria-label={t.textPlaceholder}
                  placeholder={t.textPlaceholder}
                  value={practice.values[activeZone.id] ?? ''}
                  disabled={practice.disabled}
                  onChange={(e) => practice.onChange(activeZone.id, e.target.value)}
                  className="flex-1 text-base"
                />
                {activeZone.speak && <SpeakButton text={activeZone.speak} lang={lang} />}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {activeZone.speak && (
                  <div className="flex justify-end">
                    <SpeakButton text={activeZone.speak} lang={lang} />
                  </div>
                )}
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t.choicePlaceholder}>
                  {(activeZone.options ?? []).map((option) => {
                    const selected = practice.values[activeZone.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={practice.disabled}
                        data-testid={`zone-sheet-option-${option}`}
                        onClick={() => practice.onChange(activeZone.id, option)}
                        className={cn(
                          'min-h-11 w-full rounded-md border px-4 py-3 text-left text-base',
                          selected
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-background text-foreground',
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* D5 "¿Por qué?": only once graded AND only while THIS zone
                is incorrect — same gate as the desktop popover
                (`WorksheetPlayer.tsx`), shown here as a plain visible block
                under the input instead, since the sheet already IS the
                focused surface for this one zone. */}
            {activeZone.explanation && practice.results?.[activeZone.id] === false && (
              <div
                data-testid="zone-sheet-explanation"
                className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground"
              >
                <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-400">
                  <LightbulbIcon aria-hidden="true" weight="fill" />
                  <span>{t.explanationHeading}</span>
                </div>
                <p>{activeZone.explanation}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="zone-sheet-prev"
                disabled={activeIndex <= 0}
                onClick={() => goToOffset(-1)}
              >
                {t.zonePrev}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="zone-sheet-next"
                disabled={activeIndex < 0 || activeIndex >= orderedZones.length - 1}
                onClick={() => goToOffset(1)}
              >
                {t.zoneNext}
              </Button>
              <Button type="button" data-testid="zone-sheet-done" onClick={() => setActiveZoneId(null)}>
                {t.zoneDone}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
