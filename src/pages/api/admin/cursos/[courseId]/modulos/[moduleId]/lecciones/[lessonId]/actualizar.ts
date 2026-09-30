/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/lecciones/[lessonId]/actualizar`
 * `{ title?, kind?, content?, duration_min?, is_preview? }` — patches a
 * lesson. `kind` and `content` must be sent together (`updateLesson`'s own
 * rule — validating one without the other cannot tell whether the row still
 * matches its kind).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { updateLesson, type LessonInput } from '@lib/courses/admin';

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

interface LessonPatchBody {
  title?: unknown;
  kind?: unknown;
  content?: unknown;
  duration_min?: unknown;
  is_preview?: unknown;
}

function toPatch(body: LessonPatchBody): Partial<LessonInput> | null {
  const patch: Partial<LessonInput> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') return null;
    patch.title = body.title;
  }
  if (body.kind !== undefined) {
    if (body.kind !== 'text' && body.kind !== 'video' && body.kind !== 'activity') return null;
    patch.kind = body.kind;
  }
  if (body.content !== undefined) {
    if (typeof body.content !== 'object' || body.content === null) return null;
    patch.content = body.content as Record<string, unknown>;
  }
  if (body.duration_min !== undefined) {
    if (body.duration_min !== null && typeof body.duration_min !== 'number') return null;
    patch.duration_min = body.duration_min as number | null;
  }
  if (body.is_preview !== undefined) {
    if (typeof body.is_preview !== 'boolean') return null;
    patch.is_preview = body.is_preview;
  }
  return patch;
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const courseId = params.courseId;
  const moduleId = params.moduleId;
  const lessonId = params.lessonId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFound();
  if (typeof moduleId !== 'string' || !isUuid(moduleId)) return notFound();
  if (typeof lessonId !== 'string' || !isUuid(lessonId)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof body !== 'object' || body === null) return json({ error: 'bad_request' }, 400);

  const patch = toPatch(body as LessonPatchBody);
  if (!patch) return json({ error: 'bad_request' }, 400);

  const result = await updateLesson(lessonId, patch);
  if (result.ok) return json({ ok: true }, 200);

  if (VALIDATION_ERRORS.has(result.error)) return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
