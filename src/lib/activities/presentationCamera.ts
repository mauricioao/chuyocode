/**
 * presentationCamera — pure camera math for presentation mode's worksheet
 * zoom tour (sprint week 3, "worksheet zoom tour in presentation mode").
 *
 * `{ scale, x, y }`, applied as `transform: translate(x, y) scale(scale)`
 * (`transform-origin: 0 0`) to the worksheet image layer — the exact same
 * transform SHAPE `WorksheetZoneEditor.tsx`'s own camera already uses
 * (`canvasViewport.ts`'s `Camera`). This is deliberately a NEW, independent
 * module rather than an addition to that one: `canvasViewport.ts`,
 * `WorksheetZoneEditor.tsx` and `WorksheetPracticePlayer.tsx` stay untouched
 * to avoid merge conflicts with a parallel branch also working in this area
 * — every helper below is new math, imports nothing from those three files,
 * and only reuses plain, already-exported types/values freely (`Zone` from
 * `blocks.ts`).
 *
 * FRAMING ONE ZONE ({@link cameraForZone}): the zone (its own fractional
 * `[0, 1]` coordinates, resolved against the worksheet PAGE's own pixel
 * size — already the ROTATED display size, same space `blocks.ts` stores
 * zones in) is padded on every side for comfortable context —
 * proportional to the zone's own size, floored by a small fraction of the
 * whole page so even a tiny zone still shows real surroundings rather than
 * an imperceptible sliver (see {@link framedRect}) — then that padded frame
 * is fit entirely inside the `stage` box (the smaller of the two axis
 * ratios, same letterboxed-never-cropped posture as `fitStage.ts`), clamped
 * to {@link MAX_ZONE_CAMERA_ZOOM} so a very small zone never blows up into an
 * illegibly pixelated, context-free crop.
 *
 * EDGE ZONES: once the fit scale is known, the camera centers the ZONE
 * itself (not the frame) at the stage's own center, then {@link clampAxis}
 * pulls it back on each axis so the page never shows empty space past its
 * own edge — a zone near a corner ends up showing the maximum context
 * actually available on that side instead. Same edge-reachable-no-further
 * rule `canvasViewport.ts`'s `clampCamera` already applies to the editor's
 * camera, reimplemented here in six lines rather than imported, so this
 * module has zero dependency on that file (see this header's own note
 * above) and stays independently pure/testable.
 *
 * {@link cameraForPage} is the OVERVIEW slide's own camera: the whole page
 * centered inside `stage`, unclamped (a worksheet photo can be much higher
 * resolution than the stage, needing a scale under any ordinary "25%-400%"
 * UI zoom floor just to fit at all — reusing `canvasViewport.ts`'s own
 * `fitZoom`/`clampZoom` would silently misfit it) — same unclamped posture
 * `fitStage.ts`'s own `fitStage` already uses for "the stage inside the
 * viewport".
 */
import type { Zone } from './blocks';
import { clampRect, type Rect } from './zoneGeometry';

export interface Size {
  width: number;
  height: number;
}

/** A camera applied as `transform: translate(x, y) scale(scale)` (`transform-origin: 0 0`) to the worksheet image layer, which itself always renders at its own native/rotated pixel size. */
export interface Camera {
  scale: number;
  x: number;
  y: number;
}

/** Context padding around a framed zone, as a fraction of the zone's OWN size on that axis. */
const ZONE_PADDING_FRACTION = 0.6;

/**
 * The padding floor, as a fraction of the whole PAGE size on that axis —
 * keeps a tiny zone (a checkbox, a single letter blank) from getting a
 * proportional padding so small it reads as no context at all.
 */
const ZONE_PADDING_MIN_PAGE_FRACTION = 0.04;

/**
 * The most a zone-focused camera may ever zoom in, relative to the page's
 * own native pixel size (`3` means every page pixel renders three times as
 * large on the stage). A zone small enough that framing it with full
 * padding would need to go past this is shown at this ceiling instead —
 * still comfortably centered, just with less than the usual padding. See
 * {@link zoneCameraZoom} for the UNCLAMPED figure the "Listo para enviar"
 * checklist's own projection warning compares against it
 * (`presentationSlides.ts`'s `listProjectionWarnings`).
 */
export const MAX_ZONE_CAMERA_ZOOM = 3;

/**
 * Clamp one axis of a camera offset so `contentLength` (the page at the
 * camera's own scale) never shows empty space past either edge of
 * `stageLength` — mirrors the edge-reachable-no-further rule
 * `canvasViewport.ts`'s own `clampCamera` applies to the editor's camera,
 * kept as a small LOCAL, independent helper so this module imports nothing
 * from that file (see this file's own header).
 */
