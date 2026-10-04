/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/lecciones/[lessonId]/eliminar`
 * — deletes a lesson.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { deleteLesson } from '@lib/courses/admin';

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  const moduleId = params.moduleId;
  const lessonId = params.lessonId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();
  if (typeof moduleId !== 'string' || !isUuid(moduleId)) return notFoundResponse();
  if (typeof lessonId !== 'string' || !isUuid(lessonId)) return notFoundResponse();

  const result = await deleteLesson(lessonId);
  if (result.ok) return jsonResponse({ ok: true }, 200);
  return jsonResponse({ error: result.error }, 500);
};
