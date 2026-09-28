/**
 * Pure zoom/pan/camera math for the worksheet zone editor's canvas viewport
 * (PR "creator canvas UX"; camera model added in the "canvas camera" pass).
 * Zero DOM, zero I/O — same posture as `zoneGeometry.ts` right beside it:
 * the component only translates real `getBoundingClientRect()` reads and
 * pointer events into calls here, so the actual arithmetic stays
 * unit-testable without a real layout engine (jsdom has none — see
 * `WorksheetZoneEditor.test.tsx`'s own header).
 *
 * Two families of exports live here:
 *  - Plain ZOOM helpers (`clampZoom`, `fitZoom`, `stepZoom`, `wheelZoom`,
 *    `contentSize`, `rotatedSize`, …) — a single number, reused as-is by
 *    `WorksheetPracticePlayer.tsx`'s own, deliberately simpler zoom model
 *    (see that component's own header).
 *  - The worksheet CREATOR canvas' own bounded CAMERA (`Camera`,
 *    `fitCamera`, `zoomAt`, `panBy`, `clampCamera`, `screenToContentPoint`) —
 *    `{ scale, x, y }` applied as a CSS `transform` on the content layer,
 *    replacing the older scroll-based viewport (native `scrollLeft`/`scrollTop`)
 *    this module used to also expose (`zoomAroundPoint`, `clampPanAxis`,
 *    `clampPanScroll` — removed once `WorksheetZoneEditor.tsx` fully migrated
 *    to the camera; git history has them if ever needed again).
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The zoom range every clamp/fit/step helper here enforces: 25%–400%. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** One click of the −/+ toolbar buttons, or one +/− keypress. */
export const ZOOM_STEP = 0.25;

/** Clamp a zoom factor to `[MIN_ZOOM, MAX_ZOOM]`, defaulting a non-finite value to 100%. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The WIDER floor the editable zoom % input accepts (owner-approved canvas
 * tools design: "clamp 10–400"), intentionally lower than {@link MIN_ZOOM}.
 * The −/+ toolbar buttons and every other caller of {@link clampZoom} keep
 * their existing 25% floor unchanged — including `WorksheetPracticePlayer.tsx`,
 * a different component that also imports `MIN_ZOOM`/`clampZoom` from here —
 * this only widens what typing a number directly into the % field accepts.
 */
export const INPUT_MIN_ZOOM = 0.1;

/** Clamp a zoom factor to `[INPUT_MIN_ZOOM, MAX_ZOOM]` for the editable % input. */
export function clampZoomInput(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(INPUT_MIN_ZOOM, zoom));
}

/**
 * Parses a user-typed zoom percentage ("80", "80%", "  80 %  ") into a plain
 * percentage number (`80`), or `null` when it isn't a usable number at all —
 * the caller reverts to the last-applied value on `null` rather than
 * guessing. Deliberately permissive about a trailing "%" and surrounding
 * whitespace; anything else non-numeric (empty, "abc") is `null`.
 */