function clampAxis(offset: number, stageLength: number, contentLength: number): number {
  if (contentLength <= stageLength) return (stageLength - contentLength) / 2;
  const min = stageLength - contentLength;
  return Math.min(0, Math.max(min, offset));
}

interface FramedRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** `zone`, resolved to `page`'s own native pixel space and padded for comfortable context — see this module's own header. */
function framedRect(zone: Zone, page: Size): FramedRect {
  const zoneWidthPx = zone.w * page.width;
  const zoneHeightPx = zone.h * page.height;
  const padX = Math.max(zoneWidthPx * ZONE_PADDING_FRACTION, page.width * ZONE_PADDING_MIN_PAGE_FRACTION);
  const padY = Math.max(zoneHeightPx * ZONE_PADDING_FRACTION, page.height * ZONE_PADDING_MIN_PAGE_FRACTION);
  return {
    centerX: (zone.x + zone.w / 2) * page.width,
    centerY: (zone.y + zone.h / 2) * page.height,
    width: zoneWidthPx + 2 * padX,
    height: zoneHeightPx + 2 * padY,
  };
}

/** Is `page`/`stage` both laid out (positive on both axes)? Guards every function below against a `NaN`/`Infinity` result from an unmeasured size — jsdom, or a ref read before first paint. */
function isLaidOut(page: Size, stage: Size): boolean {
  return page.width > 0 && page.height > 0 && stage.width > 0 && stage.height > 0;
}

/**
 * The zoom {@link cameraForZone} would need to fit `zone`'s own padded frame
 * entirely inside `stage`, WERE IT NOT clamped to {@link MAX_ZONE_CAMERA_ZOOM}
 * — i.e. how far in the camera actually wants to go before that ceiling
 * applies. `1` for a non-positive `page`/`stage` dimension, same defensive
 * default as `fitStage`/`fitZoom`.
 */
export function zoneCameraZoom(zone: Zone, page: Size, stage: Size): number {
  if (!isLaidOut(page, stage)) return 1;
  const frame = framedRect(zone, page);
  if (!(frame.width > 0) || !(frame.height > 0)) return 1;
  return Math.min(stage.width / frame.width, stage.height / frame.height);
}

/**
 * Whether framing `zone` the normal, comfortable way would need MORE zoom
 * than {@link MAX_ZONE_CAMERA_ZOOM} allows — the "Listo para enviar"
 * checklist's own projection-warning trigger (owner spec: "a worksheet zone
 * so small that its framed view would exceed a sane max zoom").
 */
export function zoneExceedsMaxZoom(zone: Zone, page: Size, stage: Size): boolean {
  return zoneCameraZoom(zone, page, stage) > MAX_ZONE_CAMERA_ZOOM;
}

/**
 * The camera that frames `zone` (fractional `[0, 1]` coordinates, relative
 * to `page`) centered inside `stage` with comfortable context padding — see
 * this module's own header. The neutral `{ scale: 1, x: 0, y: 0 }` for a
 * non-positive `page`/`stage` dimension, same defensive default as
 * `fitStage`/`fitZoom`.
 */
export function cameraForZone(zone: Zone, page: Size, stage: Size): Camera {
  if (!isLaidOut(page, stage)) return { scale: 1, x: 0, y: 0 };

  const frame = framedRect(zone, page);
  const rawScale =
    frame.width > 0 && frame.height > 0
      ? Math.min(stage.width / frame.width, stage.height / frame.height)
      : 1;
  const scale = Math.min(rawScale, MAX_ZONE_CAMERA_ZOOM);

  const x = stage.width / 2 - frame.centerX * scale;
  const y = stage.height / 2 - frame.centerY * scale;
  return {
    scale,
    x: clampAxis(x, stage.width, page.width * scale),
    y: clampAxis(y, stage.height, page.height * scale),
  };
}

/**
 * The camera that fits the WHOLE `page` centered inside `stage` — the
 * worksheet's overview slide (owner spec: "whole page fitted inside the
 * 16:9 stage's safe area"). Unclamped (no "25%-400%" style floor/ceiling) —
 * see this module's own header for why reusing `canvasViewport.ts`'s own
 * zoom clamp would be wrong here. The neutral `{ scale: 1, x: 0, y: 0 }` for
 * a non-positive `page`/`stage` dimension, same defensive default as
 * `fitStage`/`fitZoom`.
 */
