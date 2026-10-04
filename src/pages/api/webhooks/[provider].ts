/**
 * POST /api/webhooks/[provider] — inbound billing-provider webhooks.
 *
 * Paddle Billing is the only provider wired up today (`src/lib/billing/paddle.ts`);
 * the `[provider]` segment exists so a second provider only ever needs its
 * own `case`, never a second route.
 *
 * No Paddle account exists yet (see the feature's plan), so this endpoint
 * MUST stay INERT until `PADDLE_WEBHOOK_SECRET` is configured — hence the 503
 * branch below, which is the expected, permanent response until that happens.
 *
 * Contract:
 *   - Any provider other than `paddle`           -> 404 (route does not exist).
 *   - `paddle`, `PADDLE_WEBHOOK_SECRET` unset     -> 503 (inert; logged once, not per request).
 *   - `paddle`, missing/bad `Paddle-Signature`    -> 401.
 *   - `paddle`, valid signature                   -> 200, fast. The event is
 *     recorded in `billing_events` BEFORE being applied; a retried delivery
 *     of the same (provider, event_id) is detected there and never re-applied.
 *
 * The raw body is read as TEXT before anything else — Paddle's signature
 * covers the exact bytes it sent, so parsing (or re-serializing) first would
 * make verification meaningless (see `src/lib/billing/paddle.ts`'s header).
 *
 * `src/middleware.ts` resolves a Supabase session for every `/api/**` path
 * (including this one) but never gates or redirects it — `requiresLogin`
 * only inspects lang-prefixed pages, and `/api/*` is always treated as a
 * non-locale path — so this endpoint is reachable exactly like every other
 * JSON API route. Nothing here ever returns HTML: every exit is JSON.
 */
import type { APIRoute } from 'astro';
import { loadEnv } from '@lib/env';
import { applyBillingEvent, markBillingEventProcessed, recordBillingEvent } from '@lib/billing/apply';
import { mapPaddleEvent, PADDLE_SIGNATURE_HEADER, verifyPaddleSignature } from '@lib/billing/paddle';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Logged once per server lifetime (not once per webhook retry) — Paddle
 * retries an endpoint that keeps answering non-2xx, and this branch is
 * expected to be hit repeatedly until the secret is configured.
 */
let inertWarningLogged = false;

/** Test isolation only: resets the once-per-lifetime warning latch. */
export function resetPaddleInertWarningForTests(): void {
  inertWarningLogged = false;
}

async function handlePaddle(request: Request): Promise<Response> {
  let secret: string;
  try {
    secret = loadEnv().PADDLE_WEBHOOK_SECRET;
  } catch {
    secret = '';
  }

  if (!secret) {
    if (!inertWarningLogged) {
      console.warn('[webhooks/paddle] PADDLE_WEBHOOK_SECRET is not configured — Paddle billing is inert.');
      inertWarningLogged = true;
    }
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  // Read the EXACT bytes Paddle signed, before any parsing.
  const rawBody = await request.text();
  const header = request.headers.get(PADDLE_SIGNATURE_HEADER);

  if (!verifyPaddleSignature({ header, rawBody, secret })) {
    return json({ ok: false, error: 'invalid_signature' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    // Authenticity is proven (the signature matched); the body is simply
    // not valid JSON, which a genuine Paddle payload never is. Nothing to
    // record or apply — acknowledge so Paddle does not retry forever.
    console.error('[webhooks/paddle] signed body is not valid JSON:', err);
    return json({ ok: true }, 200);
  }

  const root = payload as Record<string, unknown> | null;
  const eventId = typeof root?.event_id === 'string' ? root.event_id : null;
  const eventType = typeof root?.event_type === 'string' ? root.event_type : null;
  const occurredAt = typeof root?.occurred_at === 'string' ? root.occurred_at : null;

  if (!eventId || !eventType) {
    console.error('[webhooks/paddle] signed payload is missing event_id/event_type');
    return json({ ok: true }, 200);
  }

  const recorded = await recordBillingEvent({ provider: 'paddle', eventId, eventType, occurredAt });
  if (!recorded.ok) {
    console.error('[webhooks/paddle] failed to record event in the ledger:', eventId);
    return json({ ok: false, error: 'server_error' }, 500);
  }
  if (recorded.duplicate && recorded.processed) {
    // Already recorded AND fully applied by an earlier delivery — never re-applied.
    return json({ ok: true, duplicate: true }, 200);
  }
  // Either a brand-new event, or a duplicate delivery of one whose earlier
  // attempt never finished (`processed_at` still null) — map and (re)apply.
  // Every write `applyBillingEvent` can make is itself an idempotent
  // upsert/delete (see `apply.ts`'s header), so re-running it is always safe.

  const mapped = mapPaddleEvent(payload);
  if (mapped.recognized && mapped.event) {
    const applied = await applyBillingEvent(mapped.event);
    if (applied.ok) {
      await markBillingEventProcessed('paddle', eventId);
      return json({ ok: true }, 200);
    }
    if (applied.error === 'provider_ref_conflict') {
      // A genuine data conflict: the SAME input fails the SAME way every
      // time, so asking Paddle to retry cannot help. Left unprocessed on
      // purpose — `processed_at is null` is exactly the signal an operator
      // needs to find and reconcile this event by hand.
      console.error(
        '[webhooks/paddle] terminal conflict applying event (needs manual reconciliation):',
        eventId,
      );
      return json({ ok: true }, 200);
    }
    // Transient/unknown failure (db outage, service-role client
    // unavailable, …): ask Paddle to retry. Left unprocessed so the retry
    // re-applies above instead of being short-circuited as a duplicate.
    console.error('[webhooks/paddle] apply failed for event:', eventId, applied.error);
    return json({ ok: false, error: 'apply_failed' }, 500);
  }

  // Recognized-but-ignored, or genuinely unrecognized: either way there is
  // nothing to apply, so the ledger row is already in its final state.
  await markBillingEventProcessed('paddle', eventId);
  return json({ ok: true }, 200);
}

export const POST: APIRoute = async ({ params, request }) => {
  if (params.provider !== 'paddle') {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }
  return handlePaddle(request);
};
