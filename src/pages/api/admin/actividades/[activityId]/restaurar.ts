/**
 * `POST /api/admin/actividades/[activityId]/restaurar` `{ action }` —
 * moderator resolution of a reported/hidden activity (PR E, "Moderation").
 * `action` is `'restore'` (back to `live`, resets the report-count window —
 * `restoreActivity`'s own header) or `'remove'` (terminal `removed`,
 * `removeActivity`).
 *
 * ```
 * 1. locals.user null                     -> 401
 * 2. signed in, not a moderator            -> 404 (never 403)
 * 3. malformed activityId                  -> 404
 * 4. bad JSON / action not restore|remove  -> 400
 * 5. not_found                             -> 404
 * 6. not_hidden                            -> 422 { error }
 * 7. restore_failed / remove_failed        -> 500 { error }
 * 8. success                               -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { restoreActivity, removeActivity } from '@lib/activities/moderation';

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

type RestaurarAction = 'restore' | 'remove';

function isRestaurarAction(value: unknown): value is RestaurarAction {
  return value === 'restore' || value === 'remove';
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const activityId = params.activityId;
  if (typeof activityId !== 'string' || !isUuid(activityId)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const action =
    typeof body === 'object' && body !== null && 'action' in body
      ? (body as { action: unknown }).action
      : undefined;
  if (!isRestaurarAction(action)) {
    return json({ error: 'bad_request' }, 400);
  }

  const result = action === 'restore' ? await restoreActivity(activityId, moderator.id) : await removeActivity(activityId, moderator.id);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'not_found') return notFound();
  if (result.error === 'not_hidden') return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
