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
export const ZONE_PADDING_FRACTION = 0.6;

/**
 * The padding floor, as a fraction of the whole PAGE size on that axis —
 * keeps a tiny zone (a checkbox, a single letter blank) from getting a
 * proportional padding so small it reads as no context at all.
 */
export const ZONE_PADDING_MIN_PAGE_FRACTION = 0.04;

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