export function parseZoomPercentInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/%\s*$/, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * The zoom that fits `content` entirely inside `viewport` on both axes
 * ("Ajustar"/"Fit", and the editor's default view). A non-positive
 * dimension on either side (not yet laid out — jsdom, or a not-yet-loaded
 * image) returns 100% rather than a `NaN`/`Infinity` zoom.
 */
export function fitZoom(viewport: Size, content: Size): number {
  if (viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) {
    return 1;
  }
  return clampZoom(Math.min(viewport.width / content.width, viewport.height / content.height));
}

/** One step in `direction` from `zoom`, clamped like every other zoom change here. */
export function stepZoom(zoom: number, direction: 'in' | 'out', step: number = ZOOM_STEP): number {
  return clampZoom(direction === 'in' ? zoom + step : zoom - step);
}

/**
 * Wheel-zoom tuning (canvas tools pass): the fraction of the CURRENT zoom
 * applied per accumulated `deltaY` pixel, and the largest zoom-factor change
 * one batched animation frame may apply. Proportional to the current zoom
 * (not a flat step) so the same physical wheel motion feels equally fast at
 * 25% and at 400%; the per-frame cap keeps a fast trackpad fling from
 * jumping several zoom levels in a single frame.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;
export const MAX_WHEEL_ZOOM_STEP = 0.5;

/**
 * The new zoom from an accumulated wheel `deltaY` (the caller batches every
 * `wheel` event that lands within the same animation frame into one call
 * here, instead of applying each event immediately — see
 * `WorksheetZoneEditor.tsx`'s wheel listener) applied to `zoom`, clamped like
 * every other zoom change in this module.
 */
export function wheelZoom(zoom: number, deltaY: number): number {
  const rawStep = -deltaY * WHEEL_ZOOM_SENSITIVITY * zoom;
  const step = Math.max(-MAX_WHEEL_ZOOM_STEP, Math.min(MAX_WHEEL_ZOOM_STEP, rawStep));
  return clampZoom(zoom + step);
}

/** The content box's rendered CSS pixel size at `zoom` — what the canvas' `style.width/height` are set to. */
export function contentSize(image: Size, zoom: number): Size {
  return { width: image.width * zoom, height: image.height * zoom };
}

/**
 * {@link stepZoom}, but clamped to the WIDER `[INPUT_MIN_ZOOM, MAX_ZOOM]`
 * range (10%-400%) instead of `[MIN_ZOOM, MAX_ZOOM]` (canvas camera pass,
 * owner-approved design: "unify the −/+ button clamp with the input").
 * `stepZoom` itself stays UNCHANGED — `WorksheetPracticePlayer.tsx` still
 * uses it directly and keeps its own, narrower 25% floor; this is a
 * DIFFERENT/ADDITIONAL export the worksheet CREATOR canvas' own −/+ buttons
 * and wheel/keyboard zoom switch to instead, so every zoom entry point in
 * that one editor agrees on the same floor as its editable % field.
 */
export function stepZoomInput(zoom: number, direction: 'in' | 'out', step: number = ZOOM_STEP): number {
  return clampZoomInput(direction === 'in' ? zoom + step : zoom - step);
}

/**
 * {@link wheelZoom}, but clamped to the wider `[INPUT_MIN_ZOOM, MAX_ZOOM]`
 * range — see {@link stepZoomInput}'s own header for why this is a sibling
 * export rather than a change to `wheelZoom` itself.
 */
export function wheelZoomInput(zoom: number, deltaY: number): number {
  const rawStep = -deltaY * WHEEL_ZOOM_SENSITIVITY * zoom;
  const step = Math.max(-MAX_WHEEL_ZOOM_STEP, Math.min(MAX_WHEEL_ZOOM_STEP, rawStep));
  return clampZoomInput(zoom + step);
}

/**
 * The worksheet creator canvas' CAMERA (canvas camera pass — replaces
 * scroll-based panning): `scale` is the same zoom factor every function
 * above already works with; `x`/`y` are the CSS pixel offset applied as
 * `transform: translate(x, y) scale(scale)` (`transform-origin: 0 0`) to the
 * image+zones layer, which itself always renders at its CONTENT-native size
 * (`image`/`rotatedSize(...)`'s own width/height, never multiplied by
 * `scale` — the CSS transform is the only thing that scales it visually).
 * Every point the caller reads off `getBoundingClientRect()` for pointer
 * math must be relative to the (untransformed, bounded, `overflow: hidden`)
 * VIEWPORT, never to this transformed layer itself — see
 * {@link screenToContentPoint}.
 */
export interface Camera {
  scale: number;
  x: number;
  y: number;
}

/** `image`/`viewport` bounds a camera is clamped against — see {@link clampCamera}. */
export interface CameraBounds {
  image: Size;
  viewport: Size;
}

/**
 * Clamp one axis of a camera offset against `viewportLength`/`contentLength`
 * (the scaled content size on that axis): when the content is smaller than
 * (or equal to) the viewport, it is CENTERED regardless of the proposed
 * offset; when it is larger, the offset is clamped so the content's near
 * edge can reach the viewport's near edge and no further — every corner of
 * an oversized image stays reachable, with no empty overshoot past either
 * edge (a DELIBERATELY tighter allowance than the old scroll-based
 * `clampPanAxis`, which let a pan continue until the content's FAR edge
 * merely reached the viewport's own center).
 */
function clampCameraAxis(offset: number, viewportLength: number, contentLength: number): number {
  if (contentLength <= viewportLength) return (viewportLength - contentLength) / 2;
  const min = viewportLength - contentLength;
  return Math.min(0, Math.max(min, offset));
}

/**
 * The camera every other camera helper below re-clamps its result through:
 * `scale` clamped to `[INPUT_MIN_ZOOM, MAX_ZOOM]` (the unified 10%-400%
 * camera range — see {@link stepZoomInput}'s header), `x`/`y` clamped per
 * axis via {@link clampCameraAxis} using the CONTENT size at that (already
 * clamped) scale. Called after every zoom, pan, AND on a viewport/image
 * resize while NOT in fit mode (re-clamping the user's own camera instead of
 * silently re-fitting it away — see `WorksheetZoneEditor.tsx`'s own resize
 * effect).
 */
export function clampCamera(camera: Camera, image: Size, viewport: Size): Camera {
  const scale = clampZoomInput(camera.scale);
  const content = contentSize(image, scale);
  return {
    scale,
    x: clampCameraAxis(camera.x, viewport.width, content.width),
    y: clampCameraAxis(camera.y, viewport.height, content.height),
  };
}

/**
 * The camera that shows the WHOLE `image` (already the rotated display
 * size — see `rotatedSize`) centered inside `viewport` — "Ajustar"/Fit, and
 * the editor's default view. Reuses {@link fitZoom}'s own scale (its
 * narrower `[MIN_ZOOM, MAX_ZOOM]` clamp is intentional here too: FIT is a
 * derived/automatic camera, not a manual zoom action, so it keeps the more
 * conservative floor rather than the wider one manual zoom gets), then
 * clamps through {@link clampCamera} — which, for a scale that fits the
 * whole image, always centers both axes, so the `x`/`y` passed in here
 * don't matter.
 */
export function fitCamera(image: Size, viewport: Size): Camera {
  const scale = fitZoom(viewport, image);
  return clampCamera({ scale, x: 0, y: 0 }, image, viewport);
}

/**
 * Zoom `camera` to `nextScale` (already computed and clamped by the caller —
 * {@link stepZoomInput}, {@link wheelZoomInput}, or a typed %) while keeping
 * `point` (VIEWPORT-relative pixels, e.g. `clientX/Y` minus the viewport's
 * own `getBoundingClientRect()`) visually anchored to the same content
 * pixel — the direct camera-space analogue of the old scroll-based
 * `zoomAroundPoint`. `camera.scale <= 0` is defensive only (every camera
 * this module hands back already has a positive, clamped scale) and skips
 * the anchor math rather than dividing by zero. The result is always
 * re-clamped via {@link clampCamera}, so zooming OUT past the point where
 * the content becomes smaller than the viewport re-centers it instead of
 * leaving it pinned to a now-stale anchor.
 */
export function zoomAt(camera: Camera, nextScale: number, point: Point, bounds: CameraBounds): Camera {
  if (camera.scale <= 0) {
    return clampCamera({ ...camera, scale: nextScale }, bounds.image, bounds.viewport);
  }
  const contentX = (point.x - camera.x) / camera.scale;
  const contentY = (point.y - camera.y) / camera.scale;
  return clampCamera(
    { scale: nextScale, x: point.x - contentX * nextScale, y: point.y - contentY * nextScale },
    bounds.image,
    bounds.viewport,
  );
}

/** Translate `camera` by a pixel `(dx, dy)`, clamped like every other camera change via {@link clampCamera}. */
export function panBy(camera: Camera, dx: number, dy: number, bounds: CameraBounds): Camera {
  return clampCamera({ ...camera, x: camera.x + dx, y: camera.y + dy }, bounds.image, bounds.viewport);
}

/**
 * Convert a point given relative to the camera's own (untransformed,
 * bounded) VIEWPORT — e.g. `clientX/Y` minus the viewport's own
 * `getBoundingClientRect()` — into the CONTENT layer's own native,
 * unscaled pixel space: the same units `zoneGeometry.ts`'s rect helpers
 * already work in when given the image's plain `Size` (`rotatedSize(...)`'s
 * own width/height), at ANY camera scale/offset. This is how
 * `WorksheetZoneEditor.tsx` turns a pointer event into the coordinates it
 * hands to `rectFromDrag`/`moveRect`/`resizeRect`, instead of reading the
 * (CSS-transformed) content layer's own `getBoundingClientRect()` — which
 * real browsers DO reflect transforms in, but relying on it would still
 * couple every drag/resize test to a transform-aware DOM mock jsdom cannot
 * provide; going through the camera's own numbers directly needs only the
 * viewport's (untransformed) rect and the camera state, both already
 * mocked/asserted elsewhere in this codebase's own precedent.
 */
export function screenToContentPoint(point: Point, camera: Camera): Point {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}

/** The exact inverse of {@link screenToContentPoint}. */
export function contentToScreenPoint(point: Point, camera: Camera): Point {
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}

/**
 * The DISPLAYED size of an image once a worksheet's `rotation` (creator
 * polish round 2) is applied: a quarter turn (90/270) swaps width and
 * height, a half turn (180) or no turn (0) does not. Every caller that lays
 * out the canvas — `fitZoom`, `contentSize` — must use THIS size, not the
 * image's own raw `width`/`height`, once rotation is in play.
 */
export function rotatedSize(image: Size, rotation: 0 | 90 | 180 | 270): Size {
  return rotation === 90 || rotation === 270
    ? { width: image.height, height: image.width }
    : { width: image.width, height: image.height };
}
