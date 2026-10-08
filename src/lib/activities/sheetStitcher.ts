/**
 * Client-side stitching for combining several worksheet pages/images into
 * ONE tall sheet, top to bottom, in the chosen order (one-sheet redesign,
 * owner spec 2026-10-08: "nadie crea un ejercicio de varias hojas, vamos
 * solamente a dar una sola hoja" — a multi-page PDF or several dropped
 * images must still produce exactly one worksheet block, never several).
 *
 * `capStitchSources`/`computeStitchLayout`/`stepDownStitchWidth` are pure
 * and unit-tested below. `stitchSourcesToWebp` is the thin canvas-drawing
 * wrapper around that math — real `<canvas>`/`drawImage` work jsdom cannot
 * meaningfully run, same "manual check only" posture as
 * `imagePipeline.ts`'s own header, and `WorksheetUploader.tsx`'s tests mock
 * it rather than exercising it for real. `stitchSourcesWithinSizeLimit`'s
 * own RETRY SEQUENCING (shrink width, then quality, then give up) is
 * exercised with a fake injected `encode` — see its own header — so only the
 * actual pixel-pushing stays untested here.
 */
import { canvasToWebpBlob, create2dContext, WEBP_QUALITY } from './imagePipeline';

/** At most this many pages/images combine into one sheet (owner spec: "cap at 5"). */
export const MAX_STITCH_SOURCES = 5;

/** The common width every page/image is scaled to before stacking, in pixels — never upscaled past this OR past any source's own narrowest natural width (see {@link computeStitchLayout}). */
export const STITCH_TARGET_WIDTH = 1600;

/** A small, neutral gap between stacked pages, in pixels. */
export const STITCH_GAP_PX = 24;

/** {@link stepDownStitchWidth} stops (returns `null`) once the common width would drop below this. */
export const STITCH_MIN_WIDTH = 480;

/** {@link stitchSourcesWithinSizeLimit}'s own quality floor, once width shrinking alone cannot fit the limit. */
export const STITCH_MIN_QUALITY = 0.5;

export interface StitchSourceSize {
  width: number;
  height: number;
}

export interface StitchPlacement extends StitchSourceSize {
  x: number;
  y: number;
}

