/**
 * Integration tests for POST /api/auth/password — email + password
 * sign-in, sign-up and reset (Login step 1).
 *
 * Same mocking posture as `signin.test.ts`: `@lib/supabaseSession` is
 * stubbed so no network happens, and `flushSessionHeaders` is left real so
 * the assertions land on the Response the caller receives, not on the call.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_LANG } from '@lib/i18n';

const {
  createSessionClientMock,
  signInWithPasswordMock,
  signUpMock,
  resetPasswordForEmailMock,
} = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
}));

vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

import { POST } from './password';

const SESSION_COOKIE = 'sb-x-auth-token=abc; Path=/; HttpOnly; SameSite=Lax';
const EMAIL = 'persona@chuyo.test';

function ctx(body: unknown) {
  const request = new Request('https://chuyocode.com/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createSessionClientMock.mockImplementation(() => ({
    client: {
      auth: {
        signInWithPassword: signInWithPasswordMock,
        signUp: signUpMock,
        resetPasswordForEmail: resetPasswordForEmailMock,
      },
    },
    pendingHeaders: new Map<string, string>(),
    pendingCookies: [SESSION_COOKIE],
  }));
  signInWithPasswordMock.mockResolvedValue({
    data: { session: { access_token: 't' } },
    error: null,
  });
  signUpMock.mockResolvedValue({ data: { session: null }, error: null });
  resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
});

describe('POST /api/auth/password — malformed requests', () => {
  it('rejects a body that is not JSON', async () => {
    const res = await POST(ctx('not-json{'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing/invalid email before touching Supabase', async () => {
    const res = await POST(ctx({ action: 'signin', email: 'no-arroba', password: 'longenough' }));
    expect(res.status).toBe(400);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown action', async () => {
    const res = await POST(ctx({ action: 'delete-everything', email: EMAIL }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing action', async () => {
    const res = await POST(ctx({ email: EMAIL }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/password — signin', () => {
  it('signs in and flushes the session cookie on success', async () => {
    const res = await POST(ctx({ action: 'signin', email: EMAIL, password: 'correct-horse' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'correct-horse',
    });
  });

  it('rejects a missing password before touching Supabase', async () => {
    const res = await POST(ctx({ action: 'signin', email: EMAIL }));
    expect(res.status).toBe(400);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('answers one generic invalid-credentials error for a wrong password', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    const res = await POST(ctx({ action: 'signin', email: EMAIL, password: 'wrong-pass' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_credentials' });
  });

  it('answers the identical generic error for an address with no account', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    const res = await POST(
      ctx({ action: 'signin', email: 'never-registered@chuyo.test', password: 'whatever1' }),
    );

    // Same status and body as the wrong-password case above: the caller
    // cannot distinguish "wrong password" from "no such account".
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_credentials' });
  });

  it('degrades an unreachable Supabase to the same generic error, never a 500', async () => {
    signInWithPasswordMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ action: 'signin', email: EMAIL, password: 'whatever1' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_credentials' });
  });

  it('never leaks the failure reason in the body', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });
    const res = await POST(ctx({ action: 'signin', email: EMAIL, password: 'wrong-pass' }));
    const bodyText = await res.text();

    expect(bodyText).not.toContain('Invalid login credentials');
  });
});

describe('POST /api/auth/password — signup', () => {
  it('rejects a password shorter than the minimum, before touching Supabase', async () => {
    const res = await POST(ctx({ action: 'signup', email: EMAIL, password: 'short' }));
    expect(res.status).toBe(400);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('answers { ok: true, signedIn: false } uniformly when no session comes back', async () => {
    const res = await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, signedIn: false });
  });

  it('reports signedIn: true and flushes cookies when Supabase returns a session immediately', async () => {
    signUpMock.mockResolvedValueOnce({
      data: { session: { access_token: 't' } },
      error: null,
    });
    const res = await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1' }));

    expect(await res.json()).toEqual({ ok: true, signedIn: true });
    expect(res.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
  });

  it('answers the identical uniform body when Supabase errors (e.g. address already registered)', async () => {
    signUpMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'User already registered' },
    });
    const res = await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, signedIn: false });
  });

  it('degrades an unreachable Supabase to the same uniform body, never a 500', async () => {
    signUpMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, signedIn: false });
  });

  it('points emailRedirectTo at the confirm route on this origin', async () => {
    await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1', next: '/en/ingles' }));

    const call = signUpMock.mock.calls.at(-1)?.[0];
    const target = new URL(call.options.emailRedirectTo);
    expect(target.pathname).toBe('/api/auth/confirm');
    expect(target.searchParams.get('next')).toBe('/en/ingles');
  });

  it('neutralises a hostile next before it reaches the email', async () => {
    await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1', next: '//evil.com' }));

    const call = signUpMock.mock.calls.at(-1)?.[0];
    const target = new URL(call.options.emailRedirectTo);
    expect(target.searchParams.get('next')).toBe(`/${DEFAULT_LANG}/`);
  });

  it('passes email, password and the submitted locale through', async () => {
    await POST(ctx({ action: 'signup', email: EMAIL, password: 'longenough1', lang: 'en' }));

    const call = signUpMock.mock.calls.at(-1)?.[0];
    expect(call.email).toBe(EMAIL);
    expect(call.password).toBe('longenough1');
    expect(call.options.data).toEqual({ lang: 'en' });
  });
});

describe('POST /api/auth/password — reset', () => {
  it('answers { ok: true } uniformly for a known address', async () => {
    const res = await POST(ctx({ action: 'reset', email: EMAIL }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers identically for an address with no account', async () => {
    const known = await POST(ctx({ action: 'reset', email: EMAIL }));
    const unknown = await POST(ctx({ action: 'reset', email: 'never-registered@chuyo.test' }));

    expect(await unknown.json()).toEqual(await known.json());
    expect(unknown.status).toBe(known.status);
  });

  it('answers the same body when Supabase errors', async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: {},
      error: { message: 'rate limited' },
    });
    const res = await POST(ctx({ action: 'reset', email: EMAIL }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('degrades an unreachable Supabase to the same body, never a 500', async () => {
    resetPasswordForEmailMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ action: 'reset', email: EMAIL }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('redirects to the confirm route with next pointed at the new-password page', async () => {
    await POST(ctx({ action: 'reset', email: EMAIL, lang: 'en' }));

    const call = resetPasswordForEmailMock.mock.calls.at(-1);
    const target = new URL(call?.[1].redirectTo);
    expect(target.pathname).toBe('/api/auth/confirm');
    expect(target.searchParams.get('next')).toBe('/en/auth/nueva-clave');
  });

  it('defaults to the primary locale when lang is unsupported', async () => {
    await POST(ctx({ action: 'reset', email: EMAIL, lang: 'fr' }));

    const call = resetPasswordForEmailMock.mock.calls.at(-1);
    const target = new URL(call?.[1].redirectTo);
    expect(target.searchParams.get('next')).toBe(`/${DEFAULT_LANG}/auth/nueva-clave`);
  });
});

describe('POST /api/auth/password — captchaToken (Turnstile)', () => {
  it('signin: forwards a valid token as options.captchaToken', async () => {
    await POST(ctx({ action: 'signin', email: EMAIL, password: 'correct-horse', captchaToken: 'tok-abc' }));

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'correct-horse',
      options: { captchaToken: 'tok-abc' },
    });
  });

  it('signin: calls Supabase exactly as today when no token is sent', async () => {
    await POST(ctx({ action: 'signin', email: EMAIL, password: 'correct-horse' }));

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'correct-horse',
    });
  });

  it('signin: drops an oversized token instead of forwarding it', async () => {
    const tooLong = 'a'.repeat(2049);
    await POST(ctx({ action: 'signin', email: EMAIL, password: 'correct-horse', captchaToken: tooLong }));

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'correct-horse',
    });
  });

  it('signin: maps a captcha rejection to a distinct error code', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' },
    });
    const res = await POST(
      ctx({ action: 'signin', email: EMAIL, password: 'correct-horse', captchaToken: 'bad-tok' }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'captcha_failed' });
  });

  it('signup: forwards a valid token inside options', async () => {
    await POST(
      ctx({ action: 'signup', email: EMAIL, password: 'longenough1', captchaToken: 'tok-abc' }),
    );

    const call = signUpMock.mock.calls.at(-1)?.[0];
    expect(call.options.captchaToken).toBe('tok-abc');
  });

  it('signup: maps a captcha rejection to a distinct error code instead of the uniform body', async () => {
    signUpMock.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' },
    });
    const res = await POST(
      ctx({ action: 'signup', email: EMAIL, password: 'longenough1', captchaToken: 'bad-tok' }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'captcha_failed' });
  });

  it('reset: forwards a valid token alongside redirectTo', async () => {
    await POST(ctx({ action: 'reset', email: EMAIL, captchaToken: 'tok-abc' }));

    const call = resetPasswordForEmailMock.mock.calls.at(-1);
    expect(call?.[1].captchaToken).toBe('tok-abc');
  });

  it('reset: maps a captcha rejection to a distinct error code instead of the uniform body', async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: {},
      error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' },
    });
    const res = await POST(ctx({ action: 'reset', email: EMAIL, captchaToken: 'bad-tok' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'captcha_failed' });
  });

  it('reset: the captcha_failed mapping stays identical for an address with no account (T3)', async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: {},
      error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' },
    });
    const known = await POST(ctx({ action: 'reset', email: EMAIL, captchaToken: 'bad-tok' }));
    const unknown = await POST(
      ctx({ action: 'reset', email: 'never-registered@chuyo.test', captchaToken: 'bad-tok' }),
    );

    expect(await unknown.json()).toEqual(await known.json());
    expect(unknown.status).toBe(known.status);
  });

  it('every action keeps flushing the session cookie on a captcha_failed response', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' },
    });
    const res = await POST(
      ctx({ action: 'signin', email: EMAIL, password: 'correct-horse', captchaToken: 'bad-tok' }),
    );

    expect(res.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
  });
});

describe('POST /api/auth/password — response shape', () => {
  it('keeps every answer out of every cache', async () => {
    const res = await POST(ctx({ action: 'reset', email: EMAIL }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers JSON', async () => {
    const res = await POST(ctx({ action: 'reset', email: EMAIL }));
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
