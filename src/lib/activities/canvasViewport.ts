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
