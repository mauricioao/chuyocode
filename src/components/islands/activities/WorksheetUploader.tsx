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
 * TASK PROGRESS PANEL (coherent loading states, item 4 — fixes the bug
 * where pressing "Agregar N páginas" silently went back to the empty drop
 * zone while converting/uploading ran in the background): once pages are
 * confirmed (or a plain image is picked), `src/lib/activities/uploadTask.ts`
 * drives one page/item at a time (convert -> upload -> next) and this
 * component renders `TaskProgress` (`src/components/ui/task-progress.tsx`)
 * in its place — it NEVER falls back to the drop zone while the task is
 * running. A PDF opens its document ONCE via `openPdfForConversion` and
 * converts pages from it one at a time, so cancelling actually stops real
 * work between pages instead of waiting out a whole-document batch. A
 * failure keeps the panel up with the reason + "Reintentar" (resumes AT the
 * failed page — see `uploadTask.ts`'s own header for the keep-uploaded-pages
 * policy) and "Elegir otro archivo" (back to the drop zone). Cancelling
 * goes straight back to the drop zone; finishing calls `onComplete` and
 * does the same.
 *
 * Thumbnails are rendered as `Blob`s turned into `URL.createObjectURL`
 * strings — revoked (`revokeThumbnailUrls`) whenever a new file is picked,
 * the flow switches away from the thumbnail grid, a file is abandoned via
 * "Elegir otro archivo", or this component unmounts. The SAME thumbnail
 * URLs double as the task panel's cheap "current page" preview while that
 * page converts/uploads — not revoked until the reasons above, so they're
 * still good at that point.
 *
 * MANUAL/PLAYWRIGHT CHECK for the real canvas/`<img>`/`pdfjs-dist` decoding
 * (jsdom cannot meaningfully run it) — same posture as
 * `imagePipeline.ts`'s own header. Automated tests here mock the pipeline
 * (including `renderPdfThumbnails`/`openPdfForConversion`) and `fetch`, and
 * cover this component's OWN decisions: routing, thumbnail selection,
 * progress, error mapping, and the shape of what it hands back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import {
  routeFileType,
  validatePageSelection,
  convertImageToWebp,
  renderPdfThumbnails,
  openPdfForConversion,
  type PdfPageConverter,
  MAX_PDF_PAGES,
  MAX_PDF_THUMBNAIL_PAGES,
  PDF_THUMBNAIL_WIDTH,
} from '@/lib/activities/imagePipeline';
import { createUploadTask, type UploadTask, type UploadTaskKind, type UploadTaskState } from '@/lib/activities/uploadTask';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskProgress } from '@/components/ui/task-progress';

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
  /** A running or failed upload task — see this file's own header. Never idle/done: those transitions go straight back to 'idle' (see `WorksheetUploader`'s `beginTask`). */
  | { kind: 'task'; task: UploadTaskState; thumbnails: Map<number, string> }
  /** A failure BEFORE any task could start (unsupported type, invalid page selection, PDF wouldn't even open) — shown inline under the drop zone, not the task panel. */
  | { kind: 'error'; message: string };

/** "1, 2, 3" -> `[1, 2, 3]`, dropping anything that doesn't parse as a whole page number — the text-field fallback's own parsing, unchanged from before this pass. */
function parsePagesInput(raw: string): number[] {
  return raw
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((p) => Number.isInteger(p));
}

