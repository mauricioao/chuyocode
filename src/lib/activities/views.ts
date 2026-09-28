/**
 * View tracking for the practice page (`/[lang]/ingles/actividades/[id]`,
 * PR D "Activities practice"). The ONE write path is the atomic
 * upsert-increment SQL function `record_activity_view`
 * (`supabase/migrations/0012_activity_views.sql`) — this module is a thin,
 * fail-safe RPC wrapper, kept separate from `activities.ts` because it is a
 * different concern (a counter, not the activity's own content) with its
 * own table and its own failure posture.
 *
 * FAIL-SAFE: `null` on any failure, same posture as every other read/write
 * in this codebase. Losing a view count is cosmetic — a "Primera vez"
 * shown to a returning visitor is a wrong label, not a broken page — so an
 * outage here must never fail the request that triggered it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { isUuid } from './paths';

/** The SQL function name — must match `0012_activity_views.sql`. */
export const RECORD_ACTIVITY_VIEW_FN = 'record_activity_view';

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
export function clearViewsClient(): void {
  serviceClient = null;
}

/**
 * Record one view of `activityId` by `userId`, returning the new total view
 * count for that pair, or `null` on any failure (bad ids, no client, a
 * Supabase error, or a thrown client).
 */
export async function recordActivityView(userId: string, activityId: string): Promise<number | null> {
  if (!isUuid(userId) || !isUuid(activityId)) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.rpc(RECORD_ACTIVITY_VIEW_FN, {
      p_user: userId,
      p_activity: activityId,
    });

    if (error) {
      console.error('[activities/views] recordActivityView failed:', error.message);
      return null;
    }
    return typeof data === 'number' ? data : null;
  } catch (err) {
    console.error('[activities/views] recordActivityView threw:', err);
    return null;
  }
}
