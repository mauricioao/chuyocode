/**
 * Integration tests for POST /api/cuenta/nombre — update the signed-in
 * caller's own display name (Perfil page, T3). Same mocking posture as
 * `_eliminar.test.ts`/`_nueva-clave.test.ts`: `createSessionClient` is a
 * hoisted stub, `flushSessionHeaders` is left REAL so the cookie assertions
 * below mean something.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { createSessionClientMock, updateUserMock } = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

import { POST } from './nombre';

const SESSION_COOKIE = 'sb-x-auth-token=rotated; Path=/; HttpOnly; SameSite=Lax';
const USER: User = { id: 'user-1', email: 'lector@example.com' } as User;

function ctx(body: unknown, user: User | null = USER) {
  const request = new Request('https://chuyocode.com/api/cuenta/nombre', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createSessionClientMock.mockImplementation(() => ({
    client: { auth: { updateUser: updateUserMock } },
    pendingHeaders: new Map<string, string>(),
    pendingCookies: [SESSION_COOKIE],
  }));
  updateUserMock.mockResolvedValue({ data: {}, error: null });
});

describe('POST /api/cuenta/nombre — identity', () => {
  it('401s an anonymous caller, and nothing else runs', async () => {
    const res = await POST(ctx({ name: 'Juan' }, null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cuenta/nombre — validation', () => {
  it('400s a body that is not JSON', async () => {
    const res = await POST(ctx('not-json{'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_name' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('400s a text/plain body even when it is JSON-shaped (cross-site form)', async () => {
    // request.json() parses this happily; only the content-type tells it apart.
    const request = new Request('https://chuyocode.com/api/cuenta/nombre', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ name: 'Pwned' }),
    });
    const res = await POST({ request, locals: { user: USER } } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_name' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('400s an empty name', async () => {
    const res = await POST(ctx({ name: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_name' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('400s a name over 60 characters', async () => {
    const res = await POST(ctx({ name: 'a'.repeat(61) }));
    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('400s a name containing a control character', async () => {
    const res = await POST(ctx({ name: 'Juan\u0000Perez' }));
    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('400s a non-string name', async () => {
    const res = await POST(ctx({ name: 42 }));
    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cuenta/nombre — success', () => {
  it('trims and collapses whitespace, then stores it under display_name', async () => {
    const res = await POST(ctx({ name: '  Juan   Perez  ' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'Juan Perez' });
    expect(updateUserMock).toHaveBeenCalledWith({ data: { display_name: 'Juan Perez' } });
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(ctx({ name: 'Juan' }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('carries the rotated Set-Cookie on the response it returns', async () => {
    const res = await POST(ctx({ name: 'Juan' }));
    expect(res.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
  });
});

describe('POST /api/cuenta/nombre — Supabase failures', () => {
  it('500s without leaking the raw Supabase error, when updateUser fails', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: { message: 'db is down' } });
    const res = await POST(ctx({ name: 'Juan' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'update_failed' });
  });

  it('degrades an unreachable Supabase to the same failure shape, not an unhandled throw', async () => {
    updateUserMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ name: 'Juan' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'update_failed' });
  });
});
