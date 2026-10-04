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
 *  - Plain ZOOM helpers (`clampZoom`, `fitZoom`, `stepZoomInput`,
 *    `wheelZoomInput`, `contentSize`, `rotatedSize`, …) — a single number.
 *    `fitZoom`/`clampZoom` stay load-bearing (the narrower floor
 *    `fitCamera`/`clampCamera` clamp through — see their own headers) and
 *    `rotatedSize` is used everywhere a rotation exists. The original,
 *    narrower-floor `stepZoom`/`wheelZoom` are gone: superseded by
 *    `stepZoomInput`/`wheelZoomInput` once `WorksheetPracticePlayer.tsx`'s
 *    desktop view (their last caller) was rebuilt on the CAMERA family below,
 *    same as the editor's own toolbar — deleted outright once that redesign
 *    left them with no callers outside their own tests; git history has them
 *    if ever needed again.
 *  - The worksheet CREATOR canvas' own bounded CAMERA (`Camera`,
 *    `fitCamera`, `zoomAt`, `panBy`, `clampCamera`, `clampCameraLoose`,
 *    `screenToContentPoint`) —
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

/** The content box's rendered CSS pixel size at `zoom` — what the canvas' `style.width/height` are set to. */
export function contentSize(image: Size, zoom: number): Size {
  return { width: image.width * zoom, height: image.height * zoom };
}

/**
 * One step in `direction` from `zoom`, clamped to the WIDER
 * `[INPUT_MIN_ZOOM, MAX_ZOOM]` range (10%-400%) instead of the narrower
 * `[MIN_ZOOM, MAX_ZOOM]` {@link clampZoom} enforces (canvas camera pass,
 * owner-approved design: "unify the −/+ button clamp with the input").
 * Used by the worksheet CREATOR canvas' own −/+ buttons and wheel/keyboard
 * zoom, and by `WorksheetPracticePlayer.tsx`, so every zoom entry point
 * agrees on the same floor as the editable % field.
 */
export function stepZoomInput(zoom: number, direction: 'in' | 'out', step: number = ZOOM_STEP): number {
  return clampZoomInput(direction === 'in' ? zoom + step : zoom - step);
}

/**
 * The new zoom from an accumulated wheel `deltaY` (the caller batches every
 * `wheel` event that lands within the same animation frame into one call —
 * see `WorksheetZoneEditor.tsx`'s wheel listener) applied to `zoom`, clamped
 * to the wider `[INPUT_MIN_ZOOM, MAX_ZOOM]` range — see
 * {@link stepZoomInput}'s own header for why this module only keeps the
 * wider-floor pair now.
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
 * A camera-clamping policy — what {@link clampCamera} and
 * {@link clampCameraLoose} both are — threaded as an optional parameter
 * through {@link zoomAt}/{@link anchoredZoom}/{@link panBy} (editor camera UX
 * pass) so a caller can swap in a DIFFERENT bound for a SPECIFIC camera
 * change without those functions needing to know which policy exists or
 * duplicating their own anchor/translate math per policy. Every existing
 * caller that omits this parameter keeps getting {@link clampCamera} (the
 * strict, PRACTICE-player bound) exactly as before this pass.
 */
export type ClampCameraFn = (camera: Camera, image: Size, viewport: Size) => Camera;

/** {@link clampCameraLoose}'s own tuning — see its header for what each one bounds. */
export interface ClampCameraLooseOptions {
  /** Fraction of the CONTENT's own length, per axis, that must stay visible. Default `0.2` (20%). */
  minVisibleFraction?: number;
  /** The absolute floor, per axis, in CSS pixels — wins over the fraction for a small image. Default `80`. */
  minVisiblePx?: number;
}

const DEFAULT_MIN_VISIBLE_FRACTION = 0.2;
const DEFAULT_MIN_VISIBLE_PX = 80;

/**
 * One axis of {@link clampCameraLoose}: unlike {@link clampCameraAxis}
 * (which ALWAYS centers content that is `<=` the viewport, and otherwise only
 * lets an oversized image's own edge reach the viewport's edge — no further),
 * this allows the offset to range freely past either edge, bounded only so
 * that at least `visibleMin` CONTENT pixels stay inside the viewport on this
 * axis. `visibleMin` itself is capped at both `contentLength` and
 * `viewportLength` — a TINY image (smaller than the requested minimum) never
 * demands more of itself be visible than it actually has, and a TINY
 * viewport (smaller than the requested minimum) never demands more than the
 * viewport can ever show — which also keeps the returned `[min, max]` range
 * from ever inverting (see {@link clampCameraLoose}'s own header for the
 * proof): `visibleMin <= min(contentLength, viewportLength)`, so
 * `max - min = viewportLength + contentLength - 2 * visibleMin >= 0` always.
 */
