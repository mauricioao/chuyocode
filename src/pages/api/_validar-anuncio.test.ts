/**
 * Integration tests for POST /api/validar-anuncio (spec 4: rewarded-ads).
 *
 * Verifies the full ad-validation contract:
 *  - a bare client-reported timestamp, with no ad-start cookie, mints no pass
 *    (the bypass this endpoint used to have — see the RED test below),
 *  - a valid, sufficiently-aged start cookie mints a pass and clears itself,
 *  - a start cookie younger than the minimum watch time is rejected,
 *  - a start cookie older than the TTL is rejected,
 *  - a tampered start-cookie signature is rejected,
 *  - a missing start cookie is rejected,
 *  - the minted pass cookie is one getPassState accepts (round-trip),
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

import { POST, ALL } from './validar-anuncio';
import { getPassState, PASS_COOKIE_NAME } from '@lib/pass';
import { createAdStartCookie, AD_START_COOKIE_NAME } from '@lib/adStartCookie';
import { AD_MIN_WATCH_MS, AD_START_TTL_MS } from '@lib/adTiming';
import { PRIVATE_CACHE_CONTROL } from '@lib/httpCache';

const SECRET = 'test-secret-please-change';
const URL = 'https://chuyo.test/api/validar-anuncio';

/** Minimal APIContext stub carrying just the request the handler reads. */
function ctx(request: Request): Parameters<typeof POST>[0] {
  return { request } as unknown as Parameters<typeof POST>[0];
}

/** Build a POST request with a JSON body (legacy shape — now ignored). */
function postWith(body: unknown): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a POST request carrying a raw `Cookie` header. */
function postWithCookieHeader(cookieHeader: string): Request {
  return new Request(URL, { method: 'POST', headers: { cookie: cookieHeader } });
}

/** Extract just the `name=value` pair off a full `Set-Cookie` string, so it
 * can be sent back as a request's `Cookie` header. */
function asCookieHeader(setCookie: string): string {
  return setCookie.slice(0, setCookie.indexOf(';'));
}

/** Extract the raw value (after `=`, before the first `;`) of a Set-Cookie string. */
function cookieValueFrom(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
}

/** Every response from this endpoint — success or failure — must be
 * private/no-store (T7): a cached response carrying `Set-Cookie` could hand
 * one visitor's cookie (the pass it just minted, or the start cookie it just
 * cleared) to another. */
function expectPrivate(res: Response): void {
  expect(res.headers.get('cache-control')).toBe(PRIVATE_CACHE_CONTROL);
}

/** Mint a `chu_ad_start` cookie whose start time is `ageMs` in the past, ready
 * to send as a request `Cookie` header. */
function startCookieAged(ageMs: number): string {
  const setCookie = createAdStartCookie(SECRET, Date.now() - ageMs);
  return asCookieHeader(setCookie);
}

beforeEach(() => {
  envState.secret = SECRET;
});

