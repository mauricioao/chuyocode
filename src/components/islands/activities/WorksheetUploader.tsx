/**
 * WorksheetUploader — the "empty state" of a worksheet block: drop/pick an
 * image or a PDF, convert it client-side to WebP via
 * `src/lib/activities/imagePipeline.ts`, and upload each resulting blob to
 * `POST /api/actividades/imagen` (PR B, "Activities creator"). The server
 * never sees the original file, only what the pipeline produces.
 *
 * PDF PAGE THUMBNAILS ("small polish" pass — replaces the old blind
 * page-number-only picker): a PDF first renders small preview thumbnails of
 * its pages (`renderPdfThumbnails`, lazy `pdfjs-dist` — see
 * `imagePipeline.ts`'s own header), shown as a checkbox grid capped at
 * `MAX_PDF_PAGES` selected pages, with a "select all" (up to the cap) and a
 * live "N/10 seleccionadas" count. The plain page-NUMBER text field stays as
 * a FALLBACK, reached two ways: automatically when thumbnail rendering
 * itself fails (a corrupt/unusual PDF `pdfjs-dist` can't render), or
 * manually via "Elegir por número de página" — the only way to reach a page
 * past the thumbnail grid's own 40-page cap (`MAX_PDF_THUMBNAIL_PAGES`;
 * `validatePageSelection`'s 10-page SELECTION cap is separate and unrelated
 * — a text-typed page number is never rendered, so it isn't subject to the
 * thumbnail cap at all). Each chosen page becomes its own uploaded image, IN
 * ORDER, so the caller can turn every one into its own worksheet block.
 *
 * Thumbnails are rendered as `Blob`s turned into `URL.createObjectURL`
 * strings — revoked (`revokeThumbnailUrls`) whenever a new file is picked,
 * the flow switches away from the thumbnail grid, or this component
 * unmounts, so a creator picking several PDFs in a row never leaks object
 * URLs.
 *
 * MANUAL/PLAYWRIGHT CHECK for the real canvas/`<img>`/`pdfjs-dist` decoding
 * (jsdom cannot meaningfully run it) — same posture as
 * `imagePipeline.ts`'s own header. Automated tests here mock the pipeline
 * (including `renderPdfThumbnails`) and `fetch`, and cover this component's
 * OWN decisions: routing, thumbnail selection, progress, error mapping, and
 * the shape of what it hands back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import {
  routeFileType,
  validatePageSelection,
  convertImageToWebp,
  convertPdfPagesToWebp,
  renderPdfThumbnails,
  MAX_PDF_PAGES,
  MAX_PDF_THUMBNAIL_PAGES,
  PDF_THUMBNAIL_WIDTH,
} from '@/lib/activities/imagePipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface UploadedImage {
  path: string;
  width: number;
  height: number;
}

export interface WorksheetUploaderProps {
  lang: Lang;
  onComplete: (images: UploadedImage[]) => void;
}

/** A rendered PDF page thumbnail, its blob already turned into an object URL. */
interface ThumbnailEntry {
  pageNumber: number;
  url: string;
  width: number;
  height: number;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading-thumbnails'; file: File }
  | { kind: 'picking-thumbnails'; file: File; thumbnails: ThumbnailEntry[]; truncated: boolean }
  | { kind: 'picking-pages'; file: File }
  | { kind: 'uploading'; progress: string }
  | { kind: 'error'; message: string };

/** "1, 2, 3" -> `[1, 2, 3]`, dropping anything that doesn't parse as a whole page number — the text-field fallback's own parsing, unchanged from before this pass. */
function parsePagesInput(raw: string): number[] {
  return raw
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((p) => Number.isInteger(p));
}

async function uploadWebp(blob: Blob): Promise<UploadedImage> {
  const res = await fetch('/api/actividades/imagen', {
    method: 'POST',
    headers: { 'content-type': 'image/webp' },
    body: blob,
  });
  const data = (await res.json().catch(() => ({}))) as { path?: string; width?: number; height?: number; error?: string };
  if (!res.ok || !data.path || !data.width || !data.height) {
    throw new Error(data.error ?? 'upload_failed');
  }
  return { path: data.path, width: data.width, height: data.height };
}

/** Uploads every blob, IN ORDER — shared by the image path and both PDF paths (thumbnails and the text-field fallback). */
async function uploadAll(blobs: Blob[]): Promise<UploadedImage[]> {
  const images: UploadedImage[] = [];
  for (const blob of blobs) {
    images.push(await uploadWebp(blob));
  }
  return images;
}

export default function WorksheetUploader({ lang, onComplete }: WorksheetUploaderProps) {
  const t = UI_LABELS[lang].activities.worksheet;
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragActive, setDragActive] = useState(false);
  const [pagesInput, setPagesInput] = useState('');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnailUrlsRef = useRef<string[]>([]);

