/**
 * Server-only exercise "like" counters.
 *
 * Backs the like endpoint (`/api/me-gusta/[id]`) and the SSR count on the
 * exercise detail page. Liking is a TOGGLE, so the write side is a symmetric
 * pair — {@link incrementLike} and {@link decrementLike} — and neither of them
 * decides WHICH one to call: that is the endpoint's job, read off the dedup
 * cookie. Same shape and same security posture as
 * src/lib/downloads.ts: writes go through the service-role client, the table has
 * RLS enabled with NO public policies, and the browser never talks to Supabase
 * itself — exposing a writable counter to the anon key would make the number
 * mean nothing (see supabase/migrations/0005_exercise_likes.sql).
 *
 * FAIL-SAFE, without exception. Neither operation throws: both collapse every
 * failure — a Supabase outage, an unconfigured service-role key, an unknown
 * exercise id — to `null`. A like counter is decoration on a page whose actual
 * job is grading an exercise; it must never be able to break that page.
 *
 * `null` IS THE VOCABULARY, and it means "we do not know", never "zero". That
 * distinction is the whole reason these return `number | null` instead of
 * `number`: the SSR page turns `null` into a hidden control, and the endpoint
 * turns it into "revert your optimistic +1" — two different correct reactions
 * that a coerced `0` would have collapsed into "somebody un-liked this".
 *
 * DELIBERATELY UNCACHED, unlike the download ranking. That cache exists because
 * the home page reads a top-N list on every render; this reads ONE row by
 * primary key, on a page that is already fetching the exercise itself. A 60s
 * cache would buy a negligible saving and would show a learner who just liked an
 * exercise the OLD number when they reload — which reads as a lost like.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';

/** DB table + RPC names — must match the SQL migrations. */
export const EXERCISE_LIKES_TABLE = 'exercise_likes';
export const INCREMENT_LIKE_RPC = 'increment_exercise_like';
/** Added by supabase/migrations/0006_exercise_like_toggle.sql. */
export const DECREMENT_LIKE_RPC = 'decrement_exercise_like';

/**
 * Per-exercise dedup cookie prefix. Mirrors the download proxy's `chu_dl_`.
 *
 * It lives HERE rather than in the endpoint because it has two readers that must
 * agree: the endpoint ARMS the cookie, and the SSR page READS it to decide
 * whether the button starts out already liked. A prefix owned by one of them and
 * imported by the other would make a page import a route module for a string.
 */
export const LIKE_COOKIE_PREFIX = 'chu_like_';

/**
 * Canonical 8-4-4-4-12 hex form, which is what `gen_random_uuid()` produces and
 * what PostgREST accepts for a `uuid` column.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Is `value` shaped like an exercise id?
 *
 * The id reaches the endpoint from the BROWSER, so it is untrusted input. This
 * is a cheap structural guard that runs BEFORE any query — the same reasoning as
 * the taxonomy guards on the detail route: a string that cannot be a uuid can
 * never match a row, so spending a round trip on it only makes the failure
 * slower. It also keeps a malformed id from reaching Postgres as a cast error,
 * which is a noisier failure than a plain "no".
 *
 * It is NOT an existence check. Whether the exercise is real is settled by the
 * foreign key on `exercise_likes`, which is one constraint instead of one extra
 * query per like.
 */
export function isExerciseId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Lazily-created service-role client. Created on first use (not module load) so
 * the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset — likes simply
 * become no-ops until the key is configured.
 */
let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    // Missing service-role key (or any init error): likes become no-ops.
    return null;
  }
}

/**
 * Read a `bigint` counter coming back over JSON, or `null` if it is not one.
 *
 * PostgREST may hand a `bigint` back as a JSON number OR as a string depending
 * on its size and configuration, so both are accepted. Everything else —
 * `undefined`, `null`, `NaN`, a negative or fractional value — returns `null`
 * rather than being coerced to `0`: a counter we cannot read is unknown, and
 * reporting it as zero would render as "the likes were wiped".
 */
