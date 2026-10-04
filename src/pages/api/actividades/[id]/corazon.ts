/**
 * `POST /api/actividades/[id]/corazon` — toggle the signed-in caller's
 * "heart" (like) of a LIVE activity (Descubrir/discovery). See
 * `toggleActivityHeart` (`@lib/activities/hearts`) for the atomic
 * pre-fetch + RPC this wraps.
 *
 * ```
 * 1. locals.user null                    -> 401
 * 2. malformed id                        -> 404
 * 3. toggleActivityHeart(): not_found    -> 404 (not live, or does not
 *    exist — same response either way, never confirms which)
 * 4. self_heart                          -> 403
 * 5. toggle_failed                       -> 500 { error }
 * 6. success                             -> 200 { hearted, heartCount }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { isUuid } from '@lib/activities/paths';
import { toggleActivityHeart } from '@lib/activities/hearts';

function forbidden(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 403, statusText: 'Forbidden', headers });
}

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) return notFoundResponse();

  const result = await toggleActivityHeart(id, user.id);
  if (result.ok) return jsonResponse({ hearted: result.hearted, heartCount: result.heartCount }, 200);

  if (result.error === 'not_found') return notFoundResponse();
  if (result.error === 'self_heart') return forbidden();
  return jsonResponse({ error: result.error }, 500);
};
