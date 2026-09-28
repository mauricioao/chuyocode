/**
 * Integration tests for POST /api/auth/google — begin Google OAuth sign-in.
 *
 * Called from a PLAIN `<form method="POST">` (see `entrar.astro`), so the
 * body is form-encoded, not JSON — every request built here mirrors that.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_LANG } from '@lib/i18n';

const { createSessionClientMock, signInWithOAuthMock } = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
}));

vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

import { POST } from './google';

const VERIFIER_COOKIE =
  'sb-x-auth-token-code-verifier=abc123; Max-Age=34560000; Path=/; HttpOnly; SameSite=Lax';
const PROVIDER_URL =
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fx.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email';

function ctx(fields: Record<string, string> = {}) {
  const request = new Request('https://chuyocode.com/api/auth/google', {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
  return { request } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createSessionClientMock.mockImplementation(() => ({
    client: { auth: { signInWithOAuth: signInWithOAuthMock } },
    pendingHeaders: new Map<string, string>(),
    pendingCookies: [VERIFIER_COOKIE],
  }));
  signInWithOAuthMock.mockResolvedValue({
    data: { provider: 'google', url: PROVIDER_URL },
    error: null,
  });
});

describe('POST /api/auth/google — happy path', () => {
  it('303s to the provider URL Supabase returns', async () => {
    const res = await POST(ctx());

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(PROVIDER_URL);
  });

  it('flushes the PKCE verifier cookie onto the response', async () => {
    const res = await POST(ctx());

    expect(res.headers.getSetCookie()).toEqual([VERIFIER_COOKIE]);
  });

  it('never uses a GET-triggerable flow — only skipBrowserRedirect', async () => {
    await POST(ctx());

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({ skipBrowserRedirect: true }),
    });
  });

  it('points redirectTo at the confirm route on this origin', async () => {
    await POST(ctx({ next: '/en/ingles' }));

    const call = signInWithOAuthMock.mock.calls.at(-1)?.[0];
    const target = new URL(call.options.redirectTo);
    expect(target.pathname).toBe('/api/auth/confirm');
    expect(target.searchParams.get('next')).toBe('/en/ingles');
  });

  it('neutralises a hostile next before it reaches redirectTo', async () => {
    await POST(ctx({ next: '//evil.com' }));

    const call = signInWithOAuthMock.mock.calls.at(-1)?.[0];
    const target = new URL(call.options.redirectTo);
    expect(target.searchParams.get('next')).toBe(`/${DEFAULT_LANG}/`);
  });

  it('defaults next to the locale home when the header sent none (a home-page sign-in)', async () => {
    // The header's "Ingresar" link carries no `next` at all when the
    // visitor is already on the home page — see `UserMenu.tsx`. This is
    // what `entrar.astro`'s Google form then submits.
    await POST(ctx({ lang: 'es' }));

    const call = signInWithOAuthMock.mock.calls.at(-1)?.[0];
    const target = new URL(call.options.redirectTo);
    expect(target.searchParams.get('next')).toBe('/es/');
  });

  it('keeps the answer out of every cache', async () => {
    const res = await POST(ctx());
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/auth/google — degrade, never a 500', () => {
  it('bounces back to sign-in with the unavailable marker when Supabase errors', async () => {
    signInWithOAuthMock.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: { message: 'Unsupported provider: provider is not enabled' },
    });
    const res = await POST(ctx({ lang: 'es' }));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?auth=google-unavailable');
  });

  it('bounces back to sign-in when Supabase returns no URL at all', async () => {
    signInWithOAuthMock.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: null,
    });
    const res = await POST(ctx({ lang: 'en' }));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/en/auth/entrar?auth=google-unavailable');
  });

  it('bounces back to sign-in, never a 500, when Supabase is unreachable', async () => {
    signInWithOAuthMock.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(ctx({ lang: 'es' }));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?auth=google-unavailable');
  });

  it('defaults to the primary locale when lang is missing or unsupported', async () => {
    signInWithOAuthMock.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: { message: 'not configured' },
    });
    const res = await POST(ctx({ lang: 'fr' }));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `/${DEFAULT_LANG}/auth/entrar?auth=google-unavailable`,
    );
  });

  it('still flushes whatever session state was buffered on the degrade path', async () => {
    signInWithOAuthMock.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: { message: 'not configured' },
    });
    const res = await POST(ctx());

    expect(res.headers.getSetCookie()).toEqual([VERIFIER_COOKIE]);
  });
});