  const revokeThumbnailUrls = useCallback(() => {
    for (const url of thumbnailUrlsRef.current) URL.revokeObjectURL(url);
    thumbnailUrlsRef.current = [];
  }, []);

  // Unmount-only cleanup — every earlier transition (a new file picked, or
  // leaving the thumbnail grid) already revokes explicitly at that point;
  // see `revokeThumbnailUrls`'s own callers below.
  useEffect(() => revokeThumbnailUrls, [revokeThumbnailUrls]);

  const errorMessage = useCallback(
    (code: string): string => {
      const errors = t.errors as Record<string, string>;
      return errors[code] ?? errors.upload_failed;
    },
    [t],
  );

  const handleImageFile = useCallback(
    async (file: File) => {
      setStatus({ kind: 'uploading', progress: t.uploadProgress });
      try {
        const blob = await convertImageToWebp(file);
        const image = await uploadWebp(blob);
        setStatus({ kind: 'idle' });
        onComplete([image]);
      } catch (err) {
        const code = err instanceof Error ? err.message : 'upload_failed';
        setStatus({ kind: 'error', message: errorMessage(code) });
      }
    },
    [t, errorMessage, onComplete],
  );

  /** Shared by the thumbnail grid's confirm and the text-field fallback's confirm — only how `pages` was gathered differs. */
  const handlePdfPagesConfirm = useCallback(
    async (file: File, pages: number[]) => {
      const validated = validatePageSelection(pages);
      if (!validated) {
        setStatus({ kind: 'error', message: errorMessage('pdf_failed') });
        return;
      }

      setStatus({ kind: 'uploading', progress: t.uploadProgress });
      try {
        const blobs = await convertPdfPagesToWebp(file, validated);
        const images = await uploadAll(blobs);
        setStatus({ kind: 'idle' });
        onComplete(images);
      } catch (err) {
        const code = err instanceof Error ? err.message : 'pdf_failed';
        setStatus({ kind: 'error', message: errorMessage(code) });
      }
    },
    [t, errorMessage, onComplete],
  );

