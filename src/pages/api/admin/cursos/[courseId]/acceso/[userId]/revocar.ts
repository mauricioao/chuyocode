/**
 * `POST /api/admin/cursos/[courseId]/acceso/[userId]/revocar` — removes a
 * user's lifetime access grant for a course (deletes the `course_purchases`
 * row regardless of its `source`).
 *
 * ```
 * 1. locals.user null              -> 401
 * 2. signed in, not a moderator     -> 404 (never 403)
 * 3. malformed courseId/userId      -> 404
 * 4. revokeAccess(): db error       -> 500 { error }
 * 5. success (idempotent)           -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { revokeAccess } from '@lib/courses/admin';

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  const userId = params.userId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();
  if (typeof userId !== 'string' || !isUuid(userId)) return notFoundResponse();

  const result = await revokeAccess(courseId, userId);
  if (result.ok) return jsonResponse({ ok: true }, 200);
  return jsonResponse({ error: result.error }, 500);
};
