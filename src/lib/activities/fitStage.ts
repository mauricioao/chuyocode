/**
 * fitStage — pure virtual-stage geometry for Presentation mode v1
 * ("Preguntas", presentation mode pass).
 *
 * Every slide is authored against a FIXED 1920x1080 canvas (the "stage"),
 * independent of whatever the teacher's actual screen/projector reports —
 * same reasoning `canvasViewport.ts`'s own camera gives the worksheet editor:
 * one fixed coordinate space is unit-testable without a real layout engine
 * (jsdom has none), and every slide's own sizing (prompt/options/secondary
 * text) is authored once, in stage pixels, rather than re-derived per
 * viewport. {@link fitStage} is the ONE place that maps a real viewport size
 * to the `scale`/`offsetX`/`offsetY` a caller applies as a CSS
 * `transform: translate(offsetX, offsetY) scale(scale)` (`transform-origin:
 * 0 0`) on the stage element — the exact transform shape
 * `WorksheetZoneEditor.tsx`'s camera already uses, just without panning.
 *
 * LETTERBOXED, NEVER CROPPED: the stage scales uniformly (the smaller of the
 * two axis ratios) so the whole 1920x1080 canvas always fits inside the
 * viewport, then centers on the other axis — a wider-than-16:9 viewport gets
 * empty bands left/right, a taller one gets bands top/bottom. Zero DOM, zero
 * I/O: the caller measures the real viewport (`getBoundingClientRect()`,
 * `ResizeObserver`) and passes plain numbers in.
 */

/** The virtual stage every slide is authored against, in CSS pixels. */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * Fraction of the stage's own width/height kept clear of every slide's
 * content on each edge (owner spec: "keep content inside a 5% safe area") —
 * a projector/TV routinely overscans or bezels the outer edge of the signal
 * it receives, so nothing load-bearing may render there.
 */
export const STAGE_SAFE_AREA_FRACTION = 0.05;

/** The safe-area inset, already resolved to stage pixels — `96`/`54` at the stage's own 1920x1080. */
export const STAGE_SAFE_AREA_X = STAGE_WIDTH * STAGE_SAFE_AREA_FRACTION;
export const STAGE_SAFE_AREA_Y = STAGE_HEIGHT * STAGE_SAFE_AREA_FRACTION;

/**
 * The safe area's own size, stage pixels (`1728x972` at the stage's own
 * 1920x1080 — still exactly 16:9, since the inset is the same fraction on
 * both axes) — the worksheet zoom tour's own "stage" (presentation mode v1,
 * sprint week 3): `presentationCamera.ts`'s `cameraForPage`/`cameraForZone`
 * fit a worksheet page/zone inside THIS box, not the full stage, so a
 * worksheet slide's content stays inside the same safe area every other
 * slide already respects (this file's own header: "projector/TV routinely
 * overscans the outer edge"). Single source of truth, shared by
 * `PresentationIsland.tsx`'s own render and `presentationSlides.ts`'s
 * projection-warning checklist scan, so neither can quietly drift from the
 * other's idea of how much room a worksheet actually gets.
 */
export const STAGE_SAFE_WIDTH = STAGE_WIDTH - 2 * STAGE_SAFE_AREA_X;
export const STAGE_SAFE_HEIGHT = STAGE_HEIGHT - 2 * STAGE_SAFE_AREA_Y;

/** The stage's resolved placement inside a real viewport — see this module's own header. */
export interface StageFit {
  /** Uniform scale applied to the 1920x1080 stage so it fits entirely inside the viewport. */
  scale: number;
  /** Letterbox band width, in viewport CSS pixels, on the LEFT (and, by symmetry, the right). */
  offsetX: number;
  /** Letterbox band height, in viewport CSS pixels, on the TOP (and, by symmetry, the bottom). */
  offsetY: number;
}

/**
 * The `scale`/`offsetX`/`offsetY` that fits the 1920x1080 stage entirely
 * inside a `viewportWidth`x`viewportHeight` viewport, centered.
 *
 * A non-positive dimension (not yet laid out — jsdom, or a ref read before
 * first paint) returns `{ scale: 1, offsetX: 0, offsetY: 0 }` rather than a
 * `NaN`/`Infinity` transform, same defensive posture as `fitZoom`
 * (`canvasViewport.ts`).
 */
export function fitStage(viewportWidth: number, viewportHeight: number): StageFit {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT);
  return {
    scale,
    offsetX: (viewportWidth - STAGE_WIDTH * scale) / 2,
    offsetY: (viewportHeight - STAGE_HEIGHT * scale) / 2,
  };
}
