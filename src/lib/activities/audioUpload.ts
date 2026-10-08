/**
 * Browser-side upload helper for a worksheet audio marker ("colocar un
 * audio propio") — POSTs either an uploaded file or a `useAudioRecorder`
 * recording straight to `/api/actividades/audio`, mirroring
 * `WorksheetUploader.tsx`'s own `uploadWebp` shape, over the audio endpoint
 * instead of the image one.
 */

export type AudioUploadResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Upload `blob` (a picked file or a recorder's own output) to the
 * pre-moderation audio-uploads bucket. `blob.type` becomes the request's
 * `content-type` — the endpoint rejects anything it does not recognize
 * (415) or whose bytes don't match that type's own magic bytes (422).
 */
export async function uploadAudioBlob(blob: Blob, signal?: AbortSignal): Promise<AudioUploadResult> {
  let res: Response;
  try {
    res = await fetch('/api/actividades/audio', {
      method: 'POST',
      headers: { 'content-type': blob.type || 'application/octet-stream' },
      body: blob,
      signal,
    });
  } catch {
    return { ok: false, error: 'network_error' };
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const error =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'upload_failed';
    return { ok: false, error };
  }

  const data: unknown = await res.json().catch(() => null);
  if (!data || typeof data !== 'object' || typeof (data as { path?: unknown }).path !== 'string') {
    return { ok: false, error: 'upload_failed' };
  }
  return { ok: true, path: (data as { path: string }).path };
}
