/**
 * `POST /api/admin/cursos/[courseId]/acceso/otorgar` `{ email }` — grants a
 * user lifetime access to a course ("Otorgar acceso"), recording a
 * `course_purchases` row with `source: 'grant'` and `granted_by` set to the
 * acting moderator.
 *
 * ```
 * 1. locals.user null                 -> 401
 * 2. signed in, not a moderator        -> 404 (never 403)
 * 3. malformed courseId                -> 404
 * 4. bad JSON / non-string email       -> 400
 * 5. grantAccess(): user_not_found     -> 404 { error }
 * 6. grantAccess(): already_owned      -> 409 { error }
 * 7. grantAccess(): unavailable/db     -> 500 { error }
 * 8. success                           -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { grantAccess } from '@lib/courses/admin';

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
  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== 'string' || email.trim().length === 0) return json({ error: 'bad_request' }, 400);

  const result = await grantAccess(courseId, email, moderator.id);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'user_not_found') return json({ error: result.error }, 404);
  if (result.error === 'already_owned') return json({ error: result.error }, 409);
  return json({ error: result.error }, 500);
};
