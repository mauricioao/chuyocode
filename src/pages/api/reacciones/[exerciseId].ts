/**
 * POST /api/reacciones/[exerciseId] — the identity-backed reaction upsert
 * (slice 9, design.md §4 "API").
 *
 * 🔴 401 ON NO SESSION, UNLIKE `/api/me-gusta/[id]`. Liking is anonymous by
 * design (a cookie is enough dedup for a decoration); a reaction feeds the
 * auditing threshold (`0009_exercise_reactions.sql`), so it MUST be traceable
 * to one accountable identity. `locals.user` is the server-verified caller
 * middleware already resolved via `getUser()` — this route never re-derives
 * it and never accepts one from the request body.
 *
 * NO SESSION CLIENT IS BUILT HERE. `exercise_reactions` has RLS enabled with
 * ZERO public policies, so even an authenticated caller's own session/anon
 * client could not write this table — only `service_role` can
 * (`src/lib/reactions.ts`), the same posture as `likes.ts` and `roles.ts`.
 * This route's only job is to turn `locals.user.id` plus a validated body
 * into that one call. Middleware already flushes any rotated session cookie
 * onto the response it returns, so nothing here needs `flushSessionHeaders`.
 *
 * RESPONSE IS `{ ok }` ONLY, never the dislike counts: exposing them would
 * invite brigade coordination and they have no learner-facing use (design.md
 * §4). A failed upsert (outage, unconfigured key) is `{ ok: false }` at 200,
 * never a 500 — mirroring `likes.ts`'s fail-safe contract, because a reaction
 * is not on the critical path of grading an exercise.
 *
 * Every response is marked private/no-store: it is read off `locals.user`,
 * so a shared cache serving it to a different visitor would leak identity
 * (design §2, threat matrix T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '@lib/apiResponse';
import { isExerciseId } from '@lib/likes';
import { isValidReaction, upsertReaction, type ReactionInput } from '@lib/reactions';

export const POST: APIRoute = async ({ params, request, locals }) => {
  // T3: no session, no reaction — checked BEFORE any other guard so an
  // anonymous request never even reveals whether the id or body was valid.
  // Body shape is `{ ok: false }`, not the shared `requireUser()`'s
  // `{ error: 'unauthorized' }` — kept exactly as this route always
  // answered it.
  const user = locals.user;
  if (!user) {
    return jsonResponse({ ok: false }, 401);
  }

  // A string that cannot be a uuid can never match a row (same reasoning as
  // `isExerciseId`'s other caller, `/api/me-gusta/[id]`). Whether the
  // exercise actually exists is settled by the foreign key on
  // `exercise_reactions`, not by an extra query here.
  const exerciseId = params.exerciseId;
  if (!isExerciseId(exerciseId)) {
    // No `markPrivate` here, same as this route always answered it — the
    // shared `notFoundResponse()` would add a `cache-control` header this
    // exact response has never carried.
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false }, 400);
  }

  if (!isValidReaction(body)) {
    return jsonResponse({ ok: false }, 400);
  }

  const reaction: ReactionInput =
    body.kind === 'dislike' ? { kind: 'dislike', reason: body.reason } : { kind: 'like' };

  const ok = await upsertReaction(user.id, exerciseId, reaction);
  return jsonResponse({ ok }, 200);
};
