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
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { revokeAccess } from '@lib/courses/admin';

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

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const courseId = params.courseId;
  const userId = params.userId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFound();
  if (typeof userId !== 'string' || !isUuid(userId)) return notFound();

  const result = await revokeAccess(courseId, userId);
  if (result.ok) return json({ ok: true }, 200);
  return json({ error: result.error }, 500);
};