function clampCameraLooseAxis(
  offset: number,
  viewportLength: number,
  contentLength: number,
  minVisibleFraction: number,
  minVisiblePx: number,
): number {
  const visibleMin = Math.min(
    Math.max(minVisibleFraction * contentLength, minVisiblePx),
    contentLength,
    viewportLength,
  );
  const min = visibleMin - contentLength;
  const max = viewportLength - visibleMin;
  return Math.min(max, Math.max(min, offset));
}

/**
 * The worksheet CREATOR EDITOR's own free-panning camera bound (creator
 * canvas UX follow-up, owner feedback: "when the whole sheet fits, the
 * camera centers and LOCKS it, so the author can't drag the sheet up to work
 * on its bottom corner — only zoomed in can it move"). {@link clampCamera}
 * (unchanged, still the PRACTICE player's own bound) always centers an axis
 * once content is `<=` the viewport, and otherwise only lets an oversized
 * image's own edge reach the viewport's edge; this instead lets the EDITOR
 * pan in every direction at ANY zoom — including while the whole image
 * already fits — bounded only so that at least `minVisibleFraction` of the
 * image (never less than `minVisiblePx`, and never more than the image or
 * viewport themselves allow) stays inside the viewport on each axis, so the
 * image can never be fully lost off screen. `scale` is clamped exactly like
 * {@link clampCamera} — the same unified 10%-400% camera range.
 *
 * Used as the `clamp` policy for `panBy`/`zoomAt`/`anchoredZoom` at the
 * editor's own pan/zoom entry points (wheel-zoom-around-the-pointer, the
 * Mano tool, a middle-button drag, and a Space-held drag) — see
 * `WorksheetZoneEditor.tsx`'s own header. `fitCamera`/"Ajustar" (and the `0`
 * key) stay on the STRICT bound — they are the one action that deliberately
 * re-centers, unaffected by this pass.
 */
