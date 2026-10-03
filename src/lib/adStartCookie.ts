/**
 * Ad-start cookie (spec 4: rewarded-ads, hardening).
 *
 * Proves to `validar-anuncio` that the rewarded-ads flow actually began, and
 * WHEN, by the server's own clock — never the client's — so a download pass
 * can only be minted after real elapsed watch time instead of trusting a
 * client-supplied completion timestamp. See
 * `src/pages/api/validar-anuncio.ts`'s header comment for the full flow and
 * the bypass this closes, and `src/pages/api/anuncio/inicio.ts` for where this
 * cookie is minted.
 *
 * Cookie name: `chu_ad_start`
 * Cookie value: `base64url(payload).base64url(signature)`
 *   - payload:   JSON `{ start: number }` (epoch ms, set by this server)
 *   - signature: HMAC-SHA256(payload, AD_HMAC_SECRET)
 *
 * Same signing scheme, secret, and cookie-value shape as `chu_pass`
 * (`src/lib/pass.ts`), so this module reuses that module's codec/signing
 * primitives (`toBase64Url`, `sign`, `verifySignedValue`) and its shared
 * `cookieAttributes()` builder rather than a second, independently-maintained
 * implementation of the same cryptography and security attributes.
 *
 * Unlike `chu_pass`, the payload carries no expiry of its own: whether a
 * start proof is "too young" (ad not actually watched yet) or "too old"
 * (flow abandoned) depends on TWO different thresholds
 * (`AD_MIN_WATCH_MS`/`AD_START_TTL_MS`), not a single embedded expiry, so that
 * policy decision is left to the caller (`validar-anuncio`) rather than baked
 * in here. This module only proves the payload is genuine and unmodified.
 *
 * SERVER-ONLY: this module imports `src/lib/pass.ts`, which imports
 * `src/lib/env.ts`. Only the two API endpoints above may import it — never
 * the client `AdModal` island. `src/lib/adTiming.ts` holds the constants the
 * client DOES need.
 */
import { sign, readCookie, toBase64Url, verifySignedValue, cookieAttributes } from './pass';
import { AD_START_TTL_MS } from './adTiming';

/** Cookie name that carries the signed ad-start proof. */
export const AD_START_COOKIE_NAME = 'chu_ad_start';

/** Payload embedded in the signed ad-start cookie. */
interface AdStartPayload {
  /** When the ad started, epoch ms (the SERVER's clock, never the client's). */
  start: number;
}

/** Verified state of an incoming ad-start cookie. */
export interface AdStartState {
  /** When the ad started, per the signed cookie. */
  start: number;
}

/**
 * Mint a signed ad-start cookie attributed to `nowMs`. Carries the same
 * security attributes as `createPassCookie` (`src/lib/pass.ts`): `HttpOnly`,
 * `SameSite=Lax`, `Path=/`, `Secure` in production, and a `Max-Age` of
 * {@link AD_START_TTL_MS} so the browser itself drops it once the flow could
 * no longer succeed anyway.
 *
 * @param secret - HMAC secret to sign with (`AD_HMAC_SECRET`).
 * @param nowMs - Injectable clock (epoch ms) for deterministic tests.
 */
export function createAdStartCookie(secret: string, nowMs: number = Date.now()): string {
  const payload: AdStartPayload = { start: nowMs };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signatureB64 = sign(payloadB64, secret);
  const value = `${payloadB64}.${signatureB64}`;

  const maxAgeSeconds = Math.floor(AD_START_TTL_MS / 1000);
  return [
    `${AD_START_COOKIE_NAME}=${value}`,
    ...cookieAttributes(),
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

/**
 * Build the `Set-Cookie` value that clears the ad-start cookie (`Max-Age=0`),
 * so a consumed or rejected start proof can never be replayed against a later
 * `validar-anuncio` call.
 */
export function clearAdStartCookie(): string {
  return [`${AD_START_COOKIE_NAME}=`, ...cookieAttributes(), 'Max-Age=0'].join('; ');
}

/**
 * Read and signature-verify the ad-start cookie from an incoming request.
 *
 * Returns `null` for every failure mode — missing cookie, malformed value, or
 * a signature that does not match under `secret` — never which one, so the
 * caller fails closed without learning why (same posture as `getPassState`).
 * Age/TTL checks are the caller's job; see this module's header comment.
 */
export function readAdStartCookie(request: Request, secret: string): AdStartState | null {
  const rawValue = readCookie(request, AD_START_COOKIE_NAME);
  if (!rawValue) {
    return null;
  }

  const payload = verifySignedValue(rawValue, secret) as Partial<AdStartPayload> | null;
  if (!payload || typeof payload.start !== 'number' || !Number.isFinite(payload.start)) {
    return null;
  }

  return { start: payload.start };
}
