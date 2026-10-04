/**
 * `POST /api/admin/cursos/[courseId]/estado` `{ status }` — sets a course's
 * lifecycle status (`draft` / `published` / `archived`).
 *
 * ```
 * 1. locals.user null                  -> 401
 * 2. signed in, not a moderator         -> 404 (never 403)
 * 3. malformed courseId                 -> 404
 * 4. bad JSON / non-string status       -> 400
 * 5. setCourseStatus(): invalid_status  -> 422 { error }
 * 6. setCourseStatus(): unavailable/db  -> 500 { error }
 * 7. success                            -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { setCourseStatus } from '@lib/courses/admin';
import type { CourseStatus } from '@lib/courses/access';

const STATUSES: ReadonlySet<string> = new Set(['draft', 'published', 'archived']);

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  const status = (body as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !STATUSES.has(status)) return jsonResponse({ error: 'bad_request' }, 400);

  const result = await setCourseStatus(courseId, status as CourseStatus);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (result.error === 'invalid_status') return jsonResponse({ error: result.error }, 422);
  return jsonResponse({ error: result.error }, 500);
};