async function uploadWebp(blob: Blob, signal?: AbortSignal): Promise<UploadedImage> {
  const res = await fetch('/api/actividades/imagen', {
    method: 'POST',
    headers: { 'content-type': 'image/webp' },
    body: blob,
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { path?: string; width?: number; height?: number; error?: string };
  if (!res.ok || !data.path || !data.width || !data.height) {
    throw new Error(data.error ?? 'upload_failed');
  }
  return { path: data.path, width: data.width, height: data.height };
}

/** Builds the task panel's stage label, e.g. "Convirtiendo página 2 de 5" / "Optimizando imagen 1 de 1". */
function stageLabel(t: (typeof UI_LABELS)[Lang]['activities']['worksheet'], state: UploadTaskState): string {
  if (state.stage === 'preparing') return t.taskPreparingPdf;
  if (!state.stage) return '';
  const pageNumber = state.pageNumber ?? 0;
  if (state.kind === 'pdf') {
    const prefix = state.stage === 'converting' ? t.taskConvertingPage : t.taskUploadingPage;
    return `${prefix} ${pageNumber} ${t.taskOf} ${state.total}`;
  }
  const prefix = state.stage === 'converting' ? t.taskOptimizingImage : t.taskUploadingImage;
  return `${prefix} ${pageNumber} ${t.taskOf} ${state.total}`;
}

export default function WorksheetUploader({ lang, onComplete }: WorksheetUploaderProps) {
  const t = UI_LABELS[lang].activities.worksheet;
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragActive, setDragActive] = useState(false);
  const [pagesInput, setPagesInput] = useState('');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnailUrlsRef = useRef<string[]>([]);
  const taskRef = useRef<UploadTask | null>(null);
  const converterRef = useRef<PdfPageConverter | null>(null);

  const revokeThumbnailUrls = useCallback(() => {
    for (const url of thumbnailUrlsRef.current) URL.revokeObjectURL(url);
    thumbnailUrlsRef.current = [];
  }, []);

  const disposeConverter = useCallback(() => {
    void converterRef.current?.dispose();
    converterRef.current = null;
  }, []);

  // Unmount-only cleanup — every earlier transition (a new file picked,
  // leaving the thumbnail grid, or abandoning a failed task) already
  // revokes/disposes explicitly at that point; see those callers below.
  useEffect(
    () => () => {
      taskRef.current?.cancel();
      disposeConverter();
      revokeThumbnailUrls();
    },
    [disposeConverter, revokeThumbnailUrls],
  );

  const errorMessage = useCallback(
    (code: string): string => {
      const errors = t.errors as Record<string, string>;
      return errors[code] ?? errors.upload_failed;
    },
    [t],
  );

  /** Starts a task and wires its lifecycle — shared by the image path and both PDF paths. */
  const beginTask = useCallback(
    (
      kind: UploadTaskKind,
      items: number[],
      thumbnails: Map<number, string>,
      convertItem: (pageNumber: number, signal: AbortSignal) => Promise<Blob>,
    ) => {
      const task = createUploadTask({
        onStateChange: (state) => {
          if (state.status === 'cancelled') {
            disposeConverter();
            taskRef.current = null;
            setStatus({ kind: 'idle' });
            return;
          }
          if (state.status === 'done') {
            disposeConverter();
            taskRef.current = null;
            setStatus({ kind: 'idle' });
            onComplete(state.results);
            return;
          }
          // 'running' or 'error' — the task panel stays up either way,
          // never falling back to the drop zone (see this file's header).
          setStatus({ kind: 'task', task: state, thumbnails });
        },
        errorMessageFor: (err) => (err instanceof Error ? err.message : 'upload_failed'),
      });
      taskRef.current = task;
      task.start({
        kind,
        items,
        pageNumberFor: (pageNumber) => pageNumber,
        convertItem,
        uploadBlob: (blob, signal) => uploadWebp(blob, signal),
      });
    },
    [onComplete, disposeConverter],
  );

  const handleImageFile = useCallback(
    (file: File) => {
      beginTask('image', [1], new Map(), async (_pageNumber, signal) => {
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        return convertImageToWebp(file);
      });
    },
    [beginTask],
  );

  /** Shared by the thumbnail grid's confirm and the text-field fallback's confirm — only how `pages` (and `thumbnails`, when available) were gathered differs. */
  const handlePdfPagesConfirm = useCallback(
    async (file: File, pages: number[], thumbnails: Map<number, string>) => {
      const validated = validatePageSelection(pages);
      if (!validated) {
        setStatus({ kind: 'error', message: errorMessage('pdf_failed') });
        return;
      }

      let converter: PdfPageConverter;
      try {
        converter = await openPdfForConversion(file);
      } catch {
        setStatus({ kind: 'error', message: errorMessage('pdf_failed') });
        return;
      }
      converterRef.current = converter;

      beginTask('pdf', validated, thumbnails, (pageNumber, signal) => converter.convertPage(pageNumber, signal));
    },
    [errorMessage, beginTask],
  );

  const cancelTask = useCallback(() => {
    taskRef.current?.cancel();
  }, []);

  const retryTask = useCallback(() => {
    taskRef.current?.retry();
  }, []);

  /** "Elegir otro archivo" — abandons a failed task entirely and goes back to the drop zone. */
  const chooseAnotherFile = useCallback(() => {
    taskRef.current?.reset();
    taskRef.current = null;
    disposeConverter();
    revokeThumbnailUrls();
    setStatus({ kind: 'idle' });
  }, [disposeConverter, revokeThumbnailUrls]);

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
        handleImageFile(file);
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
          onClick={() => {
            const pages = [...selectedPages].sort((a, b) => a - b);
            const byPage = new Map(thumbnails.map((th) => [th.pageNumber, th.url]));
            void handlePdfPagesConfirm(file, pages, byPage);
          }}
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
          onClick={() => void handlePdfPagesConfirm(status.file, parsePagesInput(pagesInput), new Map())}
        >
          {t.pdfConfirm}
        </Button>
      </div>
    );
  }

  if (status.kind === 'task') {
    const { task, thumbnails } = status;
    const thumbnailUrl = task.pageNumber != null ? thumbnails.get(task.pageNumber) : undefined;
    return (
      <TaskProgress
        label={stageLabel(t, task)}
        progress={task.progress}
        thumbnailUrl={thumbnailUrl}
        thumbnailAlt={thumbnailUrl && task.pageNumber != null ? `${t.pdfPageLabel} ${task.pageNumber}` : undefined}
        cancel={task.status === 'running' ? { label: t.taskCancel, onCancel: cancelTask } : undefined}
        error={
          task.status === 'error'
            ? {
                message: errorMessage(task.errorMessage ?? 'upload_failed'),
                retryLabel: t.taskRetry,
                onRetry: retryTask,
                chooseAnotherLabel: t.taskChooseAnother,
                onChooseAnother: chooseAnotherFile,
              }
            : undefined
        }
      />
    );
  }

  return (
    // The empty-state drop zone — reused both here (the "+ Agregar bloque"
    // flow) and as a brand-new worksheet block's own canvas-area empty state
    // (`BlockList.tsx`, creator polish round 4, owner feedback #2): a large,
    // centered call to action with the upload illustration, one primary
    // button, and a muted formats/size hint — the whole area is the drop
    // zone, with a visible dashed brand-yellow border while dragging over.
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
      <UploadSimpleIcon weight="duotone" size={48} className="text-primary" aria-hidden="true" />
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
      <Button type="button" variant="primary" onClick={() => inputRef.current?.click()}>
        {t.uploadButton}
      </Button>

      {status.kind === 'error' && (
        <p role="alert" data-testid="uploader-error" className="text-sm text-destructive">
          {status.message}
        </p>
      )}
    </div>
  );
}
