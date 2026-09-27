/**
 * Client-side image pipeline for activity uploads (browser only).
 *
 * Turns whatever a creator picked (a jpeg/png/webp image, or a PDF) into one
 * or more WebP `Blob`s ready to `POST` to `/api/actividades/imagen`. The
 * server never sees the original file — only what this module produces.
 *
 * IMAGES: decode, scale so the longer side is at most {@link
 * MAX_LONG_SIDE_PX} (NEVER upscaled — a small source image stays small),
 * then re-encode as WebP at {@link WEBP_QUALITY}. Re-encoding through
 * `<canvas>` also strips EXIF — including GPS location — as a side effect
 * of the round trip, not a separate step: `<canvas>` never carries metadata
 * in the first place.
 *
 * PDFS: `pdfjs-dist` renders the caller-selected 1-based pages (at most
 * {@link MAX_PDF_PAGES}) at a scale chosen so the RENDERED page's longer
 * side lands at {@link MAX_LONG_SIDE_PX}, then the same WebP encode. The PDF
 * itself is never uploaded — only the rendered pages are. `pdfjs-dist` is
 * imported LAZILY (dynamic import) so it never weighs on a page that never
 * touches this function.
 *
 * TESTING: `routeFileType`, `computeScaledSize` and `validatePageSelection`
 * are pure and unit-tested below their definitions. `convertImageToWebp`
 * and `convertPdfPagesToWebp` drive real `<canvas>`/`Image`/`pdfjs-dist`
 * decoding that jsdom cannot provide meaningfully — they are a MANUAL check
 * only (see this PR's report).
 */

/** Longer side an output image is scaled to, in pixels. Never upscaled past this. */
export const MAX_LONG_SIDE_PX = 1600;

/** `<canvas>.toBlob` quality passed for WebP re-encoding. */
export const WEBP_QUALITY = 0.8;

/** At most this many PDF pages may be selected in one call. */
export const MAX_PDF_PAGES = 10;

const SUPPORTED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const PDF_MIME_TYPE = 'application/pdf';

export type FileKind = 'image' | 'pdf';

/**
 * Which half of the pipeline a file belongs to, or `null` when its MIME
 * type is neither a supported image nor a PDF. Pure — reads only `.type`,
 * so a plain `{ type: string }` is accepted alongside a real `File`.
 */
export function routeFileType(file: { type: string }): FileKind | null {
  if (SUPPORTED_IMAGE_TYPES.has(file.type)) return 'image';
  if (file.type === PDF_MIME_TYPE) return 'pdf';
  return null;
}

export interface ScaledSize {
  width: number;
  height: number;
}

/**
 * Scale `(width, height)` so the longer side is at most `maxSide`,
 * preserving aspect ratio, rounding to whole pixels, and never returning a
 * zero dimension for a positive input.
 *
 * NEVER UPSCALES: a source already at or under `maxSide` on its longer side
 * is returned unchanged (rounded) — this pipeline only ever makes an image
 * smaller, never larger than what the creator actually provided.
 */
export function computeScaledSize(
  width: number,
  height: number,
  maxSide: number = MAX_LONG_SIDE_PX,
): ScaledSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('computeScaledSize: width and height must be positive finite numbers');
  }
  if (!Number.isFinite(maxSide) || maxSide <= 0) {
    throw new RangeError('computeScaledSize: maxSide must be a positive finite number');
  }

  const longSide = Math.max(width, height);
  if (longSide <= maxSide) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxSide / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Validate a caller-supplied PDF page selection: a non-empty array of
 * distinct, positive integers (1-based), at most `maxPages` of them — or
 * `null` when any rule is violated. Duplicates are REJECTED rather than
 * silently deduped, so a caller sees its own mistake instead of a page
 * quietly disappearing from the output.
 */
export function validatePageSelection(
  pages: unknown,
  maxPages: number = MAX_PDF_PAGES,
): number[] | null {
  if (!Array.isArray(pages) || pages.length === 0) return null;
  if (pages.length > maxPages) return null;

  const seen = new Set<number>();
  for (const page of pages) {
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) return null;
    if (seen.has(page)) return null;
    seen.add(page);
  }

  return [...pages];
}

/** `<canvas>.toBlob` wrapped as a Promise, encoding as WebP at {@link WEBP_QUALITY}. */
function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('imagePipeline: WebP encoding produced no blob'));
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

function create2dContext(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('imagePipeline: 2d canvas context unavailable');
  return { canvas, ctx };
}

/**
 * Decode `file` (jpeg/png/webp) and re-encode it as a scaled WebP `Blob`.
 * BROWSER ONLY — see file header, "manual check only".
 */
export async function convertImageToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeScaledSize(bitmap.width, bitmap.height);
    const { canvas, ctx } = create2dContext(width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToWebpBlob(canvas);
  } finally {
    bitmap.close();
  }
}

/**
 * Lazily import `pdfjs-dist` and point it at its own worker script, built
 * via `new URL(..., import.meta.url)` — the Vite/Astro-supported way to
 * reference a bundled asset's URL, requiring no extra type declarations
 * (unlike a `?url` import specifier).
 */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
  return pdfjs;
}

/**
 * Render `file`'s (a PDF) `pages` (1-based, validated by {@link
 * validatePageSelection}) to scaled WebP `Blob`s, in the given order. The
 * PDF itself is never uploaded. BROWSER ONLY — see file header.
 */
export async function convertPdfPagesToWebp(file: File, pages: number[]): Promise<Blob[]> {
  const validated = validatePageSelection(pages);
  if (!validated) {
    throw new RangeError('convertPdfPagesToWebp: invalid page selection');
  }

  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;

  try {
    const blobs: Blob[] = [];
    for (const pageNumber of validated) {
      if (pageNumber > doc.numPages) {
        throw new RangeError(`convertPdfPagesToWebp: page ${pageNumber} does not exist`);
      }

      const page = await doc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const { width, height } = computeScaledSize(unscaledViewport.width, unscaledViewport.height);
      const viewport = page.getViewport({ scale: width / unscaledViewport.width });

      const { canvas } = create2dContext(width, height);
      await page.render({ canvas, viewport }).promise;
      blobs.push(await canvasToWebpBlob(canvas));
    }
    return blobs;
  } finally {
    await loadingTask.destroy();
  }
}
