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
 * PDF THUMBNAILS: `renderPdfThumbnails` renders small preview images of a
 * PDF's pages (`WorksheetUploader.tsx`'s page picker, replacing a blind
 * page-number text field with a checkbox grid) — same lazy `pdfjs-dist`
 * import, same render-to-`<canvas>`-then-WebP path as `convertPdfPagesToWebp`,
 * just at a much smaller target width and over every page up to {@link
 * MAX_PDF_THUMBNAIL_PAGES} rather than a caller-chosen subset: the whole
 * point is to show the author what's on each page BEFORE they pick, so it
 * can't start from a selection the way the full-resolution conversion does.
 * A PDF longer than that cap still renders its first {@link
 * MAX_PDF_THUMBNAIL_PAGES} pages (`truncated: true` tells the caller to show
 * a note) — the text-field fallback has no such cap, since it never renders
 * anything, only validates page NUMBERS.
 *
 * TESTING: `routeFileType`, `computeScaledSize`, `validatePageSelection`, and
 * `pdfThumbnailPageNumbers` are pure and unit-tested below their
 * definitions. `convertImageToWebp`, `convertPdfPagesToWebp`, and
 * `renderPdfThumbnails` drive real `<canvas>`/`Image`/`pdfjs-dist` decoding
 * that jsdom cannot provide meaningfully — they are a MANUAL check only (see
 * this PR's report); `WorksheetUploader.tsx`'s own tests mock
 * `renderPdfThumbnails` instead of exercising it for real.
 */

/** Longer side an output image is scaled to, in pixels. Never upscaled past this. */
export const MAX_LONG_SIDE_PX = 1600;

/** `<canvas>.toBlob` quality passed for WebP re-encoding. */
export const WEBP_QUALITY = 0.8;

/** At most this many PDF pages may be selected in one call. */
export const MAX_PDF_PAGES = 10;

/**
 * At most this many of a PDF's pages get a rendered thumbnail — see
 * {@link renderPdfThumbnails}'s own header. A longer PDF still ONLY shows
 * previews for its first this-many pages; the text-field fallback
 * (`WorksheetUploader.tsx`) has no such cap since it never renders anything.
 */
export const MAX_PDF_THUMBNAIL_PAGES = 40;

/** The rendered thumbnail's target width, in CSS pixels — height follows the page's own aspect ratio. */
export const PDF_THUMBNAIL_WIDTH = 120;

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
 * The 1-based page numbers {@link renderPdfThumbnails} renders a thumbnail
 * for: `1..min(numPages, maxPages)`, in order. Pure — split out from
 * `renderPdfThumbnails` itself so the CAPPING rule (the actual point of this
 * function) is unit-testable without any real PDF decoding.
 */
export function pdfThumbnailPageNumbers(numPages: number, maxPages: number = MAX_PDF_THUMBNAIL_PAGES): number[] {
  const count = Math.max(0, Math.min(numPages, maxPages));
  return Array.from({ length: count }, (_, i) => i + 1);
}

export interface PdfPageThumbnail {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
}

export interface RenderPdfThumbnailsOptions {
  /** Caps how many of the PDF's pages get a thumbnail — default {@link MAX_PDF_THUMBNAIL_PAGES}. */
  maxPages?: number;
  /** The rendered thumbnail's target width in CSS pixels — default {@link PDF_THUMBNAIL_WIDTH}. */
  width?: number;
}

export interface PdfThumbnailsResult {
  thumbnails: PdfPageThumbnail[];
  /** The PDF's actual total page count — may be larger than `thumbnails.length` when `truncated`. */
  totalPages: number;
  /** `true` when the PDF has more pages than `maxPages` — the caller shows a note (`WorksheetUploader.tsx`). */
  truncated: boolean;
}

/**
 * Render small preview thumbnails of `file`'s (a PDF) pages, up to {@link
 * MAX_PDF_THUMBNAIL_PAGES} of them — `WorksheetUploader.tsx`'s page picker
 * grid. Each thumbnail is its own small WebP `Blob`, same encode path as
 * {@link convertPdfPagesToWebp} (`<canvas>` render -> WebP), just scaled to
 * `width` instead of {@link MAX_LONG_SIDE_PX}. The PDF itself is never
 * uploaded. BROWSER ONLY — see file header.
 */
export async function renderPdfThumbnails(
  file: File,
  options: RenderPdfThumbnailsOptions = {},
): Promise<PdfThumbnailsResult> {
  const maxPages = options.maxPages ?? MAX_PDF_THUMBNAIL_PAGES;
  const width = options.width ?? PDF_THUMBNAIL_WIDTH;

  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;

  try {
    const pageNumbers = pdfThumbnailPageNumbers(doc.numPages, maxPages);
    const thumbnails: PdfPageThumbnail[] = [];
    for (const pageNumber of pageNumbers) {
      const page = await doc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = width / unscaledViewport.width;
      const viewport = page.getViewport({ scale });
      const thumbWidth = Math.max(1, Math.round(viewport.width));
      const thumbHeight = Math.max(1, Math.round(viewport.height));

      const { canvas } = create2dContext(thumbWidth, thumbHeight);
      await page.render({ canvas, viewport }).promise;
      const blob = await canvasToWebpBlob(canvas);
      thumbnails.push({ pageNumber, blob, width: thumbWidth, height: thumbHeight });
    }
    return { thumbnails, totalPages: doc.numPages, truncated: doc.numPages > maxPages };
  } finally {
    await loadingTask.destroy();
  }
}

export interface PdfPageConverter {
  /** The PDF's actual total page count. */
  totalPages: number;
  /**
   * Render one 1-based `pageNumber` to a scaled WebP `Blob`. Checks
   * `signal.aborted` both before starting and right after the page itself
   * finishes rendering — the two points where `uploadTask.ts`'s run loop
   * can actually observe a cancel mid-item.
   */
  convertPage(pageNumber: number, signal?: AbortSignal): Promise<Blob>;
  /** Releases the underlying `pdfjs-dist` document — call once done with every page. */
  dispose(): Promise<void>;
}

/**
 * Opens `file` (a PDF) ONCE for repeated single-page conversion —
 * `WorksheetUploader.tsx`'s upload task machine converts one page at a
 * time (convert -> upload -> next page) so cancelling between pages stops
 * real work instead of waiting out a whole-document batch; re-parsing the
 * PDF per page would undo that. {@link convertPdfPagesToWebp} stays
 * available for a one-shot batch conversion of several pages, unrelated to
 * this per-page flow. BROWSER ONLY — see file header.
 */
export async function openPdfForConversion(file: File): Promise<PdfPageConverter> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;

  return {
    totalPages: doc.numPages,
    async convertPage(pageNumber, signal) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (pageNumber > doc.numPages) {
        throw new RangeError(`openPdfForConversion: page ${pageNumber} does not exist`);
      }
      const page = await doc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const { width, height } = computeScaledSize(unscaledViewport.width, unscaledViewport.height);
      const viewport = page.getViewport({ scale: width / unscaledViewport.width });
      const { canvas } = create2dContext(width, height);
      await page.render({ canvas, viewport }).promise;
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return canvasToWebpBlob(canvas);
    },
    async dispose() {
      await loadingTask.destroy();
    },
  };
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
