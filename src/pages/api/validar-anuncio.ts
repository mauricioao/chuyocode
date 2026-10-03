/**
 * POST /api/validar-anuncio — ad-completion verification (spec 4: rewarded-ads).
 *
 * The rewarded-ads flow:
 *   1. The AdModal island calls `POST /api/anuncio/inicio` the moment the
 *      simulated ad starts, which sets a short-lived, server-signed
 *      `chu_ad_start` cookie (`src/lib/adStartCookie.ts`) carrying the
 *      SERVER's own clock reading.
 *   2. The island "plays" the ad locally, then calls this endpoint.
 *   3. This endpoint requires that cookie: a valid signature under
 *      `AD_HMAC_SECRET`, at least `AD_MIN_WATCH_MS` elapsed since it was set
 *      (proof the ad actually ran), and no more than `AD_START_TTL_MS`
 *      elapsed (the flow was not abandoned and replayed later).
 *   4. On success it clears the start cookie (one-time use) and mints a 24h
 *      signed pass cookie via `createPassCookie(AD_HMAC_SECRET)`
 *      (`src/lib/pass.ts`). On ANY failure it mints nothing and returns 403.
 *
 * 🔴 THE REQUEST BODY IS IGNORED. This endpoint used to trust a client-
 * supplied `{ timestamp }` field as proof the ad had just finished — which
 * let a single `POST { timestamp: Date.now() }`, with no ad ever shown, mint
 * a full 24h download pass. The server-signed start cookie above is what
 * actually proves elapsed time now; nothing in the body is trusted for that
 * anymore, so nothing in the body is read.
 *
 * Responses:
 *   - 200 `{ ok: true }`          + Set-Cookie (pass minted, start cookie cleared)
 *   - 403 `{ ok: false, error }`  (missing/invalid/too-young/too-stale start cookie)
 *   - 405 `{ ok: false, error }`  (non-POST method)
 *   - 500 `{ ok: false, error }`  (secret unconfigured / server error)
 */
import type { APIRoute } from 'astro';
import { loadEnv } from '@lib/env';
import { createPassCookie } from '@lib/pass';
import { clearAdStartCookie, readAdStartCookie } from '@lib/adStartCookie';
import { AD_MIN_WATCH_MS, AD_START_TTL_MS } from '@lib/adTiming';
import { markPrivate } from '@lib/httpCache';

/** Build a JSON response with the given status, always private/no-store. */
function json(body: unknown, status: number, headers?: HeadersInit): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
  markPrivate(response.headers);
  return response;
}

/**
 * A single message for every rejection below — missing cookie, bad
 * signature, too young, or too stale — never which one, so a caller probing
 * the endpoint learns nothing about which part of the check it failed (same
 * fail-closed posture as `getPassState`/`readAdStartCookie`).
 */
const INVALID_AD_SESSION = 'Invalid ad session';

export const POST: APIRoute = async ({ request }) => {
  let secret: string;
  try {
    secret = loadEnv().AD_HMAC_SECRET;
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }

  // Fail-closed: an unconfigured secret can neither verify a start proof nor
  // sign a pass.
  if (!secret || secret.length === 0) {
    return json({ ok: false, error: 'Server error' }, 500);
  }

  const now = Date.now();
  const started = readAdStartCookie(request, secret);
  if (!started) {
    return json({ ok: false, error: INVALID_AD_SESSION }, 403);
  }

  const elapsed = now - started.start;
  // Too young: the ad cannot have actually played yet (also rejects a
  // forged future `start`, which makes `elapsed` negative). Too old: the
  // flow was abandoned and this is a stale/replayed start proof.
  if (elapsed < AD_MIN_WATCH_MS || elapsed > AD_START_TTL_MS) {
    return json({ ok: false, error: INVALID_AD_SESSION }, 403);
  }

  try {
    const { cookie: passCookie } = createPassCookie(secret, now);
    const headers = new Headers({ 'content-type': 'application/json' });
    // A cached copy of this response would hand the pass it mints (via
    // Set-Cookie, below) to the next visitor who gets that cached copy (T7) —
    // same hazard `markPrivate`'s own header comment describes.
    markPrivate(headers);
    // Both are legitimate `Set-Cookie` headers for the SAME response — the
    // start proof is single-use and the pass is the grant it just earned.
    // `append`, never `set`, or the second call would drop the first.
    headers.append('set-cookie', clearAdStartCookie());
    headers.append('set-cookie', passCookie);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }
};

/** Reject any non-POST method with 405 (spec 4: endpoint is POST-only). */
export const ALL: APIRoute = () =>
  json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'POST' });
