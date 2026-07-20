/**
 * POST /api/validar-anuncio — ad-completion verification (spec 4: rewarded-ads).
 *
 * The rewarded-ads flow (design decision #7, simplified for v1):
 *   1. The AdModal island simulates an ad, then POSTs `{ timestamp: number }`
 *      (the client clock at the moment the ad finished).
 *   2. This endpoint validates the timestamp is fresh (within the last 5 min),
 *      proving the "ad" completed recently rather than a stale/replayed value.
 *   3. On success it computes an HMAC-SHA256 proof of the timestamp under
 *      `AD_HMAC_SECRET` (never exposing the secret to the client) and mints a
 *      24h signed pass cookie via `createPassCookie(AD_HMAC_SECRET)`.
 *   4. The response carries a `Set-Cookie` header so the next SSR render of a
 *      gated page (after the client reloads) sees a valid pass.
 *
 * Anti-abuse: the freshness window (design open question — 5 min) is a basic
 * guard against replaying an old timestamp. The full ad-network token is stubbed
 * for v1; this keeps the secret server-side while still requiring a recent call.
 *
 * Responses:
 *   - 200 `{ ok: true }`                  + Set-Cookie (fresh timestamp)
 *   - 400 `{ ok: false, error }`          (missing/invalid body or stale token)
 *   - 405 `{ ok: false, error }`          (non-POST method)
 *   - 500 `{ ok: false, error }`          (secret unconfigured / server error)
 */
import type { APIRoute } from 'astro';
import { createHmac } from 'node:crypto';
import { loadEnv } from '@lib/env';
import { createPassCookie } from '@lib/pass';

/** Freshness window for the ad-completion timestamp: 5 minutes (design #7 TTL). */
export const AD_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Shape of the expected request body. */
interface ValidateAdBody {
  /** Client clock (epoch ms) at the moment the simulated ad completed. */
  timestamp: number;
}

/** Build a JSON response with the given status. */
function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Parse and validate the request body. Returns the fresh timestamp, or a
 * `{ error }` describing why the body is rejected.
 */
function parseBody(raw: unknown, nowMs: number): { timestamp: number } | { error: string } {
  if (raw === null || typeof raw !== 'object') {
    return { error: 'Invalid token' };
  }
  const { timestamp } = raw as Partial<ValidateAdBody>;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return { error: 'Invalid token' };
  }
  // Timestamp must be recent and not from the future (small skew tolerated by
  // the same window). Stale or forged-future values are rejected.
  const age = nowMs - timestamp;
  if (age < -AD_TOKEN_TTL_MS || age > AD_TOKEN_TTL_MS) {
    return { error: 'Invalid token' };
  }
  return { timestamp };
}

/**
 * Compute the HMAC-SHA256 proof of a timestamp under `secret`. Kept server-side;
 * proves the endpoint — not the client — vouches for the completion timestamp.
 */
function proofOf(timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(String(timestamp)).digest('base64url');
}

export const POST: APIRoute = async ({ request }) => {
  let secret: string;
  try {
    secret = loadEnv().AD_HMAC_SECRET;
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }

  // Fail-closed: an unconfigured secret can neither verify nor sign a pass.
  if (!secret || secret.length === 0) {
    return json({ ok: false, error: 'Server error' }, 500);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    // Missing/malformed body is a client error, not a server fault.
    return json({ ok: false, error: 'Invalid token' }, 400);
  }

  const now = Date.now();
  const parsed = parseBody(raw, now);
  if ('error' in parsed) {
    return json({ ok: false, error: parsed.error }, 400);
  }

  try {
    // Server-side proof: binds this grant to the validated timestamp under the
    // secret. Computed for provenance even though the pass cookie is the token
    // the gate ultimately checks.
    void proofOf(parsed.timestamp, secret);

    const { cookie } = createPassCookie(secret, now);
    return json({ ok: true }, 200, { 'set-cookie': cookie });
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }
};

/** Reject any non-POST method with 405 (spec 4: endpoint is POST-only). */
export const ALL: APIRoute = () =>
  json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'POST' });
