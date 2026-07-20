import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

// pass.ts reads AD_HMAC_SECRET via loadEnv(). We mock env with a MUTABLE secret
// so individual tests can simulate "configured" vs "missing secret" without
// touching import.meta.env. `vi.mock` is hoisted, so the mutable holder MUST be
// created via `vi.hoisted()` (a top-level const would hit the TDZ).
const { envState } = vi.hoisted(() => ({
  envState: { secret: 'test-secret-please-change' as string },
}));
vi.mock('./env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: envState.secret,
  }),
}));

import {
  getPassState,
  createPassCookie,
  PASS_COOKIE_NAME,
  PASS_DURATION_MS,
} from './pass';

const SECRET = 'test-secret-please-change';
const NOW = 1_700_000_000_000; // fixed epoch ms for deterministic expiry checks

/** Build a Request carrying a single `chu_pass` cookie value. */
function requestWithCookie(value: string): Request {
  return new Request('https://chuyo.test/es/libros/x', {
    headers: { cookie: `${PASS_COOKIE_NAME}=${value}` },
  });
}

/** Build a Request with a raw Cookie header (for multi-cookie / edge cases). */
function requestWithRawCookieHeader(header: string): Request {
  return new Request('https://chuyo.test/es/libros/x', {
    headers: { cookie: header },
  });
}

beforeEach(() => {
  // Reset the shared secret to the default configured value before each test.
  envState.secret = SECRET;
});

describe('getPassState', () => {
  it('returns "valid" for a correctly signed, unexpired cookie', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    // Extract the raw cookie value from the Set-Cookie string.
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const req = requestWithCookie(value);
    expect(getPassState(req, NOW)).toBe('valid');
  });

  it('returns "invalid" for an expired cookie', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const req = requestWithCookie(value);
    // Advance the clock past the 24h expiry.
    expect(getPassState(req, NOW + PASS_DURATION_MS + 1000)).toBe('invalid');
  });

  it('returns "invalid" for a tampered payload (signature no longer matches)', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const [, signature] = value.split('.');
    // Forge a DIFFERENT expiry than the one the original signature covers
    // (extend the pass by a year), keeping the OLD signature. The recomputed
    // HMAC over the new payload must no longer match -> rejected.
    const forgedPayload = Buffer.from(
      JSON.stringify({
        exp: Math.floor((NOW + PASS_DURATION_MS + 365 * 24 * 3600_000) / 1000),
      }),
      'utf8',
    ).toString('base64url');
    const forged = `${forgedPayload}.${signature}`;
    const req = requestWithCookie(forged);
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('returns "invalid" for a tampered signature', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const [payload] = value.split('.');
    const req = requestWithCookie(`${payload}.deadbeefdeadbeef`);
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('returns "invalid" for a cookie signed with a different secret', () => {
    const { cookie } = createPassCookie('a-completely-different-secret', NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const req = requestWithCookie(value);
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('returns "invalid" when the cookie is missing', () => {
    const req = new Request('https://chuyo.test/es/libros/x');
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('returns "invalid" when the Cookie header has other cookies but not chu_pass', () => {
    const req = requestWithRawCookieHeader('theme=dark; other=1');
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('reads chu_pass among multiple cookies in the header', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const req = requestWithRawCookieHeader(
      `theme=dark; ${PASS_COOKIE_NAME}=${value}; other=1`,
    );
    expect(getPassState(req, NOW)).toBe('valid');
  });

  it('returns "invalid" for a malformed cookie value (no dot separator)', () => {
    const req = requestWithCookie('not-a-signed-cookie');
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('returns "invalid" for non-JSON payload with a valid-looking structure', () => {
    // A dot-delimited value whose payload is not JSON.
    const req = requestWithCookie('bm90anNvbg.whatever');
    expect(getPassState(req, NOW)).toBe('invalid');
  });

  it('returns "invalid" when AD_HMAC_SECRET is not configured', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const req = requestWithCookie(value);
    // Simulate an unconfigured secret: gate must fail closed even with a
    // structurally valid cookie.
    envState.secret = '';
    expect(getPassState(req, NOW)).toBe('invalid');
  });
});

describe('createPassCookie', () => {
  it('produces a cookie that getPassState accepts (round-trip)', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const req = requestWithCookie(value);
    expect(getPassState(req, NOW)).toBe('valid');
  });

  it('sets expiresAt to now + 24h', () => {
    const { expiresAt } = createPassCookie(SECRET, NOW);
    expect(expiresAt.getTime()).toBe(NOW + PASS_DURATION_MS);
  });

  it('includes HttpOnly, SameSite=Lax, Path=/, and Max-Age attributes', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    expect(cookie).toContain(`${PASS_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(
      `Max-Age=${Math.floor(PASS_DURATION_MS / 1000)}`,
    );
  });

  it('does not include Secure outside production (test env)', () => {
    const { cookie } = createPassCookie(SECRET, NOW);
    // Vitest runs with PROD=false, so Secure must be omitted.
    expect(cookie).not.toContain('Secure');
  });
});
