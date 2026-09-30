/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/lecciones`
 * `{ title, kind, content, duration_min?, is_preview? }` — adds a lesson to
 * a module. `content`'s shape depends on `kind` (`createLesson`'s own
 * header): text -> `{ markdown }`, video -> `{ url }` (https,
 * YouTube/Vimeo only), activity -> `{ activityId }` (must be a LIVE
 * activity).
 *
 * ```
 * 1. locals.user null                          -> 401
 * 2. signed in, not a moderator                  -> 404 (never 403)
 * 3. malformed courseId/moduleId                 -> 404
 * 4. bad JSON / malformed field types             -> 400
 * 5. createLesson(): invalid_… / activity_not_live -> 422 { error }
 * 6. createLesson(): unavailable/db               -> 500 { error }
 * 7. success                                      -> 201 { id }
 * ```
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { createLesson, type LessonInput } from '@lib/courses/admin';

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

const VALIDATION_ERRORS: ReadonlySet<string> = new Set([
  'invalid_title',
  'invalid_duration',
  'invalid_kind',
  'invalid_content',
  'activity_not_live',
]);

interface LessonBody {
  title?: unknown;
  kind?: unknown;
  content?: unknown;
  duration_min?: unknown;
  is_preview?: unknown;
}

function toInput(body: LessonBody): LessonInput | null {
  if (typeof body.title !== 'string') return null;
  if (body.kind !== 'text' && body.kind !== 'video' && body.kind !== 'activity') return null;
  if (typeof body.content !== 'object' || body.content === null) return null;
  if (body.duration_min !== undefined && body.duration_min !== null && typeof body.duration_min !== 'number') {
    return null;
  }
  if (body.is_preview !== undefined && typeof body.is_preview !== 'boolean') return null;

  return {
    title: body.title,
    kind: body.kind,
    content: body.content as Record<string, unknown>,
    duration_min: (body.duration_min as number | null | undefined) ?? null,
    is_preview: body.is_preview as boolean | undefined,
  };
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
  if (typeof body !== 'object' || body === null) return json({ error: 'bad_request' }, 400);

  const input = toInput(body as LessonBody);
  if (!input) return json({ error: 'bad_request' }, 400);

  const result = await createLesson(moduleId, input);
  if (result.ok) return json({ id: result.value.id }, 201);

  if (VALIDATION_ERRORS.has(result.error)) return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