export function cameraForPage(page: Size, stage: Size): Camera {
  if (!isLaidOut(page, stage)) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min(stage.width / page.width, stage.height / page.height);
  return {
    scale,
    x: (stage.width - page.width * scale) / 2,
    y: (stage.height - page.height * scale) / 2,
  };
}

/**
 * LEGIBILITY (owner review, "Antes de proyectar"). An earlier version of
 * this check measured whether a zone needed more than {@link
 * MAX_ZONE_CAMERA_ZOOM} to FILL the stage — rejected: a blank never needs
 * to FILL the stage, it needs to stay LEGIBLE once the camera has zoomed
 * in as far as it is ever allowed to. This section measures exactly that:
 * the zone's own real on-screen height, in pixels, at a representative
 * classroom-projector resolution, once the per-zone camera has applied the
 * most zoom it is ever allowed to apply.
 *
 * {@link LEGIBILITY_REFERENCE_VIEWPORT} (1280x720) is the reference
 * resolution this is calibrated against — a common, modest classroom
 * projector. The real presentation stage always fits the SAME 1920x1080
 * virtual canvas into whatever the actual screen reports (`fitStage.ts`),
 * uniformly, so a real viewport only ever shrinks/grows every rendered
 * pixel by one extra uniform factor relative to this reference — the
 * reference choice itself does not change WHICH zones are legible, only
 * how literally "pixels" reads below.
 *
 * {@link pageFitScale} is the same "smaller of the two axis ratios,
 * letterboxed" rule `fitStage.ts`'s own `fitStage` applies to the STAGE
 * itself, applied instead to the PAGE directly against the reference
 * viewport — the page's own baseline, UNZOOMED scale once presented.
 * Composing "page fit to the 1920x1080 stage" with "stage fit to the real
 * viewport" gives the exact same number, because the stage and {@link
 * LEGIBILITY_REFERENCE_VIEWPORT} share the stage's own 16:9 aspect ratio
 * (the two fits multiply out to one direct page-to-viewport fit) — this
 * skips the intermediate stage entirely rather than re-deriving it.
 *
 * {@link zoneHeightAtMaxZoomPx} is the WORST CASE a presenter would ever
 * see a zone rendered at: `zoneHeightFraction` (the zone's own `h`) times
 * the page's native pixel height, times {@link pageFitScale} (the page's
 * own baseline scale), times {@link MAX_ZONE_CAMERA_ZOOM} (the most extra
 * zoom-in the per-zone camera is ever allowed beyond that baseline). A
 * zone whose NATURAL zoom need is under the cap renders even BIGGER than
 * this (the camera is free to zoom in further) — so this is always a safe
 * lower bound, never an overstatement.
 *
 * WORKED EXAMPLE (owner review): a 1700x2200 page fit into a 1280x720
 * viewport scales by `min(1280/1700, 720/2200)` ≈ 0.327. An ordinary
 * one-line fill-in-the-blank, `h = 0.03` (66px of the page's own native
 * height), renders at ≈ 66 × 0.327 ≈ 21.6px UNZOOMED, and ≈ 21.6 × 3 ≈
 * 65px at the camera's zoom ceiling — comfortably legible from the back
 * of a classroom, and nowhere near {@link MIN_LEGIBLE_ZONE_HEIGHT_PX}.
 * Only a zone far smaller than an ordinary blank (roughly `h < 0.013` on
 * this exact page) ever trips {@link isZoneTooSmallToProject} below.
 */
export const LEGIBILITY_REFERENCE_VIEWPORT: Size = { width: 1280, height: 720 };

/**
 * The legibility floor itself, in REAL screen pixels at {@link
 * LEGIBILITY_REFERENCE_VIEWPORT} — roughly the height of a comfortable
 * line of body text projected across a classroom (24-32px is the common
 * rule of thumb for "readable from the back of the room" projected text;
 * 28 sits in the middle of that range). Below this, a zone reads as a
 * hairline rather than a legible answer slot, regardless of how it got
 * that small.
 */
export const MIN_LEGIBLE_ZONE_HEIGHT_PX = 28;

/**
 * The scale at which `page` fits entirely inside `viewport` (the smaller
 * of the two axis ratios, letterboxed — same rule `fitStage.ts`'s
 * `fitStage` applies to the STAGE) — see this section's own header for why
 * this skips the intermediate 1920x1080 stage. `1` for a non-positive
 * `page`/`viewport` dimension, same defensive default as every other
 * function in this file.
 */
export function pageFitScale(page: Size, viewport: Size): number {
  if (!(page.width > 0) || !(page.height > 0) || !(viewport.width > 0) || !(viewport.height > 0)) return 1;
  return Math.min(viewport.width / page.width, viewport.height / page.height);
}

