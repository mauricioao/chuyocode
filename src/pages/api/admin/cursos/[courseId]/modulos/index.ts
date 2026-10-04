/**
 * `POST /api/admin/cursos/[courseId]/modulos` `{ title }` — adds a module to
 * a course (appended at the next position; see `createModule`).
 *
 * ```
 * 1. locals.user null                -> 401
 * 2. signed in, not a moderator        -> 404 (never 403)
 * 3. malformed courseId                -> 404
 * 4. bad JSON / non-string title       -> 400
 * 5. createModule(): invalid_title     -> 422 { error }
 * 6. createModule(): unavailable/db    -> 500 { error }
 * 7. success                           -> 201 { id }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { createModule } from '@lib/courses/admin';

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
  const title = (body as { title?: unknown } | null)?.title;
  if (typeof title !== 'string') return jsonResponse({ error: 'bad_request' }, 400);

  const result = await createModule(courseId, title);
  if (result.ok) return jsonResponse({ id: result.value.id }, 201);

  if (result.error === 'invalid_title') return jsonResponse({ error: result.error }, 422);
  return jsonResponse({ error: result.error }, 500);
};
