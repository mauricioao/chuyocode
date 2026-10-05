/**
 * Integration tests for POST /api/cuenta/contrasena — change the signed-in
 * caller's own password (Perfil page, T3). Same mocking posture as
 * `_eliminar.test.ts`/`_nueva-clave.test.ts`: `createSessionClient` is a
 * hoisted stub, `flushSessionHeaders` is left REAL so the cookie assertions
 * below mean something.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { createSessionClientMock, signInWithPasswordMock, updateUserMock } = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

import { POST } from './contrasena';

const SESSION_COOKIE = 'sb-x-auth-token=rotated; Path=/; HttpOnly; SameSite=Lax';

const PASSWORD_USER: User = {
  id: 'user-1',
  email: 'lector@example.com',
  identities: [{ provider: 'email' }],
} as unknown as User;

const GOOGLE_ONLY_USER: User = {
  id: 'user-2',
  email: 'juan@gmail.com',
  identities: [{ provider: 'google' }],
} as unknown as User;

function ctx(body: unknown, user: User | null = PASSWORD_USER) {
  const request = new Request('https://chuyocode.com/api/cuenta/contrasena', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createSessionClientMock.mockImplementation(() => ({
    client: { auth: { signInWithPassword: signInWithPasswordMock, updateUser: updateUserMock } },
    pendingHeaders: new Map<string, string>(),
    pendingCookies: [SESSION_COOKIE],
  }));
  signInWithPasswordMock.mockResolvedValue({ data: {}, error: null });
  updateUserMock.mockResolvedValue({ data: {}, error: null });
});

describe('POST /api/cuenta/contrasena — identity', () => {
  it('401s an anonymous caller, and nothing else runs', async () => {
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }, null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cuenta/contrasena — validation', () => {
  it('400s a body that is not JSON', async () => {
    const res = await POST(ctx('not-json{'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('400s a missing currentPassword', async () => {
    const res = await POST(ctx({ newPassword: 'new-password1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('400s a newPassword shorter than the minimum, before touching Supabase', async () => {
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'short' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('400s with no_password_identity for a Google-only account, before touching Supabase', async () => {
    const res = await POST(
      ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }, GOOGLE_ONLY_USER),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'no_password_identity' });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cuenta/contrasena — current password verification', () => {
  it('verifies via signInWithPassword using the caller\'s own email and the submitted currentPassword', async () => {
    await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'lector@example.com',
      password: 'old-password1',
    });
  });

  it('401s invalid_current_password when the current password is wrong, and never calls updateUser', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: {},
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });
    const res = await POST(ctx({ currentPassword: 'wrong-password', newPassword: 'new-password1' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_current_password' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('401s invalid_current_password when the verification call itself throws', async () => {
    signInWithPasswordMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_current_password' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cuenta/contrasena — success', () => {
  it('updates to the NEW password only (never re-sends the current one)', async () => {
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'new-password1' });
    expect(updateUserMock).not.toHaveBeenCalledWith(expect.objectContaining({ password: 'old-password1' }));
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('carries the rotated Set-Cookie on the response it returns', async () => {
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));
    expect(res.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
  });
});

describe('POST /api/cuenta/contrasena — updateUser failures, mapped by Supabase\'s own error code', () => {
  it('maps reauthentication_needed to a dedicated code, never a raw Supabase message', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: { message: 'reauth needed', code: 'reauthentication_needed' } });
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'reauthentication_needed' });
  });

  it('maps same_password to a dedicated code', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: { message: 'same password', code: 'same_password' } });
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'same_password' });
  });

  it('maps weak_password to a dedicated code', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: { message: 'weak password', code: 'weak_password' } });
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'weak_password' });
  });

  it('falls back to a generic update_failed for an unrecognized error code, without leaking it', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: { message: 'db is down', code: 'unexpected_failure' } });
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'update_failed' });
  });

  it('degrades an unreachable Supabase to the same failure shape, not an unhandled throw', async () => {
    updateUserMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ currentPassword: 'old-password1', newPassword: 'new-password1' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'update_failed' });
  });
});
