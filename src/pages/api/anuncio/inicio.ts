/**
 * POST /api/anuncio/inicio — starts the rewarded-ads flow (spec 4: rewarded-ads).
 *
 * Called by the `AdModal` island the moment the simulated ad begins playing,
 * so `validar-anuncio` can later require real elapsed watch time instead of
 * trusting a client-supplied completion timestamp — see that endpoint's
 * header comment for the full flow and the bypass this two-endpoint design
 * closes.
 *
 * Sets a short-lived, HMAC-signed `chu_ad_start` cookie carrying the SERVER's
 * own clock reading (`src/lib/adStartCookie.ts`) — never the client's — so a
 * forged or replayed start time cannot be produced without `AD_HMAC_SECRET`.
 *
 * 🔴 NEVER SET THIS COOKIE FROM A PAGE RENDER. Public pages in this app can be
 * shared-cached (`src/lib/httpCache.ts`); a cookie written by a cached page
 * response would be handed out to every visitor who gets that cached copy.
 * This is a dedicated API response instead, explicitly
 * `cache-control: private, no-store`.
 *
 * Responses:
 *   - 200 `{ ok: true }`         + Set-Cookie (fresh ad-start cookie)
 *   - 405 `{ ok: false, error }` (non-POST method)
 *   - 500 `{ ok: false, error }` (secret unconfigured / server error)
 */
import type { APIRoute } from 'astro';
import { loadEnv } from '@lib/env';
import { createAdStartCookie } from '@lib/adStartCookie';
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

export const POST: APIRoute = async () => {
  let secret: string;
  try {
    secret = loadEnv().AD_HMAC_SECRET;
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }

  // Fail-closed: an unconfigured secret cannot sign a start proof anyone
  // could later verify.
  if (!secret || secret.length === 0) {
    return json({ ok: false, error: 'Server error' }, 500);
  }

  try {
    const cookie = createAdStartCookie(secret);
    return json({ ok: true }, 200, { 'set-cookie': cookie });
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }
};

/** Reject any non-POST method with 405 (same contract as `validar-anuncio`). */
export const ALL: APIRoute = () =>
  json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'POST' });