describe('POST /api/validar-anuncio', () => {
  // RED (recorded before the fix, per the Unit 3 brief): today's code mints a
  // pass from a bare client-reported timestamp alone, with no proof the ad
  // ever played. This is the bypass the fix must close — a bare POST with the
  // current time, and NO start cookie, must never mint a pass.
  it('RED: a bare {timestamp} with no ad-start cookie must not mint a pass', async () => {
    const res = await POST(ctx(postWith({ timestamp: Date.now() })));

    expectPrivate(res);
    const setCookies = res.headers.getSetCookie();
    const mintedPass = setCookies.some((c) => c.includes(`${PASS_COOKIE_NAME}=`));
    expect(mintedPass).toBe(false);
  });

  it('returns 403 when there is no start cookie at all', async () => {
    const res = await POST(ctx(new Request(URL, { method: 'POST' })));

    expect(res.status).toBe(403);
    expectPrivate(res);
    await expect(res.json()).resolves.toEqual({ ok: false, error: expect.any(String) });
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('returns 403, and mints no pass, when the start cookie is younger than the minimum watch time', async () => {
    const tooYoung = startCookieAged(AD_MIN_WATCH_MS - 500);
    const res = await POST(ctx(postWithCookieHeader(tooYoung)));

    expect(res.status).toBe(403);
    expectPrivate(res);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes(`${PASS_COOKIE_NAME}=`))).toBe(false);
  });

  // RED: today's success response is built by hand (never calls
  // `markPrivate`), unlike the shared `json()` helper's failure branches —
  // this is the case that must fail before the fix.
  it('mints a pass and clears the start cookie once the minimum watch time has elapsed', async () => {
    const justOldEnough = startCookieAged(AD_MIN_WATCH_MS + 50);
    const res = await POST(ctx(postWithCookieHeader(justOldEnough)));

    expect(res.status).toBe(200);
    expectPrivate(res);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const setCookies = res.headers.getSetCookie();
    const passCookie = setCookies.find((c) => c.startsWith(`${PASS_COOKIE_NAME}=`));
    expect(passCookie).toBeDefined();
    expect(passCookie).toContain('HttpOnly');

    const clearedStart = setCookies.find((c) => c.startsWith(`${AD_START_COOKIE_NAME}=`));
    expect(clearedStart).toBeDefined();
    expect(clearedStart).toContain('Max-Age=0');
  });

  it('mints a pass cookie that getPassState accepts (round-trip)', async () => {
    const cookie = startCookieAged(AD_MIN_WATCH_MS + 50);
    const res = await POST(ctx(postWithCookieHeader(cookie)));

    expectPrivate(res);
    const setCookies = res.headers.getSetCookie();
    const passCookie = setCookies.find((c) => c.startsWith(`${PASS_COOKIE_NAME}=`));
    expect(passCookie).toBeDefined();

    const value = cookieValueFrom(passCookie as string);
    const gated = new Request('https://chuyo.test/es/libros/x', {
      headers: { cookie: `${PASS_COOKIE_NAME}=${value}` },
    });
    expect(getPassState(gated)).toBe('valid');
  });

  it('returns 403 when the start cookie is older than the TTL', async () => {
    const stale = startCookieAged(AD_START_TTL_MS + 5000);
    const res = await POST(ctx(postWithCookieHeader(stale)));

    expect(res.status).toBe(403);
    expectPrivate(res);
    expect(res.headers.getSetCookie().some((c) => c.includes(`${PASS_COOKIE_NAME}=`))).toBe(false);
  });

  it('returns 403 for a tampered start-cookie signature', async () => {
    const valid = startCookieAged(AD_MIN_WATCH_MS + 50);
    const [payload] = valid.slice(valid.indexOf('=') + 1).split('.');
    const tampered = `${AD_START_COOKIE_NAME}=${payload}.deadbeefdeadbeefdeadbeef`;
    const res = await POST(ctx(postWithCookieHeader(tampered)));

    expect(res.status).toBe(403);
    expectPrivate(res);
    expect(res.headers.getSetCookie().some((c) => c.includes(`${PASS_COOKIE_NAME}=`))).toBe(false);
  });

  it('ignores the legacy {timestamp} body even alongside a valid start cookie — body carries no weight', async () => {
    const valid = startCookieAged(AD_MIN_WATCH_MS + 50);
    const req = new Request(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: valid },
      body: JSON.stringify({ timestamp: Date.now() - AD_START_TTL_MS - 999_999 }),
    });
    const res = await POST(ctx(req));

    // A wildly stale/garbage body must not matter either way: only the
    // start cookie is ever consulted.
    expect(res.status).toBe(200);
    expectPrivate(res);
  });

  it('returns 500 when AD_HMAC_SECRET is not configured', async () => {
    envState.secret = '';
    const cookie = startCookieAged(AD_MIN_WATCH_MS + 50);
    const res = await POST(ctx(postWithCookieHeader(cookie)));

    expect(res.status).toBe(500);
    expectPrivate(res);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Server error' });
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe('validar-anuncio — method guard', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = new Request(URL, { method: 'GET' });
    const res = await ALL(ctx(req));

    expect(res.status).toBe(405);
    expectPrivate(res);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Method not allowed',
    });
    expect(res.headers.get('allow')).toBe('POST');
  });
});