function readCount(value: unknown): number | null {
  // 🔴 `null` MUST be rejected BEFORE the coercion, because `Number(null)` is 0
  // — so an RPC that answered nothing would have rendered as "the likes were
  // wiped", which is the one thing this function exists to prevent. The
  // docstring above always promised this; the code only started keeping the
  // promise when the decrement RPC made "no answer" a reachable shape.
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * Atomically add one like to `exerciseId` and return the NEW total.
 *
 * Returns `null` on any failure — an unconfigured key, a malformed id, an
 * unknown exercise (the foreign key rejects it), or a Supabase outage. NEVER
 * throws.
 *
 * The count comes back from the RPC itself rather than from a follow-up SELECT:
 * one round trip, and no window in which the write and the read can disagree.
 */
export async function incrementLike(
  exerciseId: string,
): Promise<number | null> {
  if (!isExerciseId(exerciseId)) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.rpc(INCREMENT_LIKE_RPC, {
      exercise: exerciseId,
    });
    if (error) {
      console.error('[likes] incrementLike failed:', error.message);
      return null;
    }
    return readCount(data);
  } catch (err) {
    console.error('[likes] incrementLike threw:', err);
    return null;
  }
}

/**
 * Atomically take one like back off `exerciseId` and return the NEW total.
 *
 * The mirror of {@link incrementLike}, with the same contract: `null` on any
 * failure, never a throw, and the authoritative count in the same round trip
 * that writes it.
 *
 * 🔴 THE FLOOR IS THE DATABASE'S JOB, NOT THIS FUNCTION'S. There is no
 * `Math.max` here on purpose. Clamping in JavaScript would mean reading the
 * count, subtracting, and writing a literal back — three steps with a window
 * between them in which a second un-like can read the same "1" and both write
 * "0", or worse. The clamp lives inside the RPC's single UPDATE statement (see
 * `0006_exercise_like_toggle.sql`), plus a CHECK constraint behind it, so
 * concurrency is settled by Postgres row locking rather than by hope.
 *
 * The RPC is TOTAL: an exercise with no counter row yet answers 0 rather than
 * nothing. So a `null` here always means the call failed, never "there was
 * nothing to take away".
 */
export async function decrementLike(
  exerciseId: string,
): Promise<number | null> {
  if (!isExerciseId(exerciseId)) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.rpc(DECREMENT_LIKE_RPC, {
      exercise: exerciseId,
    });
    if (error) {
      console.error('[likes] decrementLike failed:', error.message);
      return null;
    }
    return readCount(data);
  } catch (err) {
    console.error('[likes] decrementLike threw:', err);
    return null;
  }
}

/**
 * Read the current like count for `exerciseId`, or `null` when it is unknown.
 *
 * NO ROW IS A LEGITIMATE `0`, not a failure: the row is created by the first
 * like, so every exercise nobody has liked yet has no row at all. Collapsing
 * that into `null` would hide the control on the majority of the catalogue.
 *
 * Everything that is actually a failure returns `null`, and the caller decides
 * what to do with the uncertainty.
 */
export async function getLikeCount(exerciseId: string): Promise<number | null> {
  if (!isExerciseId(exerciseId)) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(EXERCISE_LIKES_TABLE)
      .select('count')
      .eq('exercise_id', exerciseId)
      .maybeSingle();

    if (error) {
      console.error('[likes] getLikeCount failed:', error.message);
      return null;
    }
    // No row yet — nobody has liked this exercise. That is a real zero.
    if (!data) return 0;

    return readCount((data as { count?: unknown }).count);
  } catch (err) {
    console.error('[likes] getLikeCount threw:', err);
    return null;
  }
}

/**
 * Reset the lazily-created service client. Primarily for test isolation: it is a
 * module-level singleton, so a test that configures a key would otherwise leak
 * the live client into a later "unconfigured key" test.
 */
export function clearLikesClient(): void {
  serviceClient = null;
}
