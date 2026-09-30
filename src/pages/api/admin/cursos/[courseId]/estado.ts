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
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { setCourseStatus } from '@lib/courses/admin';
import type { CourseStatus } from '@lib/courses/access';

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

const STATUSES: ReadonlySet<string> = new Set(['draft', 'published', 'archived']);

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const courseId = params.courseId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const status = (body as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !STATUSES.has(status)) return json({ error: 'bad_request' }, 400);

  const result = await setCourseStatus(courseId, status as CourseStatus);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'invalid_status') return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
