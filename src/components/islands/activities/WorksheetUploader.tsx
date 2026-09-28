/**
 * WorksheetUploader — the "empty state" of a worksheet block: drop/pick an
 * image or a PDF, convert it client-side to WebP via
 * `src/lib/activities/imagePipeline.ts`, and upload each resulting blob to
 * `POST /api/actividades/imagen` (PR B, "Activities creator"). The server
 * never sees the original file, only what the pipeline produces.
 *
 * A PDF asks for its page selection FIRST (a plain page-number input — up to
 * `MAX_PDF_PAGES` — rather than rendered thumbnails, which would mean
 * loading `pdfjs-dist` twice for a picker that then throws its render away;
 * see this PR's report for the tradeoff). Each chosen page becomes its own
 * uploaded image, IN ORDER, so the caller can turn every one into its own
 * worksheet block.
 *
 * MANUAL/PLAYWRIGHT CHECK for the real canvas/`<img>`/`pdfjs-dist` decoding
 * (jsdom cannot meaningfully run it) — same posture as
 * `imagePipeline.ts`'s own header. Automated tests here mock the pipeline
 * and `fetch`, and cover this component's OWN decisions: routing, progress,
 * error mapping, and the shape of what it hands back.
 */
import { useCallback, useRef, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import {
  routeFileType,
  validatePageSelection,
  convertImageToWebp,
  convertPdfPagesToWebp,
  MAX_PDF_PAGES,
} from '@/lib/activities/imagePipeline';
import { Button } from '@/components/ui/button';

export interface UploadedImage {
  path: string;
  width: number;
  height: number;
}

export interface WorksheetUploaderProps {
  lang: Lang;
  onComplete: (images: UploadedImage[]) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'picking-pages'; file: File }
  | { kind: 'uploading'; progress: string }
  | { kind: 'error'; message: string };

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

export default function WorksheetUploader({ lang, onComplete }: WorksheetUploaderProps) {
  const t = UI_LABELS[lang].activities.worksheet;
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragActive, setDragActive] = useState(false);
  const [pagesInput, setPagesInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handlePdfPagesConfirm = useCallback(
    async (file: File) => {
      const pages = pagesInput
        .split(',')
        .map((p) => Number.parseInt(p.trim(), 10))
        .filter((p) => Number.isInteger(p));
      const validated = validatePageSelection(pages);
      if (!validated) {
        setStatus({ kind: 'error', message: errorMessage('pdf_failed') });
        return;
      }

      setStatus({ kind: 'uploading', progress: t.uploadProgress });
      try {
        const blobs = await convertPdfPagesToWebp(file, validated);
        const images: UploadedImage[] = [];
        for (const blob of blobs) {
          images.push(await uploadWebp(blob));
        }
        setStatus({ kind: 'idle' });
        onComplete(images);
      } catch (err) {
        const code = err instanceof Error ? err.message : 'pdf_failed';
        setStatus({ kind: 'error', message: errorMessage(code) });
      }
    },
    [pagesInput, t, errorMessage, onComplete],
  );

  const handleFile = useCallback(
    (file: File) => {
      const kind = routeFileType(file);
      if (kind === 'image') {
        void handleImageFile(file);
      } else if (kind === 'pdf') {
        setPagesInput('');
        setStatus({ kind: 'picking-pages', file });
      } else {
        setStatus({ kind: 'error', message: errorMessage('unsupported_media_type') });
      }
    },
    [handleImageFile, errorMessage],
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

  if (status.kind === 'picking-pages') {
    return (
      <div data-testid="worksheet-uploader-pages" className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium text-foreground">{t.pdfPagesTitle}</p>
        <p className="text-xs text-muted-foreground">{t.pdfPagesHint}</p>
        <label className="flex flex-col gap-1 text-sm">
          {t.pdfPageLabel}
          <input
            type="text"
            data-testid="pdf-pages-input"
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="1, 2, 3"
            maxLength={MAX_PDF_PAGES * 4}
            className="h-9 rounded border border-border bg-background px-2 text-foreground"
          />
        </label>
        <Button type="button" data-testid="pdf-pages-confirm" onClick={() => void handlePdfPagesConfirm(status.file)}>
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
