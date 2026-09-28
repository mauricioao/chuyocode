/**
 * Pure zoom/pan math for the worksheet zone editor's canvas viewport (PR
 * "creator canvas UX"). Zero DOM, zero I/O — same posture as
 * `zoneGeometry.ts` right beside it: the component only translates real
 * `getBoundingClientRect()`/scroll reads into calls here, so the actual
 * arithmetic stays unit-testable without a real layout engine (jsdom has
 * none — see `WorksheetZoneEditor.test.tsx`'s own header).
 *
 * The canvas' content box is always rendered at `image.width * zoom` by
 * `image.height * zoom` CSS pixels inside a scrollable viewport; zone
 * fractions (`Rect` in `zoneGeometry.ts`) never change with zoom, because
 * every pointer coordinate the editor reads is already relative to that
 * content box's own `getBoundingClientRect()` — which reflects the zoom
 * automatically. Zoom math here is ONLY: how big to render the content box,
 * and where to scroll so a zoom stays anchored under the pointer.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ScrollOffset {
  left: number;
  top: number;
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
 * The scroll offset that keeps `pointer` (pixels from the VIEWPORT's own
 * top-left — i.e. a plain `clientX/Y` minus its `getBoundingClientRect()`,
 * never mind scrolling) anchored over the same content point after zooming
 * from `fromZoom` to `toZoom`, given the viewport's `scroll` offset before
 * the change.
 *
 * The pointer's content-space position is `(scroll + pointer) / fromZoom`
 * (content pixels, in the UNZOOMED image's own coordinate space); solving
 * `scroll' + pointer = contentPos * toZoom` for `scroll'` gives the formula
 * below. `fromZoom <= 0` is defensive only — it never happens once `zoom`
 * itself is always clamped to `MIN_ZOOM` — and returns `scroll` unchanged
 * rather than dividing by zero.
 */
export function zoomAroundPoint(
  pointer: Point,
  scroll: ScrollOffset,
  fromZoom: number,
  toZoom: number,
): ScrollOffset {
  if (fromZoom <= 0) return scroll;
  const contentX = (scroll.left + pointer.x) / fromZoom;
  const contentY = (scroll.top + pointer.y) / fromZoom;
  return {
    left: contentX * toZoom - pointer.x,
    top: contentY * toZoom - pointer.y,
  };
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

/**
 * The valid scroll range on ONE axis while actively panning: the content box
 * may be dragged until (at most) its far edge reaches the viewport's own
 * center, never further — past that point the pan gesture stops moving the
 * content rather than dragging it fully out of view. This is a DELIBERATELY
 * wider allowance than the browser's own native scrollable range (which for
 * content bigger than the viewport already prevents dragging it fully out —
 * this clamp is then a harmless no-op, since the native range is always the
 * tighter of the two); it only actually matters once the content is smaller
 * than the viewport on that axis (zoomed out below 100%), where there is no
 * native scrollable range at all and nothing would otherwise stop a pan
 * gesture from pushing the whole image arbitrarily far off-screen.
 */
export function clampPanAxis(scroll: number, viewportLength: number, contentLength: number): number {
  const center = viewportLength / 2;
  const min = -center;
  const max = contentLength - center;
  return Math.min(max, Math.max(min, scroll));
}

/** {@link clampPanAxis}, applied to both axes of a scroll offset at once. */
export function clampPanScroll(scroll: ScrollOffset, viewport: Size, content: Size): ScrollOffset {
  return {
    left: clampPanAxis(scroll.left, viewport.width, content.width),
    top: clampPanAxis(scroll.top, viewport.height, content.height),
  };
}

/** The content box's rendered CSS pixel size at `zoom` — what the canvas' `style.width/height` are set to. */
export function contentSize(image: Size, zoom: number): Size {
  return { width: image.width * zoom, height: image.height * zoom };
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
