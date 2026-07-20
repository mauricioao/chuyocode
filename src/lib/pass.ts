/**
 * Premium pass state (spec 3: premium-pass-access — SSR Pass Gate).
 *
 * Pass identity is an anonymous, self-contained, HMAC-signed HTTP-only cookie
 * (design decision #6: signed cookie, NOT Supabase anonymous auth). The cookie
 * carries its own expiry, so verifying a pass requires no network call — the
 * server only re-computes the HMAC and checks the embedded timestamp.
 *
 * Cookie name: `chu_pass`
 * Cookie value: `base64url(payload).base64url(signature)`
 *   - payload:   JSON `{ exp: number }` (unix seconds, UTC)
 *   - signature: HMAC-SHA256(payload, AD_HMAC_SECRET)
 *
 * Fail-closed policy (design decision #8): ANY problem — missing cookie,
 * missing/blank secret, malformed value, bad signature, or expired timestamp —
 * resolves to `'invalid'`. Premium content is never leaked on error.
 *
 * This module is READ-ONLY with respect to `getPassState`: it never sets
 * cookies. Cookie issuance (`createPassCookie`) is used by the ad-validation
 * endpoint in the rewarded-ads work unit (PR 7).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadEnv } from './env';

/** Resolved pass state for a request. */
export type PassState = 'valid' | 'invalid';

/** Cookie name that carries the signed pass. */
export const PASS_COOKIE_NAME = 'chu_pass';

/** Pass lifetime once granted: 24 hours (design decision #6 / #7). */
export const PASS_DURATION_MS = 24 * 60 * 60 * 1000;

/** Payload embedded in the signed cookie. */
interface PassPayload {
  /** Expiry as a unix timestamp in seconds (UTC). */
  exp: number;
}

/** Resolve the HMAC secret, or `null` when it is not configured. */
function resolveSecret(): string | null {
  try {
    const secret = loadEnv().AD_HMAC_SECRET;
    return secret && secret.length > 0 ? secret : null;
  } catch {
    // env failed to load (e.g. missing required vars) -> fail-closed.
    return null;
  }
}

/** Base64url-encode a UTF-8 string (URL/cookie-safe, no padding). */
function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** Base64url-decode to a UTF-8 string. */
function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/** Compute the HMAC-SHA256 signature (base64url) of `payload` under `secret`. */
function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Constant-time comparison of two base64url signatures. Length mismatch is a
 * fast, safe reject; equal-length strings are compared without early exit.
 */
function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'base64url');
  const bufB = Buffer.from(b, 'base64url');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extract the `chu_pass` cookie value from a request's `Cookie` header.
 * Returns `null` when the header or cookie is absent.
 */
function readPassCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    if (name === PASS_COOKIE_NAME) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Verify a raw cookie value against `secret` and return `'valid'` only when the
 * signature checks out AND the embedded expiry is in the future. Any structural
 * or cryptographic problem resolves to `'invalid'` (fail-closed).
 */
function verify(rawValue: string, secret: string, nowMs: number): PassState {
  const dot = rawValue.indexOf('.');
  // Must be exactly `payload.signature` — no dot means malformed.
  if (dot <= 0 || dot === rawValue.length - 1) {
    return 'invalid';
  }
  const payloadB64 = rawValue.slice(0, dot);
  const signatureB64 = rawValue.slice(dot + 1);

  const expected = sign(payloadB64, secret);
  if (!signaturesMatch(signatureB64, expected)) {
    return 'invalid';
  }

  let payload: PassPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadB64)) as PassPayload;
  } catch {
    return 'invalid';
  }

  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return 'invalid';
  }

  // exp is in seconds; compare against now in seconds.
  return payload.exp * 1000 > nowMs ? 'valid' : 'invalid';
}

/**
 * Resolve the pass state for an incoming request.
 *
 * Reads the `chu_pass` cookie, re-computes its HMAC-SHA256 signature with
 * `AD_HMAC_SECRET`, and returns `'valid'` only when the signature matches and
 * the embedded expiry is in the future. Every other case — missing cookie,
 * unconfigured secret, tampered value, or expired pass — returns `'invalid'`
 * (fail-closed, design decision #8).
 *
 * @param request - The incoming SSR request.
 * @param nowMs - Injectable clock (epoch ms) for deterministic tests.
 */
export function getPassState(
  request: Request,
  nowMs: number = Date.now(),
): PassState {
  const secret = resolveSecret();
  if (!secret) {
    return 'invalid';
  }

  const rawValue = readPassCookie(request);
  if (!rawValue) {
    return 'invalid';
  }

  try {
    return verify(rawValue, secret, nowMs);
  } catch {
    // Defense in depth: any unexpected error is a closed gate.
    return 'invalid';
  }
}

/** Result of minting a fresh pass cookie. */
export interface PassCookie {
  /** Full `Set-Cookie` header value, ready to attach to a response. */
  cookie: string;
  /** When the minted pass expires. */
  expiresAt: Date;
}

/**
 * Mint a signed `chu_pass` cookie valued 24 hours from now.
 *
 * Returns a complete `Set-Cookie` header value with security attributes:
 * `HttpOnly` (no JS access), `SameSite=Lax`, `Path=/`, `Max-Age`, and `Secure`
 * in production. Used by the ad-validation endpoint (PR 7) to grant a pass; the
 * value it produces is accepted by {@link getPassState} using the same secret.
 *
 * @param secret - HMAC secret to sign with (typically `AD_HMAC_SECRET`).
 * @param nowMs - Injectable clock (epoch ms) for deterministic tests.
 */
export function createPassCookie(
  secret: string,
  nowMs: number = Date.now(),
): PassCookie {
  const expiresAtMs = nowMs + PASS_DURATION_MS;
  const payload: PassPayload = { exp: Math.floor(expiresAtMs / 1000) };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signatureB64 = sign(payloadB64, secret);
  const value = `${payloadB64}.${signatureB64}`;

  const maxAgeSeconds = Math.floor(PASS_DURATION_MS / 1000);
  const isProd = import.meta.env?.PROD === true;

  const attributes = [
    `${PASS_COOKIE_NAME}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProd) {
    attributes.push('Secure');
  }

  return {
    cookie: attributes.join('; '),
    expiresAt: new Date(expiresAtMs),
  };
}