  const toggleThumbnailPage = useCallback((pageNumber: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else if (next.size < MAX_PDF_PAGES) {
        next.add(pageNumber);
      }
      return next;
    });
  }, []);

  const selectAllThumbnails = useCallback((pageNumbers: number[]) => {
    setSelectedPages(new Set(pageNumbers.slice(0, MAX_PDF_PAGES)));
  }, []);

  /** The manual escape hatch to the plain page-number field — see the file header. */
  const switchToTextEntry = useCallback(
    (file: File) => {
      revokeThumbnailUrls();
      setPagesInput('');
      setStatus({ kind: 'picking-pages', file });
    },
    [revokeThumbnailUrls],
  );

  const handleFile = useCallback(
    (file: File) => {
      const kind = routeFileType(file);
      if (kind === 'image') {
        void handleImageFile(file);
        return;
      }
      if (kind !== 'pdf') {
        setStatus({ kind: 'error', message: errorMessage('unsupported_media_type') });
        return;
      }

      revokeThumbnailUrls();
      setSelectedPages(new Set());
      setPagesInput('');
      setStatus({ kind: 'loading-thumbnails', file });
      void renderPdfThumbnails(file, { maxPages: MAX_PDF_THUMBNAIL_PAGES, width: PDF_THUMBNAIL_WIDTH })
        .then((result) => {
          const thumbnails: ThumbnailEntry[] = result.thumbnails.map((th) => ({
            pageNumber: th.pageNumber,
            url: URL.createObjectURL(th.blob),
            width: th.width,
            height: th.height,
          }));
          thumbnailUrlsRef.current = thumbnails.map((th) => th.url);
          setStatus({ kind: 'picking-thumbnails', file, thumbnails, truncated: result.truncated });
        })
        .catch(() => {
          // Rendering failed outright (a corrupt/unusual PDF `pdfjs-dist`
          // can't handle) — fall back to the plain page-number field rather
          // than dead-ending the creator.
          setStatus({ kind: 'picking-pages', file });
        });
    },
    [handleImageFile, errorMessage, revokeThumbnailUrls],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  if (status.kind === 'loading-thumbnails') {
    return (
      <div
        data-testid="worksheet-uploader-pdf-loading"
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center"
      >
        <p role="status" className="text-sm text-muted-foreground">
          {t.pdfThumbnailsLoading}
        </p>
      </div>
    );
  }

  if (status.kind === 'picking-thumbnails') {
    const { file, thumbnails, truncated } = status;
    const atMax = selectedPages.size >= MAX_PDF_PAGES;
    const selectedCount = selectedPages.size;
    return (
      <div
        data-testid="worksheet-uploader-thumbnails"
        className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4"
      >
        <p className="text-sm font-medium text-foreground">{t.pdfPagesTitle}</p>
        <p className="text-xs text-muted-foreground">{t.pdfThumbnailsHint}</p>
        {truncated && (
          <p data-testid="pdf-thumbnails-truncated-note" className="text-xs text-muted-foreground">
            {t.pdfThumbnailsTruncated}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="pdf-select-all"
            onClick={() => selectAllThumbnails(thumbnails.map((th) => th.pageNumber))}
          >
            {t.pdfSelectAll}
          </Button>
          <span data-testid="pdf-selected-count" className="text-xs text-muted-foreground">
            {selectedCount}/{MAX_PDF_PAGES} {t.pdfSelectedCountLabel}
          </span>
        </div>
        <div data-testid="pdf-thumbnail-grid" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {thumbnails.map((th) => {
            const checked = selectedPages.has(th.pageNumber);
            return (
              <label
                key={th.pageNumber}
                data-testid={`pdf-thumbnail-${th.pageNumber}`}
                className="flex flex-col items-center gap-1 rounded border border-border p-1 text-xs text-foreground"
              >
                <img
                  src={th.url}
                  alt={`${t.pdfPageLabel} ${th.pageNumber}`}
                  width={th.width}
                  height={th.height}
                  className="rounded"
                />
                <span className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    data-testid={`pdf-thumbnail-checkbox-${th.pageNumber}`}
                    aria-label={`${t.pdfPageLabel} ${th.pageNumber}`}
                    checked={checked}
                    disabled={!checked && atMax}
                    onChange={() => toggleThumbnailPage(th.pageNumber)}
                  />
                  {th.pageNumber}
                </span>
              </label>
            );
          })}
        </div>
        <Button
          type="button"
          data-testid="pdf-thumbnails-confirm"
          disabled={selectedCount === 0}
          onClick={() => void handlePdfPagesConfirm(file, [...selectedPages].sort((a, b) => a - b))}
        >
          {t.pdfAddPagesPrefix} {selectedCount} {selectedCount === 1 ? t.pdfPageCountOne : t.pdfPageCountMany}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="pdf-switch-to-text"
          onClick={() => switchToTextEntry(file)}
        >
          {t.pdfThumbnailsSwitchToText}
        </Button>
      </div>
    );
  }

  if (status.kind === 'picking-pages') {
    return (
      <div data-testid="worksheet-uploader-pages" className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium text-foreground">{t.pdfPagesTitle}</p>
        <p className="text-xs text-muted-foreground">{t.pdfPagesHint}</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {t.pdfPageLabel}
          <Input
            type="text"
            fieldSize="sm"
            data-testid="pdf-pages-input"
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="1, 2, 3"
            maxLength={MAX_PDF_PAGES * 4}
          />
        </label>
        <Button
          type="button"
          data-testid="pdf-pages-confirm"
          onClick={() => void handlePdfPagesConfirm(status.file, parsePagesInput(pagesInput))}
        >
          {t.pdfConfirm}
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="worksheet-uploader"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-theme duration-theme ${
        dragActive ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <p className="text-sm font-medium text-foreground">
        {dragActive ? t.uploadDragActive : t.uploadTitle}
      </p>
      <p className="text-xs text-muted-foreground">{t.uploadHint}</p>
      <input
        ref={inputRef}
        type="file"
        data-testid="worksheet-file-input"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        onChange={handleInputChange}
        aria-label={t.uploadButton}
      />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
        {t.uploadButton}
      </Button>

      {status.kind === 'uploading' && (
        <p role="status" data-testid="uploader-progress" className="text-sm text-muted-foreground">
          {status.progress}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" data-testid="uploader-error" className="text-sm text-destructive">
          {status.message}
        </p>
      )}
    </div>
  );
}
