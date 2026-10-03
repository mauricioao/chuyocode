import { describe, it, expect } from 'vitest';
import {
  AD_START_COOKIE_NAME,
  clearAdStartCookie,
  createAdStartCookie,
  readAdStartCookie,
} from './adStartCookie';
import { AD_START_TTL_MS } from './adTiming';
import { createPassCookie } from './pass';

const SECRET = 'test-secret-please-change';
const NOW = 1_700_000_000_000; // fixed epoch ms for deterministic payloads

/** Extract the raw cookie value from a Set-Cookie string. */
function valueFrom(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
}

/** Build a Request carrying a single `chu_ad_start` cookie value. */
function requestWithCookie(value: string): Request {
  return new Request('https://chuyo.test/api/validar-anuncio', {
    headers: { cookie: `${AD_START_COOKIE_NAME}=${value}` },
  });
}

/** Build a Request with a raw Cookie header (for multi-cookie / edge cases). */
function requestWithRawCookieHeader(header: string): Request {
  return new Request('https://chuyo.test/api/validar-anuncio', {
    headers: { cookie: header },
  });
}

describe('createAdStartCookie', () => {
  it('includes HttpOnly, SameSite=Lax, Path=/, and the TTL as Max-Age', () => {
    const cookie = createAdStartCookie(SECRET, NOW);
    expect(cookie).toContain(`${AD_START_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${Math.floor(AD_START_TTL_MS / 1000)}`);
  });

  it('does not include Secure outside production (test env)', () => {
    const cookie = createAdStartCookie(SECRET, NOW);
    expect(cookie).not.toContain('Secure');
  });
});

describe('readAdStartCookie', () => {
  it('round-trips the start time a matching cookie carries', () => {
    const cookie = createAdStartCookie(SECRET, NOW);
    const req = requestWithCookie(valueFrom(cookie));
    expect(readAdStartCookie(req, SECRET)).toEqual({ start: NOW });
  });

  it('reads chu_ad_start among multiple cookies in the header', () => {
    const cookie = createAdStartCookie(SECRET, NOW);
    const req = requestWithRawCookieHeader(
      `theme=dark; ${AD_START_COOKIE_NAME}=${valueFrom(cookie)}; other=1`,
    );
    expect(readAdStartCookie(req, SECRET)).toEqual({ start: NOW });
  });

  it('returns null when the cookie is missing', () => {
    const req = new Request('https://chuyo.test/api/validar-anuncio');
    expect(readAdStartCookie(req, SECRET)).toBeNull();
  });

  it('returns null for a tampered signature', () => {
    const cookie = createAdStartCookie(SECRET, NOW);
    const [payload] = valueFrom(cookie).split('.');
    const req = requestWithCookie(`${payload}.deadbeefdeadbeef`);
    expect(readAdStartCookie(req, SECRET)).toBeNull();
  });

  it('returns null for a cookie signed with a different secret', () => {
    const cookie = createAdStartCookie('a-completely-different-secret', NOW);
    const req = requestWithCookie(valueFrom(cookie));
    expect(readAdStartCookie(req, SECRET)).toBeNull();
  });

  it('returns null for a malformed cookie value (no dot separator)', () => {
    const req = requestWithCookie('not-a-signed-cookie');
    expect(readAdStartCookie(req, SECRET)).toBeNull();
  });

  it('returns null for a forged payload keeping the old signature', () => {
    const cookie = createAdStartCookie(SECRET, NOW);
    const [, signature] = valueFrom(cookie).split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ start: NOW - 60_000 }), 'utf8').toString(
      'base64url',
    );
    const req = requestWithCookie(`${forgedPayload}.${signature}`);
    expect(readAdStartCookie(req, SECRET)).toBeNull();
  });
});

describe('clearAdStartCookie', () => {
  it('expires the cookie immediately with the same security attributes', () => {
    const cookie = clearAdStartCookie();
    expect(cookie).toContain(`${AD_START_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('cookie attributes — shared with chu_pass', () => {
  it('chu_ad_start and chu_pass carry identical HttpOnly/SameSite/Path/Secure attributes, built by the same helper', () => {
    const adStart = createAdStartCookie(SECRET, NOW);
    const { cookie: pass } = createPassCookie(SECRET, NOW);

    // Both values are `name=value; <shared attrs>; Max-Age=<own lifetime>`;
    // drop the name=value pair and each cookie's own (deliberately
    // different) Max-Age to compare only what `cookieAttributes()`
    // (`src/lib/pass.ts`) is responsible for.
    const sharedAttributesOf = (setCookie: string): string[] =>
      setCookie.split('; ').slice(1).filter((attribute) => !attribute.startsWith('Max-Age='));

    expect(sharedAttributesOf(adStart)).toEqual(['HttpOnly', 'SameSite=Lax', 'Path=/']);
    expect(sharedAttributesOf(adStart)).toEqual(sharedAttributesOf(pass));
  });
});
