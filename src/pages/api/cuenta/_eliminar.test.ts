/**
 * Integration tests for POST /api/cuenta/eliminar.
 *
 * `deleteAccount` (`@lib/accountDeletion`) is mocked — its own orchestration
 * is covered by `accountDeletion.test.ts`; this file proves the ROUTE's own
 * decisions: the 401/400 guards, which error code maps to which status, and
 * — on success only — that the session is actually signed out and the
 * clearing `Set-Cookie` directives reach the `Response` this route returns.
 * Same posture as `_signout.test.ts`: `createSessionClient` is mocked (a
 * hoisted stub), but `flushSessionHeaders` is left REAL so the cookie
 * assertions below mean something.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { deleteAccountMock, createSessionClientMock, signOutMock, pendingHeaders, pendingCookies } = vi.hoisted(
  () => ({
    deleteAccountMock: vi.fn(),
    createSessionClientMock: vi.fn(),
    signOutMock: vi.fn(),
    pendingHeaders: new Map<string, string>(),
    pendingCookies: [] as string[],
  }),
);

vi.mock('@lib/accountDeletion', () => ({ deleteAccount: deleteAccountMock }));

// `@lib/supabaseSession` reads the Supabase URL/anon key at module init —
// same stub `_signout.test.ts` uses so the module really loads.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  // 🔴 `flushSessionHeaders` IS DELIBERATELY NOT MOCKED — see file header.
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

import { POST } from './eliminar';

const USER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CLEAR_CHUNK_0 = 'sb-x-auth-token.0=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

function ctx(args: { user?: User | null; body?: unknown; noBody?: boolean }) {
  const { user = USER, body = { confirm: 'ELIMINAR' }, noBody = false } = args;
  const request = new Request('https://chuyo.test/api/cuenta/eliminar', {
    method: 'POST',
    ...(noBody ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingHeaders.clear();
  pendingCookies.length = 0;
  createSessionClientMock.mockReturnValue({
    client: { auth: { signOut: signOutMock } },
    pendingHeaders,
    pendingCookies,
  });
  signOutMock.mockResolvedValue({ error: null });
  deleteAccountMock.mockResolvedValue({ ok: true });
});

describe('POST /api/cuenta/eliminar — identity', () => {
  it('401s an anonymous caller, and nothing else runs', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cuenta/eliminar — confirmation word', () => {
  it('400s a missing body', async () => {
    const res = await POST(ctx({ noBody: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'confirmation_required' });
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it('400s a body with no confirm field', async () => {
    const res = await POST(ctx({ body: {} }));
    expect(res.status).toBe(400);
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it('400s the wrong word', async () => {
    const res = await POST(ctx({ body: { confirm: 'eliminar' } }));
    expect(res.status).toBe(400);
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it('400s a non-string confirm', async () => {
    const res = await POST(ctx({ body: { confirm: true } }));
    expect(res.status).toBe(400);
  });

  it('accepts the exact Spanish word, ELIMINAR', async () => {
    const res = await POST(ctx({ body: { confirm: 'ELIMINAR' } }));
    expect(res.status).toBe(200);
    expect(deleteAccountMock).toHaveBeenCalledWith(USER.id);
  });

  it('accepts the exact English word, DELETE', async () => {
    const res = await POST(ctx({ body: { confirm: 'DELETE' } }));
    expect(res.status).toBe(200);
    expect(deleteAccountMock).toHaveBeenCalledWith(USER.id);
  });
});

describe('POST /api/cuenta/eliminar — deleteAccount failures keep the account usable', () => {
  it('500s purge_failed and never signs out', async () => {
    deleteAccountMock.mockResolvedValue({ ok: false, error: 'purge_failed' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'purge_failed' });
    expect(createSessionClientMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('500s storage_cleanup_failed and never signs out', async () => {
    deleteAccountMock.mockResolvedValue({ ok: false, error: 'storage_cleanup_failed' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'storage_cleanup_failed' });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('500s delete_user_failed and never signs out', async () => {
    deleteAccountMock.mockResolvedValue({ ok: false, error: 'delete_user_failed' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'delete_user_failed' });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('marks a failure response private/no-store too', async () => {
    deleteAccountMock.mockResolvedValue({ ok: false, error: 'purge_failed' });
    const res = await POST(ctx({}));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/cuenta/eliminar — success', () => {
  it('returns { ok: true } with a 200', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('signs the session out', async () => {
    await POST(ctx({}));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(ctx({}));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('carries the clearing Set-Cookie directives on the response it returns', async () => {
    pendingCookies.push(CLEAR_CHUNK_0);
    const res = await POST(ctx({}));
    expect(res.headers.getSetCookie()).toEqual([CLEAR_CHUNK_0]);
  });

  it('still clears cookies and returns ok even when signOut itself fails (the auth user is already gone)', async () => {
    signOutMock.mockResolvedValue({ error: { message: 'user not found' } });
    pendingCookies.push(CLEAR_CHUNK_0);

    const res = await POST(ctx({}));

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([CLEAR_CHUNK_0]);
  });

  it('still clears cookies and returns ok even when signOut throws', async () => {
    signOutMock.mockRejectedValue(new Error('network down'));
    pendingCookies.push(CLEAR_CHUNK_0);

    const res = await POST(ctx({}));

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([CLEAR_CHUNK_0]);
  });
});
