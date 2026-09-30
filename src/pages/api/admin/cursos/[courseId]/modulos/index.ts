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
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { createModule } from '@lib/courses/admin';

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
  const title = (body as { title?: unknown } | null)?.title;
  if (typeof title !== 'string') return json({ error: 'bad_request' }, 400);

  const result = await createModule(courseId, title);
  if (result.ok) return json({ id: result.value.id }, 201);

  if (result.error === 'invalid_title') return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
