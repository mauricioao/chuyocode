/**
 * `GET /api/admin/cursos/actividades/buscar?q=…` — searches LIVE (published)
 * activities by title, for the "activity" lesson kind's picker in
 * `CourseEditPanel`. Wraps `getPublishedActivities` (`@lib/activities/activities`)
 * — the exact same query the public catalog uses, so an activity only shows
 * up here once it is actually live, matching `createLesson`'s own
 * `activity_not_live` check.
 *
 * ```
 * 1. locals.user null            -> 401
 * 2. signed in, not a moderator    -> 404 (never 403)
 * 3. missing/blank q               -> 400
 * 4. success                       -> 200 { activities: [{ id, title, level }] }
 * ```
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { getPublishedActivities } from '@lib/activities/activities';

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

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const q = url.searchParams.get('q');
  if (!q || q.trim().length === 0) return json({ error: 'bad_request' }, 400);

  const page = await getPublishedActivities({ level: null, page: 1, q, viewerId: null });
  return json(
    { activities: page.activities.map((a) => ({ id: a.id, title: a.title, level: a.level })) },
    200,
  );
};
