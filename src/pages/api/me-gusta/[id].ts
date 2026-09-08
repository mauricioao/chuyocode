/**
 * POST /api/me-gusta/[id] — the exercise like counter.
 *
 * THE ONLY WRITER OF THE LIKE COUNTER. The browser never talks to Supabase: an
 * anon key that could write this table would make the number meaningless, so
 * `exercise_likes` has RLS on with no public policies and only the service-role
 * key (server-side) reaches it. This route is that server side.
 *
 * Flow:
 *   1. Reject anything that is not a uuid → 404, before any query.
 *   2. If this browser already has a fresh `chu_like_<id>` cookie, do NOT count
 *      again — just report the current total.
 *   3. Otherwise increment atomically and arm the 24h dedup cookie.
 *   4. Answer `{ count }` — the AUTHORITATIVE total, or `null` when unknown.
 *
 * 🔴 THE RESPONSE IS `{ count: number | null }` AND `null` IS LOAD-BEARING.
 * The button updates optimistically, so it needs an answer it can either
 * confirm or undo. A number is the truth and replaces whatever the button
 * guessed; `null` means the counter is unavailable and the button must REVERT.
 * Sending `0` in that case would be a lie in the worst direction — it would
 * render a popular exercise as unliked.
 *
 * FAIL-SAFE: a Supabase outage is a 200 with `count: null`, not a 500. The
 * request was understood and nothing about it was wrong; the counter is simply
 * not available, and a like button is decoration on a page whose real job is
 * grading an exercise. It must never be able to break that page.
 *
 * POST, not GET: this mutates. It also means a link preview, a crawler or a
 * prefetch cannot inflate the count by looking at the page.
 *
 * NOT A SECURITY BOUNDARY. There are no accounts, so the cookie is a spam speed
 * bump (see `src/lib/dedupCookie.ts`) — it makes ordinary use count once and
 * nothing more. A determined actor with `curl` can still count repeatedly; that
 * needs identity, which this feature deliberately does not introduce.
 */
import type { APIRoute } from 'astro';
import { dedupCookie, dedupCookieName, hasDedupCookie } from '@lib/dedupCookie';
import {
  getLikeCount,
  incrementLike,
  isExerciseId,
  LIKE_COOKIE_PREFIX,
} from '@lib/likes';

/** JSON body shape. `count: null` means "unknown" — never "zero". */
export interface LikeResponse {
  count: number | null;
}

function json(body: LikeResponse, headers?: Headers): Response {
  const h = headers ?? new Headers();
  h.set('content-type', 'application/json; charset=utf-8');
  // Nothing about a mutation's answer should ever be reused from a cache.
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status: 200, headers: h });
}

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;

  // A string that cannot be a uuid can never match a row, so it is rejected
  // before any round trip — the same reasoning as the taxonomy guards on the
  // exercise route. Whether the exercise actually EXISTS is settled by the
  // foreign key on `exercise_likes`, not by an extra query here.
  if (!isExerciseId(id)) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }

  const cookieName = dedupCookieName(LIKE_COOKIE_PREFIX, id);

  // Already counted within the window. Report the CURRENT total rather than
  // saying nothing: the button's optimistic +1 has to be undone, and the honest
  // way to undo it is to hand back the real number.
  if (hasDedupCookie(request.headers.get('cookie'), cookieName)) {
    return json({ count: await getLikeCount(id) });
  }

  const count = await incrementLike(id);

  // THE COOKIE IS ARMED ONLY ON A CONFIRMED WRITE. Arming it after a failure
  // would lock this browser out of liking for 24 hours over a transient outage
  // — a failure the learner never saw, silently turned into a permanent one.
  const headers = new Headers();
  if (count !== null) {
    headers.append(
      'set-cookie',
      // Dev runs on plain http://localhost, where a `Secure` cookie is dropped
      // outright and the dedup would look broken rather than absent.
      dedupCookie(cookieName, { secure: import.meta.env?.PROD === true }),
    );
  }

  return json({ count }, headers);
};
