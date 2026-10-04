/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/lecciones/orden`
 * `{ lessonIds }` — reorders every lesson of a module to match `lessonIds`'s
 * order (see `reorderLessons`'s two-phase renumbering).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { reorderLessons } from '@lib/courses/admin';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  const moduleId = params.moduleId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();
  if (typeof moduleId !== 'string' || !isUuid(moduleId)) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const lessonIds = (body as { lessonIds?: unknown } | null)?.lessonIds;
  if (!isStringArray(lessonIds)) return jsonResponse({ error: 'bad_request' }, 400);

  const result = await reorderLessons(moduleId, lessonIds);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (result.error === 'invalid_order') return jsonResponse({ error: result.error }, 422);
  return jsonResponse({ error: result.error }, 500);
};