export interface StitchLayout {
  placements: StitchPlacement[];
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Caps `sources` at `max` (default {@link MAX_STITCH_SOURCES}), keeping the
 * chosen order — the caller tells the author about `truncated` (owner spec:
 * "tell the user calmly if they pick more").
 */
export function capStitchSources<T>(
  sources: readonly T[],
  max: number = MAX_STITCH_SOURCES,
): { sources: T[]; truncated: boolean } {
  if (sources.length <= max) return { sources: [...sources], truncated: false };
  return { sources: sources.slice(0, max), truncated: true };
}

/**
 * Stack `sizes` top to bottom, in order, all scaled to the SAME common
 * width — the narrowest of `targetWidth` and every source's own natural
 * width, so nothing is ever upscaled past what the author actually
 * provided. Each page keeps its own aspect ratio; `gap` pixels separate
 * consecutive pages (never before the first or after the last). `[]` in,
 * `{ placements: [], canvasWidth: 0, canvasHeight: 0 }` out.
 */
export function computeStitchLayout(
  sizes: readonly StitchSourceSize[],
  targetWidth: number = STITCH_TARGET_WIDTH,
  gap: number = STITCH_GAP_PX,
): StitchLayout {
  if (sizes.length === 0) return { placements: [], canvasWidth: 0, canvasHeight: 0 };

  const commonWidth = Math.max(1, Math.round(Math.min(targetWidth, ...sizes.map((s) => s.width))));

  const placements: StitchPlacement[] = [];
  let y = 0;
  for (const size of sizes) {
    const height = Math.max(1, Math.round((size.height * commonWidth) / size.width));
    placements.push({ x: 0, y, width: commonWidth, height });
    y += height + gap;
  }
  const canvasHeight = y > gap ? y - gap : y;

  return { placements, canvasWidth: commonWidth, canvasHeight };
}

/**
 * One retry step when the stitched WebP still doesn't fit the server's
 * upload limit: shrink the common width by 15%, floored at
 * {@link STITCH_MIN_WIDTH} — `null` once shrinking further would go below
 * that floor, telling {@link stitchSourcesWithinSizeLimit} to move on to its
 * quality-shrinking phase instead of looping forever.
 */
export function stepDownStitchWidth(width: number): number | null {
  const next = Math.round(width * 0.85);
  return next >= STITCH_MIN_WIDTH ? next : null;
}

/** One already-decoded drawable source (a picked image's bitmap, or a rendered PDF page re-decoded from its own WebP) paired with its natural size. */
export interface StitchDrawSource {
  image: CanvasImageSource;
  size: StitchSourceSize;
}

/**
 * Draws `sources` (already-decoded, in the chosen order) onto ONE canvas
 * per {@link computeStitchLayout}, then encodes it as a single WebP `Blob`.
 * BROWSER ONLY — see this file's own header. The thin wrapper around the
 * pure layout math above: this function makes no sizing decisions of its
 * own.
 */
export async function stitchSourcesToWebp(
  sources: readonly StitchDrawSource[],
  targetWidth: number = STITCH_TARGET_WIDTH,
  gap: number = STITCH_GAP_PX,
  quality: number = WEBP_QUALITY,
): Promise<Blob> {
  const layout = computeStitchLayout(sources.map((s) => s.size), targetWidth, gap);
  const { canvas, ctx } = create2dContext(layout.canvasWidth, layout.canvasHeight);
  sources.forEach((source, i) => {
    const placement = layout.placements[i];
    ctx.drawImage(source.image, placement.x, placement.y, placement.width, placement.height);
  });
  return canvasToWebpBlob(canvas, quality);
}

/** Injectable in place of {@link stitchSourcesToWebp} — see {@link stitchSourcesWithinSizeLimit}'s own header on why tests use this instead of a real canvas. */
export type StitchEncodeFn = (
  sources: readonly StitchDrawSource[],
  width: number,
  gap: number,
  quality: number,
) => Promise<Blob>;

/**
 * Encodes `sources` into one stitched WebP that fits under `maxBytes`
 * (`imagePipeline.ts`'s own `MAX_UPLOAD_BYTES`, mirroring the server's
 * limit): first shrinking the common width step by step
 * ({@link stepDownStitchWidth}) at the default quality, then — once the
 * width floor is reached and it still doesn't fit — shrinking quality down
 * to {@link STITCH_MIN_QUALITY}. Returns `null` once both are exhausted,
 * telling the caller to show a clear message instead of failing silently
 * (owner spec).
 *
 * `options.encode` defaults to the real {@link stitchSourcesToWebp} (real
 * `<canvas>` work); tests inject a fake one returning controllable blob
 * sizes to exercise the retry SEQUENCING itself without touching jsdom's
 * nonexistent canvas support.
 */
export async function stitchSourcesWithinSizeLimit(
  sources: readonly StitchDrawSource[],
  maxBytes: number,
  options: {
    targetWidth?: number;
    gap?: number;
    quality?: number;
    encode?: StitchEncodeFn;
  } = {},
): Promise<Blob | null> {
  const encode = options.encode ?? stitchSourcesToWebp;
  const gap = options.gap ?? STITCH_GAP_PX;
  let width: number | null = options.targetWidth ?? STITCH_TARGET_WIDTH;
  const quality = options.quality ?? WEBP_QUALITY;

  // Phase 1: shrink the common width at the default quality.
  while (width !== null) {
    const blob = await encode(sources, width, gap, quality);
    if (blob.size <= maxBytes) return blob;
    width = stepDownStitchWidth(width);
  }

  // Phase 2: the width floor was reached and it still didn't fit — shrink
  // quality too, at that floor width.
  const floorWidth = STITCH_MIN_WIDTH;
  let q = quality;
  while (q > STITCH_MIN_QUALITY) {
    q = Math.max(STITCH_MIN_QUALITY, q - 0.1);
    const blob = await encode(sources, floorWidth, gap, q);
    if (blob.size <= maxBytes) return blob;
  }

  return null;
}
