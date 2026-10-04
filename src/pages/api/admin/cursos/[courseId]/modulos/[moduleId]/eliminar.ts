/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/eliminar` — deletes
 * a module and every lesson under it (`on delete cascade`, `0017_courses.sql`).
 *
 * ```
 * 1. locals.user null              -> 401
 * 2. signed in, not a moderator      -> 404 (never 403)
 * 3. malformed courseId/moduleId     -> 404
 * 4. deleteModule(): db error        -> 500 { error }
 * 5. success (idempotent)            -> 200 { ok: true }
 * ```
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { deleteModule } from '@lib/courses/admin';

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  const moduleId = params.moduleId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();
  if (typeof moduleId !== 'string' || !isUuid(moduleId)) return notFoundResponse();

  const result = await deleteModule(moduleId);
  if (result.ok) return jsonResponse({ ok: true }, 200);
  return jsonResponse({ error: result.error }, 500);
};
