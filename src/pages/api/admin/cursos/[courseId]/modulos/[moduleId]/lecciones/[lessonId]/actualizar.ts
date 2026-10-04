/**
 * `POST /api/admin/cursos/[courseId]/modulos/[moduleId]/lecciones/[lessonId]/actualizar`
 * `{ title?, kind?, content?, duration_min?, is_preview? }` — patches a
 * lesson. `kind` and `content` must be sent together (`updateLesson`'s own
 * rule — validating one without the other cannot tell whether the row still
 * matches its kind).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { updateLesson, type LessonInput } from '@lib/courses/admin';

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
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  const moduleId = params.moduleId;
  const lessonId = params.lessonId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();
  if (typeof moduleId !== 'string' || !isUuid(moduleId)) return notFoundResponse();
  if (typeof lessonId !== 'string' || !isUuid(lessonId)) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (typeof body !== 'object' || body === null) return jsonResponse({ error: 'bad_request' }, 400);

  const patch = toPatch(body as LessonPatchBody);
  if (!patch) return jsonResponse({ error: 'bad_request' }, 400);

  const result = await updateLesson(lessonId, patch);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (VALIDATION_ERRORS.has(result.error)) return jsonResponse({ error: result.error }, 422);
  return jsonResponse({ error: result.error }, 500);
};
