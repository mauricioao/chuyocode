import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./imagePipeline', () => ({
  convertImageToWebp: vi.fn(async () => new Blob(['webp-bytes'], { type: 'image/webp' })),
}));

import { uploadActivityImage, ACCEPTED_IMAGE_TYPES } from './imageUpload';
import { convertImageToWebp } from './imagePipeline';

const FILE = new File(['source-bytes'], 'photo.jpg', { type: 'image/jpeg' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('ACCEPTED_IMAGE_TYPES', () => {
  it('accepts jpeg, png and webp, never a PDF', () => {
    expect(ACCEPTED_IMAGE_TYPES.has('image/jpeg')).toBe(true);
    expect(ACCEPTED_IMAGE_TYPES.has('image/png')).toBe(true);
    expect(ACCEPTED_IMAGE_TYPES.has('image/webp')).toBe(true);
    expect(ACCEPTED_IMAGE_TYPES.has('application/pdf')).toBe(false);
  });
});

describe('uploadActivityImage', () => {
  it('converts the file to WebP, then POSTs it with the given ?purpose=', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ path: 'activity-uploads/u1/background-x.webp', width: 1200, height: 800 }));

    const result = await uploadActivityImage(FILE, 'background');

    expect(convertImageToWebp).toHaveBeenCalledWith(FILE);
    expect(fetch).toHaveBeenCalledWith(
      '/api/actividades/imagen?purpose=background',
      expect.objectContaining({ method: 'POST', headers: { 'content-type': 'image/webp' } }),
    );
    expect(result).toEqual({
      ok: true,
      image: { path: 'activity-uploads/u1/background-x.webp', width: 1200, height: 800 },
    });
  });

  it('uses the question purpose when asked', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ path: 'activity-uploads/u1/question-x.webp', width: 400, height: 300 }));
    await uploadActivityImage(FILE, 'question');
    expect(fetch).toHaveBeenCalledWith('/api/actividades/imagen?purpose=question', expect.anything());
  });

  it('returns the server error code on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_dimensions' }, 422));
    const result = await uploadActivityImage(FILE, 'background');
    expect(result).toEqual({ ok: false, errorCode: 'invalid_dimensions' });
  });

  it('falls back to upload_failed when the response has no error code', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));
    const result = await uploadActivityImage(FILE, 'background');
    expect(result).toEqual({ ok: false, errorCode: 'upload_failed' });
  });

  it('falls back to upload_failed when a 200 response is missing path/width/height', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ path: 'x' }, 200));
    const result = await uploadActivityImage(FILE, 'background');
    expect(result).toEqual({ ok: false, errorCode: 'upload_failed' });
  });

  it('returns upload_failed when fetch itself throws (offline/network error)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const result = await uploadActivityImage(FILE, 'background');
    expect(result).toEqual({ ok: false, errorCode: 'upload_failed' });
  });

  it('returns upload_failed when the conversion itself throws (bad image decode)', async () => {
    vi.mocked(convertImageToWebp).mockRejectedValueOnce(new Error('decode failed'));
    const result = await uploadActivityImage(FILE, 'background');
    expect(result).toEqual({ ok: false, errorCode: 'upload_failed' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
