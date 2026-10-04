/**
 * Integration tests for POST /api/anuncio/inicio (spec 4: rewarded-ads).
 *
 * Verifies the ad-start contract:
 *  - a configured secret mints a signed `chu_ad_start` cookie and returns
 *    { ok: true },
 *  - the cookie carries HttpOnly/SameSite=Lax/Path=/Max-Age (and Secure in
 *    production only),
 *  - every response — success and failure alike — is `cache-control:
 *    private, no-store` (never cacheable: see `src/lib/httpCache.ts`),
 *  - an unconfigured secret fails closed with 500 and mints no cookie,
 *  - non-POST methods return 405.
 *
 * env is mocked with a MUTABLE secret (same vi.hoisted pattern as
 * `pass.test.ts` / `_validar-anuncio.test.ts`).
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

import { POST, ALL } from './inicio';
import { AD_START_COOKIE_NAME } from '@lib/adStartCookie';
import { AD_START_TTL_MS } from '@lib/adTiming';

/** Minimal APIContext stub — this route reads nothing off the request. */
function ctx(): Parameters<typeof POST>[0] {
  return {} as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  envState.secret = 'test-secret-please-change';
});

describe('POST /api/anuncio/inicio', () => {
  it('mints a signed chu_ad_start cookie and returns { ok: true }', async () => {
    const res = await POST(ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${AD_START_COOKIE_NAME}=`);
  });

  it('sets HttpOnly, SameSite=Lax, Path=/, and the TTL as Max-Age', async () => {
    const res = await POST(ctx());
    const setCookie = res.headers.get('set-cookie') as string;

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${Math.floor(AD_START_TTL_MS / 1000)}`);
  });

  it('does not include Secure outside production (test env)', async () => {
    const res = await POST(ctx());
    const setCookie = res.headers.get('set-cookie') as string;
    expect(setCookie).not.toContain('Secure');
  });

  it('responds cache-control: private, no-store on success', async () => {
    const res = await POST(ctx());
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 500 and mints no cookie when AD_HMAC_SECRET is not configured', async () => {
    envState.secret = '';
    const res = await POST(ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Server error' });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('anuncio/inicio — method guard', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = await ALL(ctx());

    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'Method not allowed',
    });
    expect(res.headers.get('allow')).toBe('POST');
  });
});
