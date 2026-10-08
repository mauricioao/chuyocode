/**
 * Integration tests for `/api/actividades/audio` (POST upload, GET
 * preview). `@lib/activities/storage` and `@lib/roles` are mocked, same
 * posture as `_imagen.test.ts` — this isolates the endpoint's own decisions
 * (auth guard, content-type/size/magic-bytes checks, response shape) from
 * the storage/role data layers, which have their own tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { storageMocks, requireRoleMock } = vi.hoisted(() => ({
  storageMocks: {
    isOwnAudioUploadPath: vi.fn(),
    isPublicAudioPath: vi.fn(),
    publicAudioUrl: vi.fn(),
    signedAudioReadUrl: vi.fn(),
    uploadToAudioUploadsBucket: vi.fn(),
    countUserAudioUploads: vi.fn(),
  },
  requireRoleMock: vi.fn(),
}));

vi.mock('@lib/activities/storage', () => ({
  ...storageMocks,
  MAX_AUDIO_UPLOADS_PER_USER: 100,
  AUDIO_EXTENSIONS: {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
  },
}));

vi.mock('@lib/roles', () => ({
  requireRole: requireRoleMock,
}));

import { POST, GET } from './audio';

const USER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const OTHER_USER_PATH =
  'activity-audio-uploads/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.webm';
const OWN_PATH =
  'activity-audio-uploads/11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333.webm';
const PUBLIC_PATH =
  'activity-audio/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333.webm';

const VALID_WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0]);
const VALID_WAV = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0, 0,
]);

function uploadRequest(body: Uint8Array | undefined, contentType = 'audio/webm'): Request {
  return new Request('https://chuyo.test/api/actividades/audio', {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body: body as BodyInit | undefined,
  });
}

function postCtx(args: { user?: User | null; body?: Uint8Array; contentType?: string }) {
  const { user = USER, body = VALID_WEBM, contentType = 'audio/webm' } = args;
  return {
    request: uploadRequest(body, contentType),
    locals: { user },
  } as unknown as Parameters<typeof POST>[0];
}

function getCtx(args: { user?: User | null; path?: string }) {
  const { user = USER, path } = args;
  const url = new URL('https://chuyo.test/api/actividades/audio');
  if (path !== undefined) url.searchParams.set('path', path);
  return {
    request: new Request(url),
    locals: { user },
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.countUserAudioUploads.mockResolvedValue(0);
  storageMocks.uploadToAudioUploadsBucket.mockResolvedValue(OWN_PATH);
  storageMocks.isOwnAudioUploadPath.mockReturnValue(false);
  storageMocks.isPublicAudioPath.mockReturnValue(false);
  storageMocks.publicAudioUrl.mockReturnValue(null);
  storageMocks.signedAudioReadUrl.mockResolvedValue(null);
  requireRoleMock.mockResolvedValue(null);
});

describe('POST /api/actividades/audio — identity', () => {
  it('401s an anonymous upload, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ user: null }));
    expect(res.status).toBe(401);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/audio — content-type', () => {
  it('415s an unaccepted content-type, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ contentType: 'audio/flac' }));
    expect(res.status).toBe(415);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });

  it('415s a missing content-type', async () => {
    const res = await POST(postCtx({ contentType: '' }));
    expect(res.status).toBe(415);
  });

  it('accepts every documented content-type whose magic bytes match', async () => {
    expect((await POST(postCtx({ contentType: 'audio/webm', body: VALID_WEBM }))).status).toBe(200);
    expect((await POST(postCtx({ contentType: 'audio/wav', body: VALID_WAV }))).status).toBe(200);
  });
});

describe('POST /api/actividades/audio — body size', () => {
  it('400s an empty body, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ body: new Uint8Array(0) }));
    expect(res.status).toBe(400);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });

  it('413s a body over 5 MB, and nothing is uploaded', async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(VALID_WEBM);
    const res = await POST(postCtx({ body: oversized }));
    expect(res.status).toBe(413);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/audio — magic bytes', () => {
  it('422s a body with the right content-type but mismatched magic bytes, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ contentType: 'audio/webm', body: VALID_WAV }));
    expect(res.status).toBe(422);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/audio — per-user cap', () => {
  it('429s when the caller already has >= 100 audio uploads, and nothing is uploaded', async () => {
    storageMocks.countUserAudioUploads.mockResolvedValue(100);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(429);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });

  it('429s (fails CLOSED) when the count itself could not be read', async () => {
    storageMocks.countUserAudioUploads.mockResolvedValue(null);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(429);
    expect(storageMocks.uploadToAudioUploadsBucket).not.toHaveBeenCalled();
  });

  it('allows exactly 99 existing uploads through', async () => {
    storageMocks.countUserAudioUploads.mockResolvedValue(99);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/audio — storage failure', () => {
  it('500s when the storage write fails', async () => {
    storageMocks.uploadToAudioUploadsBucket.mockResolvedValue(null);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/actividades/audio — success', () => {
  it("uploads under the caller's own id and returns { path }", async () => {
    const res = await POST(postCtx({}));
    expect(res.status).toBe(200);
    expect(storageMocks.uploadToAudioUploadsBucket).toHaveBeenCalledWith(
      USER.id,
      expect.any(String),
      expect.any(Uint8Array),
      'audio/webm',
    );
    expect(await res.json()).toEqual({ path: OWN_PATH });
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(postCtx({}));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /api/actividades/audio — bad request', () => {
  it('400s a missing path', async () => {
    const res = await GET(getCtx({ path: undefined }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/actividades/audio — public audio path', () => {
  it('redirects anonymously, with no identity check at all', async () => {
    storageMocks.isPublicAudioPath.mockReturnValue(true);
    storageMocks.publicAudioUrl.mockReturnValue('https://public.example/activity-audio/x.webm?redirect=1');
    const res = await GET(getCtx({ user: null, path: PUBLIC_PATH }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://public.example/activity-audio/x.webm?redirect=1');
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('404s a public-shaped path whose public URL cannot be built', async () => {
    storageMocks.isPublicAudioPath.mockReturnValue(true);
    storageMocks.publicAudioUrl.mockReturnValue(null);
    const res = await GET(getCtx({ user: null, path: PUBLIC_PATH }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/actividades/audio — private uploads path', () => {
  it('401s an anonymous request for a private path', async () => {
    const res = await GET(getCtx({ user: null, path: OWN_PATH }));
    expect(res.status).toBe(401);
    expect(storageMocks.signedAudioReadUrl).not.toHaveBeenCalled();
  });

  it('redirects the owner to a signed URL', async () => {
    storageMocks.isOwnAudioUploadPath.mockReturnValue(true);
    storageMocks.signedAudioReadUrl.mockResolvedValue('https://signed.example/own?token=abc');
    const res = await GET(getCtx({ path: OWN_PATH }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://signed.example/own?token=abc');
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it("404s another user's upload for a non-moderator caller (never leaking existence)", async () => {
    storageMocks.isOwnAudioUploadPath.mockReturnValue(false);
    requireRoleMock.mockResolvedValue(null);
    const res = await GET(getCtx({ path: OTHER_USER_PATH }));
    expect(res.status).toBe(404);
    expect(storageMocks.signedAudioReadUrl).not.toHaveBeenCalled();
  });

  it("redirects a moderator viewing another user's upload", async () => {
    storageMocks.isOwnAudioUploadPath.mockReturnValue(false);
    requireRoleMock.mockResolvedValue(USER);
    storageMocks.signedAudioReadUrl.mockResolvedValue('https://signed.example/mod?token=xyz');
    const res = await GET(getCtx({ path: OTHER_USER_PATH }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://signed.example/mod?token=xyz');
  });

  it('404s when authorized but the signed URL could not be created', async () => {
    storageMocks.isOwnAudioUploadPath.mockReturnValue(true);
    storageMocks.signedAudioReadUrl.mockResolvedValue(null);
    const res = await GET(getCtx({ path: OWN_PATH }));
    expect(res.status).toBe(404);
  });

  it('marks the response private/no-store', async () => {
    storageMocks.isOwnAudioUploadPath.mockReturnValue(true);
    storageMocks.signedAudioReadUrl.mockResolvedValue('https://signed.example/own?token=abc');
    const res = await GET(getCtx({ path: OWN_PATH }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
