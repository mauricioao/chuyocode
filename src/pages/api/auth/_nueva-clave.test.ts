/**
 * Integration tests for POST /api/auth/nueva-clave — set a new password for
 * the already signed-in caller (second half of the reset flow).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { POST } from './nueva-clave';

const SESSION_COOKIE = 'sb-x-auth-token=rotated; Path=/; HttpOnly; SameSite=Lax';

function ctx(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
  const request = new Request('https://chuyocode.com/api/auth/nueva-clave', {
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

describe('POST /api/auth/nueva-clave', () => {
  it('rejects an anonymous caller before touching Supabase', async () => {
    const res = await POST(ctx({ password: 'longenough1' }, null));

    expect(res.status).toBe(401);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than the minimum before touching Supabase', async () => {
    const res = await POST(ctx({ password: 'short' }));

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const res = await POST(ctx('not-json{'));

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('updates the password and flushes the rotated session cookie', async () => {
    const res = await POST(ctx({ password: 'longenough1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'longenough1' });
    expect(res.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
  });

  it('answers 500 without a 500 stack trace leaking, when Supabase rejects the update', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: { message: 'weak password' } });
    const res = await POST(ctx({ password: 'longenough1' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'update_failed' });
  });

  it('degrades an unreachable Supabase to the same failure shape, not an unhandled throw', async () => {
    updateUserMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ password: 'longenough1' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'update_failed' });
  });

  it('keeps the answer out of every cache', async () => {
    const res = await POST(ctx({ password: 'longenough1' }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
