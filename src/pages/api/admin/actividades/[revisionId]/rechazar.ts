/**
 * `POST /api/admin/actividades/[revisionId]/rechazar` `{ note }` — moderator
 * rejection (PR E, "Moderation"). See `rejectRevision`
 * (`@lib/activities/moderation`) for the write path this wraps.
 *
 * ```
 * 1. locals.user null                    -> 401
 * 2. signed in, not a moderator           -> 404 (never 403)
 * 3. malformed revisionId                 -> 404
 * 4. bad JSON / non-string note           -> 400
 * 5. rejectRevision(): not_found          -> 404
 * 6. not_pending / invalid_note           -> 422 { error }
 * 7. reject_failed                        -> 500 { error }
 * 8. success                              -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { rejectRevision } from '@lib/activities/moderation';

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

const VALIDATION_ERRORS: ReadonlySet<string> = new Set(['not_pending', 'invalid_note']);

interface RechazarInput {
  note: unknown;
}

function isRechazarInput(value: unknown): value is RechazarInput {
  return typeof value === 'object' && value !== null && 'note' in value;
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const revisionId = params.revisionId;
  if (typeof revisionId !== 'string' || !isUuid(revisionId)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!isRechazarInput(body) || typeof body.note !== 'string') {
    return json({ error: 'bad_request' }, 400);
  }

  const result = await rejectRevision(revisionId, moderator.id, body.note);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'not_found') return notFound();
  if (VALIDATION_ERRORS.has(result.error)) return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