/** The zone's own worst-case rendered height, in real `viewport` pixels, at the camera's hard zoom ceiling — see this section's own header. */
export function zoneHeightAtMaxZoomPx(
  zoneHeightFraction: number,
  page: Size,
  viewport: Size = LEGIBILITY_REFERENCE_VIEWPORT,
): number {
  return zoneHeightFraction * page.height * pageFitScale(page, viewport) * MAX_ZONE_CAMERA_ZOOM;
}

/**
 * Is a zone of `zoneHeightFraction` (its own `h`) too small to stay
 * legible even at the camera's zoom ceiling? The "Antes de proyectar"
 * dialog warning's (`presentationSlides.ts`'s `listProjectionWarnings`)
 * and the editor's own on-canvas marker's (`WorksheetZoneEditor.tsx`)
 * single source of truth — see this section's own header for the
 * calibration.
 */
export function isZoneTooSmallToProject(
  zoneHeightFraction: number,
  page: Size,
  viewport: Size = LEGIBILITY_REFERENCE_VIEWPORT,
): boolean {
  return zoneHeightAtMaxZoomPx(zoneHeightFraction, page, viewport) < MIN_LEGIBLE_ZONE_HEIGHT_PX;
}

/**
 * The smallest `h` (fraction of `page`'s own height) that clears {@link
 * MIN_LEGIBLE_ZONE_HEIGHT_PX} at the camera's zoom ceiling — the exact
 * inverse of {@link zoneHeightAtMaxZoomPx}, converted to PAGE units for
 * THIS specific page (legibility is a real-pixel concern, so there is no
 * single page-size-independent fraction that works for every worksheet —
 * see `zoneGeometry.ts`'s own note on the flat floor this replaced). `0`
 * for a non-positive `page` dimension or scale (never a `NaN`/`Infinity`
 * floor that could propagate into a drawn zone).
 */
export function minLegibleZoneHeightFraction(page: Size, viewport: Size = LEGIBILITY_REFERENCE_VIEWPORT): number {
  const scale = page.height * pageFitScale(page, viewport) * MAX_ZONE_CAMERA_ZOOM;
  return scale > 0 ? MIN_LEGIBLE_ZONE_HEIGHT_PX / scale : 0;
}

/**
 * Grow `rect`'s own `h` up to {@link minLegibleZoneHeightFraction} for
 * `page` if it needs it, keeping its own vertical CENTER fixed, then
 * re-clamped inside `[0, 1]` (`zoneGeometry.ts`'s `clampRect`) — only `h`
 * moves: this is a legibility fix, not a general resize, and width plays
 * no part in the legibility math above. Shared by the creation-time floor
 * (`WorksheetZoneEditor.tsx`'s draw/keyboard-create/resize) and the submit
 * dialog's "Agrandar las zonas chicas" bulk fix ({@link
 * growSmallZonesToLegibleHeight} below). A rect already legible is
 * returned UNCHANGED (no needless `clampRect` round-trip, no surprise
 * nudge for an already-fine zone).
 */
export function ensureLegibleZoneHeight(
  rect: Rect,
  page: Size,
  viewport: Size = LEGIBILITY_REFERENCE_VIEWPORT,
): Rect {
  const minH = minLegibleZoneHeightFraction(page, viewport);
  if (rect.h >= minH) return rect;
  const cy = rect.y + rect.h / 2;
  return clampRect({ x: rect.x, y: cy - minH / 2, w: rect.w, h: minH });
}

/**
 * {@link ensureLegibleZoneHeight}, applied to every zone in `rects` that is
 * below the floor for `page` — the submit dialog's "Agrandar las zonas
 * chicas" action: every small zone grows to the minimum at once, as the
 * caller's own single state update (one undo step), while a zone already
 * legible keeps its exact original object (so an unrelated zone's
 * reference/answers never appear to change). Generic over `T extends Rect`
 * so it accepts a real `Zone[]` (extra fields like `id`/`answers`
 * preserved), same posture as `zoneGeometry.ts`'s own `rotateRects`.
 */
export function growSmallZonesToLegibleHeight<T extends Rect>(
  rects: T[],
  page: Size,
  viewport: Size = LEGIBILITY_REFERENCE_VIEWPORT,
): T[] {
  return rects.map((rect) =>
    isZoneTooSmallToProject(rect.h, page, viewport)
      ? { ...rect, ...ensureLegibleZoneHeight(rect, page, viewport) }
      : rect,
  );
}
