/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/lecciones/orden`
 * `{ lessonIds }` — reorders every lesson of a module to match `lessonIds`'s
 * order (see `reorderLessons`'s two-phase renumbering).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { reorderLessons } from '@lib/courses/admin';

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
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
  const lessonIds = (body as { lessonIds?: unknown } | null)?.lessonIds;
  if (!isStringArray(lessonIds)) return json({ error: 'bad_request' }, 400);

  const result = await reorderLessons(moduleId, lessonIds);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'invalid_order') return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
