/**
 * Integration tests for POST /api/validar-anuncio (spec 4: rewarded-ads).
 *
 * Verifies the full ad-validation contract:
 *  - a fresh timestamp mints a signed pass cookie and returns { ok: true },
 *  - the minted cookie is one getPassState accepts (round-trip),
 *  - stale/future/malformed/missing bodies return 400,
 *  - non-POST methods return 405,
 *  - an unconfigured secret fails closed with 500.
 *
 * env is mocked with a MUTABLE secret (same vi.hoisted pattern as pass.test.ts)
 * so tests can simulate "configured" vs "missing secret" without touching
 * import.meta.env.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: { secret: 'test-secret-please-change' as string },
}));
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: envState.secret,
  }),
}));

import { POST, ALL, AD_TOKEN_TTL_MS } from './validar-anuncio';
import { getPassState, PASS_COOKIE_NAME } from '@lib/pass';

const SECRET = 'test-secret-please-change';

/** Minimal APIContext stub carrying just the request the handler reads. */
function ctx(request: Request): Parameters<typeof POST>[0] {
  return { request } as unknown as Parameters<typeof POST>[0];
}

/** Build a POST request with a JSON body. */
function postWith(body: unknown): Request {
  return new Request('https://chuyo.test/api/validar-anuncio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Extract the raw chu_pass cookie value from a Set-Cookie header. */
function cookieValueFrom(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
}

beforeEach(() => {
  envState.secret = SECRET;
});

describe('POST /api/validar-anuncio', () => {
  it('mints a pass cookie and returns { ok: true } for a fresh timestamp', async () => {
    const res = await POST(ctx(postWith({ timestamp: Date.now() })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${PASS_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
  });

  it('mints a cookie that getPassState accepts (round-trip)', async () => {
    const res = await POST(ctx(postWith({ timestamp: Date.now() })));
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();

    const value = cookieValueFrom(setCookie as string);
    const gated = new Request('https://chuyo.test/es/libros/x', {
      headers: { cookie: `${PASS_COOKIE_NAME}=${value}` },
    });
    expect(getPassState(gated)).toBe('valid');
  });

  it('returns 400 for a stale timestamp (older than the TTL)', async () => {
    const stale = Date.now() - AD_TOKEN_TTL_MS - 1000;
    const res = await POST(ctx(postWith({ timestamp: stale })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid token' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 400 for a future timestamp beyond the TTL', async () => {
    const future = Date.now() + AD_TOKEN_TTL_MS + 1000;
    const res = await POST(ctx(postWith({ timestamp: future })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid token' });
  });

  it('returns 400 when timestamp is not a number', async () => {
    const res = await POST(ctx(postWith({ timestamp: 'not-a-number' })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid token' });
  });

  it('returns 400 when the body is missing the timestamp field', async () => {
    const res = await POST(ctx(postWith({})));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid token' });
  });

  it('returns 400 for a missing/empty body (non-JSON)', async () => {
    const req = new Request('https://chuyo.test/api/validar-anuncio', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(ctx(req));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid token' });
  });

  it('returns 500 when AD_HMAC_SECRET is not configured', async () => {
    envState.secret = '';
    const res = await POST(ctx(postWith({ timestamp: Date.now() })));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Server error' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('validar-anuncio — method guard', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = new Request('https://chuyo.test/api/validar-anuncio', {
      method: 'GET',
    });
    const res = await ALL(ctx(req));

    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Method not allowed',
    });
    expect(res.headers.get('allow')).toBe('POST');
  });
});
