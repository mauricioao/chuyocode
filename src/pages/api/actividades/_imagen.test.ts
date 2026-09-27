/**
 * Integration tests for `/api/actividades/imagen` (POST upload, GET
 * preview). `@lib/activities/storage` and `@lib/roles` are mocked so this
 * isolates the endpoint's own decisions (auth guard, content-type/size/
 * magic-bytes/dimension checks, response shape) from the storage/role data
 * layers, which have their own tests (`storage.test.ts`, `roles.test.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { storageMocks, requireRoleMock } = vi.hoisted(() => ({
  storageMocks: {
    isOwnUploadPath: vi.fn(),
    isPublicImagePath: vi.fn(),
    publicImageUrl: vi.fn(),
    signedReadUrl: vi.fn(),
    uploadToUploadsBucket: vi.fn(),
    countUserUploads: vi.fn(),
  },
  requireRoleMock: vi.fn(),
}));

vi.mock('@lib/activities/storage', () => ({
  ...storageMocks,
  MAX_UPLOADS_PER_USER: 100,
}));

vi.mock('@lib/roles', () => ({
  requireRole: requireRoleMock,
}));

import { POST, GET } from './imagen';

const USER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const OTHER_USER_PATH = 'activity-uploads/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.webp';
const OWN_PATH = 'activity-uploads/11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333.webp';
const PUBLIC_PATH = 'activity-images/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333.webp';

// --- Minimal real WebP (VP8, lossy) fixture builder — same byte layout as
// `webp.test.ts`'s: real RIFF/VP8 container header, spec-accurate.
function buildLossyWebp(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  payload[0] = 0x10;
  payload[3] = 0x9d;
  payload[4] = 0x01;
  payload[5] = 0x2a;
  payload[6] = width & 0xff;
  payload[7] = (width >>> 8) & 0x3f;
  payload[8] = height & 0xff;
  payload[9] = (height >>> 8) & 0x3f;

  const chunkSize = payload.length;
  const riffSize = 4 + 8 + chunkSize;
  const buf = new Uint8Array(8 + riffSize);
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  buf[4] = riffSize & 0xff;
  buf[5] = (riffSize >>> 8) & 0xff;
  buf[6] = (riffSize >>> 16) & 0xff;
  buf[7] = (riffSize >>> 24) & 0xff;
  buf.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  buf.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  buf[16] = chunkSize & 0xff;
  buf.set(payload, 20);
  return buf;
}

const VALID_WEBP = buildLossyWebp(800, 600);
const TOO_SMALL_WEBP = buildLossyWebp(100, 100);
const TOO_LARGE_WEBP = buildLossyWebp(3000, 3000);

function uploadRequest(body: Uint8Array | undefined, contentType = 'image/webp'): Request {
  return new Request('https://chuyo.test/api/actividades/imagen', {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body: body as BodyInit | undefined,
  });
}

function postCtx(args: { user?: User | null; body?: Uint8Array; contentType?: string }) {
  const { user = USER, body = VALID_WEBP, contentType = 'image/webp' } = args;
  return {
    request: uploadRequest(body, contentType),
    locals: { user },
  } as unknown as Parameters<typeof POST>[0];
}

function getCtx(args: { user?: User | null; path?: string }) {
  const { user = USER, path } = args;
  const url = new URL('https://chuyo.test/api/actividades/imagen');
  if (path !== undefined) url.searchParams.set('path', path);
  return {
    request: new Request(url),
    locals: { user },
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.countUserUploads.mockResolvedValue(0);
  storageMocks.uploadToUploadsBucket.mockResolvedValue(OWN_PATH);
  storageMocks.isOwnUploadPath.mockReturnValue(false);
  storageMocks.isPublicImagePath.mockReturnValue(false);
  storageMocks.publicImageUrl.mockReturnValue(null);
  storageMocks.signedReadUrl.mockResolvedValue(null);
  requireRoleMock.mockResolvedValue(null);
});

describe('POST /api/actividades/imagen — identity', () => {
  it('401s an anonymous upload, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ user: null }));
    expect(res.status).toBe(401);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/imagen — content-type', () => {
  it('415s a non-webp content-type, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ contentType: 'image/png' }));
    expect(res.status).toBe(415);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });

  it('415s a missing content-type', async () => {
    const res = await POST(postCtx({ contentType: '' }));
    expect(res.status).toBe(415);
  });
});

describe('POST /api/actividades/imagen — body size', () => {
  it('400s an empty body, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ body: new Uint8Array(0) }));
    expect(res.status).toBe(400);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });

  it('413s a body over 2 MB, and nothing is uploaded', async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
    const res = await POST(postCtx({ body: oversized }));
    expect(res.status).toBe(413);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/imagen — magic bytes and header', () => {
  it('422s a body with the right content-type but no webp magic, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ body: new Uint8Array(100) }));
    expect(res.status).toBe(422);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/imagen — dimensions', () => {
  it('422s an image below the 200px floor, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ body: TOO_SMALL_WEBP }));
    expect(res.status).toBe(422);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });

  it('422s an image above the 2400px ceiling, and nothing is uploaded', async () => {
    const res = await POST(postCtx({ body: TOO_LARGE_WEBP }));
    expect(res.status).toBe(422);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });

  it('accepts an image exactly at the 200px floor', async () => {
    const res = await POST(postCtx({ body: buildLossyWebp(200, 200) }));
    expect(res.status).toBe(200);
  });

  it('accepts an image exactly at the 2400px ceiling', async () => {
    const res = await POST(postCtx({ body: buildLossyWebp(2400, 2400) }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/imagen — per-user cap', () => {
  it('429s when the caller already has >= 100 uploads, and nothing is uploaded', async () => {
    storageMocks.countUserUploads.mockResolvedValue(100);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(429);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });

  it('429s (fails CLOSED) when the count itself could not be read', async () => {
    storageMocks.countUserUploads.mockResolvedValue(null);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(429);
    expect(storageMocks.uploadToUploadsBucket).not.toHaveBeenCalled();
  });

  it('allows exactly 99 existing uploads through', async () => {
    storageMocks.countUserUploads.mockResolvedValue(99);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/imagen — storage failure', () => {
  it('500s when the storage write fails', async () => {
    storageMocks.uploadToUploadsBucket.mockResolvedValue(null);
    const res = await POST(postCtx({}));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/actividades/imagen — success', () => {
  it('uploads under the caller\'s own id and returns { path, width, height }', async () => {
    const res = await POST(postCtx({}));
    expect(res.status).toBe(200);
    expect(storageMocks.uploadToUploadsBucket).toHaveBeenCalledWith(
      USER.id,
      expect.any(String),
      expect.any(Uint8Array),
    );
    expect(await res.json()).toEqual({ path: OWN_PATH, width: 800, height: 600 });
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(postCtx({}));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /api/actividades/imagen — bad request', () => {
  it('400s a missing path', async () => {
    const res = await GET(getCtx({ path: undefined }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/actividades/imagen — public images path', () => {
  it('redirects anonymously, with no identity check at all', async () => {
    storageMocks.isPublicImagePath.mockReturnValue(true);
    storageMocks.publicImageUrl.mockReturnValue('https://public.example/activity-images/x.webp?redirect=1');
    const res = await GET(getCtx({ user: null, path: PUBLIC_PATH }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://public.example/activity-images/x.webp?redirect=1');
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('404s a public-shaped path whose public URL cannot be built', async () => {
    storageMocks.isPublicImagePath.mockReturnValue(true);
    storageMocks.publicImageUrl.mockReturnValue(null);
    const res = await GET(getCtx({ user: null, path: PUBLIC_PATH }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/actividades/imagen — private uploads path', () => {
  it('401s an anonymous request for a private path', async () => {
    const res = await GET(getCtx({ user: null, path: OWN_PATH }));
    expect(res.status).toBe(401);
    expect(storageMocks.signedReadUrl).not.toHaveBeenCalled();
  });

  it('redirects the owner to a signed URL', async () => {
    storageMocks.isOwnUploadPath.mockReturnValue(true);
    storageMocks.signedReadUrl.mockResolvedValue('https://signed.example/own?token=abc');
    const res = await GET(getCtx({ path: OWN_PATH }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://signed.example/own?token=abc');
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('404s another user\'s upload for a non-moderator caller (never leaking existence)', async () => {
    storageMocks.isOwnUploadPath.mockReturnValue(false);
    requireRoleMock.mockResolvedValue(null);
    const res = await GET(getCtx({ path: OTHER_USER_PATH }));
    expect(res.status).toBe(404);
    expect(storageMocks.signedReadUrl).not.toHaveBeenCalled();
  });

  it('redirects a moderator viewing another user\'s upload', async () => {
    storageMocks.isOwnUploadPath.mockReturnValue(false);
    requireRoleMock.mockResolvedValue(USER);
    storageMocks.signedReadUrl.mockResolvedValue('https://signed.example/mod?token=xyz');
    const res = await GET(getCtx({ path: OTHER_USER_PATH }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://signed.example/mod?token=xyz');
  });

  it('404s when authorized but the signed URL could not be created', async () => {
    storageMocks.isOwnUploadPath.mockReturnValue(true);
    storageMocks.signedReadUrl.mockResolvedValue(null);
    const res = await GET(getCtx({ path: OWN_PATH }));
    expect(res.status).toBe(404);
  });

  it('marks the response private/no-store', async () => {
    storageMocks.isOwnUploadPath.mockReturnValue(true);
    storageMocks.signedReadUrl.mockResolvedValue('https://signed.example/own?token=abc');
    const res = await GET(getCtx({ path: OWN_PATH }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
