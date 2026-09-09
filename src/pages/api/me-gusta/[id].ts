/**
 * POST /api/me-gusta/[id] — the exercise like TOGGLE.
 *
 * THE ONLY WRITER OF THE LIKE COUNTER. The browser never talks to Supabase: an
 * anon key that could write this table would make the number meaningless, so
 * `exercise_likes` has RLS on with no public policies and only the service-role
 * key (server-side) reaches it. This route is that server side.
 *
 * Flow:
 *   1. Reject anything that is not a uuid → 404, before any query.
 *   2. `chu_like_<id>` cookie ABSENT → increment, and arm the 24h cookie.
 *   3. `chu_like_<id>` cookie PRESENT → decrement, and clear the cookie.
 *   4. Answer `{ count }` — the AUTHORITATIVE total, or `null` when unknown.
 *
 * 🔴 THE COOKIE IS THE STATE, WHICH IS WHY THE TOGGLE IS ONE BRANCH AND NOT A
 * PROTOCOL. There are no accounts, so "did this browser like this exercise" had
 * to be recorded somewhere anyway — and it already was, by the dedup cookie the
 * one-way version needed. Reading it as the toggle's state means the browser
 * sends NO intent at all: no request body, no query flag, nothing the client can
 * get out of step with. The server cannot be told "un-like" by something that
 * never liked, because the only evidence it accepts is a cookie it set itself.
 *
 * THE 24h WINDOW STILL GOVERNS THE LIKE, AND ONLY THE LIKE. Liking arms it;
 * un-liking clears it immediately, because making someone wait a day to undo a
 * mis-click would be a punishment, not a dedup. Re-liking afterwards does count
 * again — and that is not a hole, it is what a toggle means: the decrement
 * already gave the point back, so a browser can still only ever contribute a net
 * +1 while it is in the liked state.
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
import {
  clearDedupCookie,
  dedupCookie,
  dedupCookieName,
  hasDedupCookie,
} from '@lib/dedupCookie';
import {
  decrementLike,
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
  // The cookie is the whole input. Present means this browser is currently
  // liking the exercise, so the press can only mean "take it back".
  const liked = hasDedupCookie(request.headers.get('cookie'), cookieName);

  const count = liked ? await decrementLike(id) : await incrementLike(id);

  // 🔴 THE COOKIE MOVES ONLY ON A CONFIRMED WRITE, IN BOTH DIRECTIONS.
  //   - Arming it after a failed like would lock this browser out for 24 hours
  //     over a transient outage: a failure nobody saw, made permanent.
  //   - Clearing it after a failed un-like is the mirror mistake and the worse
  //     one — the count would still hold the like while the browser believed it
  //     had none, so the next press would ADD a second one.
  // Leaving the cookie exactly where it was keeps the browser's state and the
  // counter's state in agreement whenever the write did not happen.
  const headers = new Headers();
  if (count !== null) {
    // Dev runs on plain http://localhost, where a `Secure` cookie is dropped
    // outright and the dedup would look broken rather than absent.
    const secure = import.meta.env?.PROD === true;
    headers.append(
      'set-cookie',
      liked
        ? clearDedupCookie(cookieName, { secure })
        : dedupCookie(cookieName, { secure }),
    );
  }

  return json({ count }, headers);
};