export function clampCameraLoose(
  camera: Camera,
  image: Size,
  viewport: Size,
  options?: ClampCameraLooseOptions,
): Camera {
  const minVisibleFraction = options?.minVisibleFraction ?? DEFAULT_MIN_VISIBLE_FRACTION;
  const minVisiblePx = options?.minVisiblePx ?? DEFAULT_MIN_VISIBLE_PX;
  const scale = clampZoomInput(camera.scale);
  const content = contentSize(image, scale);
  return {
    scale,
    x: clampCameraLooseAxis(camera.x, viewport.width, content.width, minVisibleFraction, minVisiblePx),
    y: clampCameraLooseAxis(camera.y, viewport.height, content.height, minVisibleFraction, minVisiblePx),
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
export function zoomAt(
  camera: Camera,
  nextScale: number,
  point: Point,
  bounds: CameraBounds,
  clamp: ClampCameraFn = clampCamera,
): Camera {
  return anchoredZoom(camera, nextScale, point, point, bounds, clamp);
}

/**
 * The general form of {@link zoomAt} (mobile layout pass, for the two-finger
 * pinch gesture): zoom `camera` to `nextScale` while keeping the content
 * pixel that was under `anchorStart` (read against `camera` AS IT IS NOW)
 * displayed under `anchorCurrent` instead. `zoomAt` is the special case
 * `anchorStart === anchorCurrent` — nothing has moved since the last camera
 * change (a mouse wheel, a toolbar button, a typed %).
 *
 * A real pinch needs the general form: the gesture's own START midpoint is
 * `anchorStart`, its CURRENT midpoint (itself panned since the gesture
 * began, even on a pure two-finger pan with no scale change) is
 * `anchorCurrent` — calling `zoomAt(camera, nextScale, currentMidpoint,
 * bounds)` every move instead would silently drop the pan: `zoomAt` reads
 * the anchor's content pixel from the point it is GIVEN, not from where the
 * gesture actually started, so passing only the ever-moving current midpoint
 * re-derives (and re-fixes) a DIFFERENT content pixel on every single move.
 */
export function anchoredZoom(
  camera: Camera,
  nextScale: number,
  anchorStart: Point,
  anchorCurrent: Point,
  bounds: CameraBounds,
  clamp: ClampCameraFn = clampCamera,
): Camera {
  if (camera.scale <= 0) {
    return clamp({ ...camera, scale: nextScale }, bounds.image, bounds.viewport);
  }
  const contentX = (anchorStart.x - camera.x) / camera.scale;
  const contentY = (anchorStart.y - camera.y) / camera.scale;
  return clamp(
    { scale: nextScale, x: anchorCurrent.x - contentX * nextScale, y: anchorCurrent.y - contentY * nextScale },
    bounds.image,
    bounds.viewport,
  );
}

/** Translate `camera` by a pixel `(dx, dy)`, clamped like every other camera change via {@link clampCamera}. */
export function panBy(
  camera: Camera,
  dx: number,
  dy: number,
  bounds: CameraBounds,
  clamp: ClampCameraFn = clampCamera,
): Camera {
  return clamp({ ...camera, x: camera.x + dx, y: camera.y + dy }, bounds.image, bounds.viewport);
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
 * Pinch-gesture math (mobile layout pass), shared by the practice page's
 * worksheet viewer and the editor's canvas — both real, two-finger pinch and
 * two-finger pan. Two tiny primitives, not a "pinch camera" function of
 * their own: a pinch/pan gesture is already exactly what {@link zoomAt}
 * (scale about a point) and {@link panBy} (translate) already express, so
 * the caller derives a scale factor from {@link distanceBetween} and an
 * anchor from {@link midpoint}, then re-applies {@link zoomAt} from the
 * gesture's OWN starting camera every move — which anchors the zoom AND
 * tracks the two fingers' pan in one call, since `zoomAt` keeps whatever
 * point it is given fixed in content space regardless of how far that point
 * has itself moved since the gesture started.
 */

/** Straight-line distance between two viewport-relative points — the denominator of a pinch's scale factor. */
export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point exactly between two viewport-relative points — the anchor a pinch zooms/pans around. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * A fractional rect (`[0, 1]` on both axes, same shape as `zoneGeometry.ts`'s
 * `Rect`) — kept as a local, structurally-compatible type rather than an
 * import so this module stays dependency-free, matching its own header.
 */
export interface FractionalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The portion of `image` (already the rotated display size — see {@link
 * rotatedSize}) currently VISIBLE inside `viewport`, as a fractional rect —
 * keyboard zone creation's own anchor (`WorksheetZoneEditor.tsx`'s `Enter`/`N`
 * shortcut centers a new zone inside exactly this, so it always lands
 * somewhere the author can actually see, at any pan/zoom).
 *
 * The viewport's two corners (`(0, 0)` and its own width/height, in
 * VIEWPORT-relative pixels — the same space {@link screenToContentPoint}
 * expects) are converted into the content layer's native pixel space, then
 * clamped to `[0, image.width] x [0, image.height]` before being expressed as
 * fractions: at 100%+ zoom the whole viewport may sit inside the image (a
 * rect smaller than the full `[0, 1]` square), while at a zoom that fits the
 * whole image inside the viewport, the visible rect clamps back to the full
 * `[0, 1]` square (the image itself, not the empty margin around it).
 *
 * A non-positive image dimension (not yet laid out) returns the full `[0, 1]`
 * square rather than a `NaN`/`Infinity` rect.
 */
export function visibleImageRect(camera: Camera, image: Size, viewport: Size): FractionalRect {
  if (image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  const topLeft = screenToContentPoint({ x: 0, y: 0 }, camera);
  const bottomRight = screenToContentPoint({ x: viewport.width, y: viewport.height }, camera);

  const x0 = Math.min(Math.max(topLeft.x, 0), image.width);
  const y0 = Math.min(Math.max(topLeft.y, 0), image.height);
  const x1 = Math.min(Math.max(bottomRight.x, 0), image.width);
  const y1 = Math.min(Math.max(bottomRight.y, 0), image.height);

  return {
    x: x0 / image.width,
    y: y0 / image.height,
    w: Math.max(0, x1 - x0) / image.width,
    h: Math.max(0, y1 - y0) / image.height,
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
