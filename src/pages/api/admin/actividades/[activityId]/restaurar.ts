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
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { restoreActivity, removeActivity } from '@lib/activities/moderation';

type RestaurarAction = 'restore' | 'remove';

function isRestaurarAction(value: unknown): value is RestaurarAction {
  return value === 'restore' || value === 'remove';
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const activityId = params.activityId;
  if (typeof activityId !== 'string' || !isUuid(activityId)) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const action =
    typeof body === 'object' && body !== null && 'action' in body
      ? (body as { action: unknown }).action
      : undefined;
  if (!isRestaurarAction(action)) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }

  const result = action === 'restore' ? await restoreActivity(activityId, moderator.id) : await removeActivity(activityId, moderator.id);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (result.error === 'not_found') return notFoundResponse();
  if (result.error === 'not_hidden') return jsonResponse({ error: result.error }, 422);
  return jsonResponse({ error: result.error }, 500);
};
