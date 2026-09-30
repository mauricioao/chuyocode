/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/renombrar`
 * `{ title }` — renames a module.
 *
 * ```
 * 1. locals.user null                -> 401
 * 2. signed in, not a moderator        -> 404 (never 403)
 * 3. malformed courseId/moduleId       -> 404
 * 4. bad JSON / non-string title       -> 400
 * 5. renameModule(): invalid_title     -> 422 { error }
 * 6. renameModule(): unavailable/db    -> 500 { error }
 * 7. success                           -> 200 { ok: true }
 * ```
 *
 * `courseId` is only path structure here — `renameModule` addresses the
 * module by its own id, same posture the rest of this admin surface takes
 * (every actor is already moderator-gated; there is no cross-tenant
 * boundary to enforce between a course and its modules).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { renameModule } from '@lib/courses/admin';

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

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const courseId = params.courseId;
  const moduleId = params.moduleId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFound();
  if (typeof moduleId !== 'string' || !isUuid(moduleId)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const title = (body as { title?: unknown } | null)?.title;
  if (typeof title !== 'string') return json({ error: 'bad_request' }, 400);

  const result = await renameModule(moduleId, title);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'invalid_title') return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
