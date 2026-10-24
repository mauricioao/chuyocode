/**
 * Shared client-side upload to `POST /api/actividades/imagen` for a
 * DISPLAY-ONLY image kind (`?purpose=question`/`?purpose=background`) —
 * factored out of `VariosJuegosRow.tsx`'s own `QuestionImageField` (owner
 * decision 2026-10-16, "Varios juegos" question context images) so
 * `BackgroundPicker.tsx` (plantillas: fondo, owner decision 2026-10-23)
 * reuses the exact same convert/upload/error handling instead of a second
 * copy. BROWSER ONLY — `fetch` + `imagePipeline.ts`'s own
 * `convertImageToWebp`, never a server import.
 *
 * Deliberately NOT `uploadTask.ts`'s multi-page state machine:
 * `VariosJuegosRow.tsx`'s own header explains why a single
 * idle/uploading/error state is the whole story for either caller — at most
 * one image, no PDF, no stitching.
 */
import { convertImageToWebp } from './imagePipeline';

/** Source types either caller accepts — images only, never a PDF (no stitching/rotation for a question or background image, owner spec). */
export const ACCEPTED_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** `?purpose=` values this helper knows how to upload for — never `'worksheet'`, which has its own dedicated upload machinery (`WorksheetUploader.tsx`/`uploadTask.ts`). */
export type UploadImagePurpose = 'question' | 'background';

export interface UploadedImage {
  path: string;
  width: number;
  height: number;
}

export type UploadImageResult = { ok: true; image: UploadedImage } | { ok: false; errorCode: string };

/**
 * Converts `file` to WebP ({@link convertImageToWebp}) and `POST`s it to
 * `/api/actividades/imagen?purpose=<purpose>`. On failure, `errorCode` is
 * one of `imagen.ts`'s own reason strings (e.g. `upload_failed`,
 * `unsupported_media_type`, `invalid_dimensions`) — the caller localizes it
 * via `UI_LABELS[lang].activities.worksheet.errors`, the SAME shared error
 * vocabulary regardless of `purpose` (see that file's own header).
 */
export async function uploadActivityImage(file: File, purpose: UploadImagePurpose): Promise<UploadImageResult> {
  try {
    const blob = await convertImageToWebp(file);
    const res = await fetch(`/api/actividades/imagen?purpose=${purpose}`, {
      method: 'POST',
      headers: { 'content-type': 'image/webp' },
      body: blob,
    });
    const data = (await res.json().catch(() => ({}))) as {
      path?: string;
      width?: number;
      height?: number;
      error?: string;
    };
    if (!res.ok || !data.path || !data.width || !data.height) {
      return { ok: false, errorCode: data.error ?? 'upload_failed' };
    }
    return { ok: true, image: { path: data.path, width: data.width, height: data.height } };
  } catch {
    return { ok: false, errorCode: 'upload_failed' };
  }
}
