/**
 * Server-only "heart" (like) read/write path for a LIVE activity
 * (Descubrir/discovery). Backs `POST /api/actividades/[id]/corazon` and the
 * practice page's own viewer-hearted lookup.
 *
 * Mirrors `moderation.ts`'s posture for a WRITE, not `activities.ts`'s
 * fail-safe READS: {@link toggleActivityHeart} returns a typed `Result`
 * because the endpoint needs to tell "not found / not live" from "own
 * activity" from "toggle failed" apart to answer with the right HTTP status
 * — collapsing them to `null` the way a read does would throw away exactly
 * the information the endpoint exists to report. {@link hasHeartedActivity}
 * IS a read and stays fail-safe (`false` on any failure): a wrong "not
 * hearted yet" is cosmetic, never worth failing the practice page's SSR
 * render over.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';

const ACTIVITIES_TABLE = 'activities';
const ACTIVITY_HEARTS_TABLE = 'activity_hearts';
/** The SQL function name — must match `0014_activity_discovery.sql`. */
const TOGGLE_HEART_RPC = 'toggle_activity_heart';

let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

/** Reset the lazily-created service client. Test isolation only. */
export function clearHeartsClient(): void {
  serviceClient = null;
}

export type ToggleHeartError = 'not_found' | 'self_heart' | 'toggle_failed';
export type ToggleHeartResult =
  | { ok: true; hearted: boolean; heartCount: number }
  | { ok: false; error: ToggleHeartError };

/**
 * `POST /api/actividades/[id]/corazon`'s whole write path:
 *
 * ```
 * 1. no LIVE activity at activityId              -> not_found (same
 *    response for "does not exist" and "not live" — never confirms which)
 * 2. the caller is the activity's own author      -> self_heart
 * 3. the toggle_activity_heart RPC fails or        -> toggle_failed
 *    answers a malformed row
 * 4. success                                       -> ok: true, { hearted, heartCount }
 * ```
 *
 * The activity is PRE-FETCHED (same shape as `recordReport`, `moderation.ts`)
 * so the endpoint can tell `not_found` from `self_heart` apart with the
 * right HTTP status; the RPC re-checks both anyway (defense in depth against
 * a hand-run/forged call — see the migration's own header).
 */
export async function toggleActivityHeart(activityId: string, userId: string): Promise<ToggleHeartResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'toggle_failed' };

  try {
    const { data, error } = await client
      .from(ACTIVITIES_TABLE)
      .select('id, author_id')
      .eq('id', activityId)
      .eq('visible', true)
      .maybeSingle();

    if (error) {
      console.error('[activities/hearts] toggleActivityHeart fetch failed:', error.message);
      return { ok: false, error: 'toggle_failed' };
    }
    if (!data) return { ok: false, error: 'not_found' };

    const row = data as unknown as Record<string, unknown>;
    if (row.author_id === userId) return { ok: false, error: 'self_heart' };

    const { data: rpcData, error: rpcError } = await client.rpc(TOGGLE_HEART_RPC, {
      p_user: userId,
      p_activity: activityId,
    });

    if (rpcError) {
      console.error('[activities/hearts] toggle_activity_heart RPC failed:', rpcError.message);
      return { ok: false, error: 'toggle_failed' };
    }

    // A `returns table(...)` function comes back through PostgREST as an
    // array of rows — this RPC always returns exactly one.
    const resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (typeof resultRow !== 'object' || resultRow === null) return { ok: false, error: 'toggle_failed' };

    const hearted = (resultRow as Record<string, unknown>).hearted;
    const heartCount = (resultRow as Record<string, unknown>).heart_count;
    if (typeof hearted !== 'boolean' || typeof heartCount !== 'number') {
      return { ok: false, error: 'toggle_failed' };
    }

    return { ok: true, hearted, heartCount };
  } catch (err) {
    console.error('[activities/hearts] toggleActivityHeart threw:', err);
    return { ok: false, error: 'toggle_failed' };
  }
}

/**
 * Has `userId` already hearted `activityId`? A single lookup by the
 * `activity_hearts` primary key `(user_id, activity_id)` — the practice
 * page's own "one extra indexed lookup" (`[id].astro`'s own loader).
 *
 * FAIL-SAFE: `false` on any failure — see file header.
 */
export async function hasHeartedActivity(activityId: string, userId: string): Promise<boolean> {
  if (activityId.length === 0 || userId.length === 0) return false;

  const client = getClient();
  if (!client) return false;

  try {
    const { data, error } = await client
      .from(ACTIVITY_HEARTS_TABLE)
      .select('user_id')
      .eq('user_id', userId)
      .eq('activity_id', activityId)
      .maybeSingle();

    if (error) {
      console.error('[activities/hearts] hasHeartedActivity failed:', error.message);
      return false;
    }
    return data !== null;
  } catch (err) {
    console.error('[activities/hearts] hasHeartedActivity threw:', err);
    return false;
  }
}
