/**
 * `POST /api/admin/cursos/[courseId]/acceso/otorgar` `{ email }` — grants a
 * user lifetime access to a course ("Otorgar acceso"), recording a
 * `course_purchases` row with `source: 'grant'` and `granted_by` set to the
 * acting moderator.
 *
 * ```
 * 1. locals.user null                 -> 401
 * 2. signed in, not a moderator        -> 404 (never 403)
 * 3. malformed courseId                -> 404
 * 4. bad JSON / non-string email       -> 400
 * 5. grantAccess(): user_not_found     -> 404 { error }
 * 6. grantAccess(): already_owned      -> 409 { error }
 * 7. grantAccess(): unavailable/db     -> 500 { error }
 * 8. success                           -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { grantAccess } from '@lib/courses/admin';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== 'string' || email.trim().length === 0) return jsonResponse({ error: 'bad_request' }, 400);

  const result = await grantAccess(courseId, email, moderator.id);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (result.error === 'user_not_found') return jsonResponse({ error: result.error }, 404);
  if (result.error === 'already_owned') return jsonResponse({ error: result.error }, 409);
  return jsonResponse({ error: result.error }, 500);
};
