import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadAudioBlob } from './audioUpload';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('uploadAudioBlob', () => {
  it("POSTs the blob with its own content-type to /api/actividades/audio", async () => {
    const blob = new Blob(['x'], { type: 'audio/webm' });
    fetchMock.mockResolvedValue(jsonResponse({ path: 'activity-audio-uploads/u/a.webm' }));

    const result = await uploadAudioBlob(blob);

    expect(result).toEqual({ ok: true, path: 'activity-audio-uploads/u/a.webm' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades/audio',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'audio/webm' },
        body: blob,
      }),
    );
  });

  it('falls back to application/octet-stream when the blob has no type', async () => {
    const blob = new Blob(['x']);
    fetchMock.mockResolvedValue(jsonResponse({ path: 'p' }));
    await uploadAudioBlob(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades/audio',
      expect.objectContaining({ headers: { 'content-type': 'application/octet-stream' } }),
    );
  });

  it('returns the error code from a non-ok JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'payload_too_large' }, false, 413));
    const result = await uploadAudioBlob(new Blob(['x'], { type: 'audio/webm' }));
    expect(result).toEqual({ ok: false, error: 'payload_too_large' });
  });

  it('falls back to a generic error when the non-ok response has no parseable body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad');
      },
    } as unknown as Response);
    const result = await uploadAudioBlob(new Blob(['x'], { type: 'audio/webm' }));
    expect(result).toEqual({ ok: false, error: 'upload_failed' });
  });

  it('returns a network_error when fetch itself throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await uploadAudioBlob(new Blob(['x'], { type: 'audio/webm' }));
    expect(result).toEqual({ ok: false, error: 'network_error' });
  });

  it('returns upload_failed when the success response has no usable path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await uploadAudioBlob(new Blob(['x'], { type: 'audio/webm' }));
    expect(result).toEqual({ ok: false, error: 'upload_failed' });
  });

  it('forwards an AbortSignal to fetch', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(jsonResponse({ path: 'p' }));
    await uploadAudioBlob(new Blob(['x'], { type: 'audio/webm' }), controller.signal);
    expect(fetchMock).toHaveBeenCalledWith('/api/actividades/audio', expect.objectContaining({ signal: controller.signal }));
  });
});
