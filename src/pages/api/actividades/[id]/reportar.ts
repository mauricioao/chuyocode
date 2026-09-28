/**
 * `POST /api/actividades/[id]/reportar` `{ reason, details? }` — any
 * signed-in visitor, except the activity's own author, reports a LIVE
 * activity (PR E, "Moderation"). See `recordReport`
 * (`@lib/activities/moderation`) for the atomic insert + threshold check
 * this wraps.
 *
 * ```
 * 1. locals.user null                    -> 401
 * 2. malformed id                        -> 404
 * 3. bad JSON                            -> 400
 * 4. recordReport(): not_found           -> 404 (not live, or does not
 *    exist — same response either way, never confirms which)
 * 5. self_report                         -> 403
 * 6. invalid_reason / invalid_details    -> 422 { error }
 * 7. report_failed                       -> 500 { error }
 * 8. already reported by this caller     -> 200 { ok: true } (idempotent —
 *    the unique (activity_id, reporter_id) constraint makes the insert a
 *    no-op; the threshold check still runs, same as any other report)
 * 9. success                             -> 200 { ok: true, hidden }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { isUuid } from '@lib/activities/paths';
import { recordReport } from '@lib/activities/moderation';

function json(body: Record<string, unknown>, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
}

function forbidden(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 403, statusText: 'Forbidden', headers });
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const reason = typeof body === 'object' && body !== null && 'reason' in body ? (body as { reason: unknown }).reason : undefined;
  const details = typeof body === 'object' && body !== null && 'details' in body ? (body as { details: unknown }).details : undefined;

  const result = await recordReport(id, user.id, reason, details);
  if (result.ok) return json({ ok: true, hidden: result.hidden }, 200);

  if (result.error === 'not_found') return notFound();
  if (result.error === 'self_report') return forbidden();
  if (result.error === 'invalid_reason' || result.error === 'invalid_details') {
    return json({ error: result.error }, 422);
  }
  return json({ error: result.error }, 500);
};
