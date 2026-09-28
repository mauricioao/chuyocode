/**
 * Server-only read/write path for `activities` and their `activity_revisions`
 * (PR B, "Activities creator"). Mirrors `src/lib/exercises.ts`'s fail-safe
 * posture: every read collapses to `null` on any failure, and ownership is
 * always enforced IN THE QUERY, never re-checked afterward on a blind
 * fetch-by-id — a mismatch and "does not exist" collapse to the identical
 * `null`, which every caller here turns into one 404 (never a 403 that would
 * confirm a stranger's activity id exists).
 *
 * Reads/writes go through the service-role client because both tables have
 * RLS enabled with no public policies (`supabase/migrations/0011_activities.sql`):
 * the anon key gets nothing.
 *
 * `removed` IS EXCLUDED from an author's own edit surface, same posture as
 * `getExercisesByAuthor`'s header: a soft-deleted activity is gone from its
 * own author's workspace too, not only from public view.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { parseBlocks, type Block } from './blocks';
import { isLevel, type Level } from '../exerciseTaxonomy';

/** DB table names — must match `supabase/migrations/0011_activities.sql`. */
export const ACTIVITIES_TABLE = 'activities';
export const ACTIVITY_REVISIONS_TABLE = 'activity_revisions';

/** Statuses excluded from an author's own edit surface — see file header. */
const REMOVED_STATUS = 'removed';

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

/**
 * Reset the lazily-created service client. Test isolation only, same reason
 * as `exercises.ts`'s `clearExercisesClient`.
 */
export function clearActivitiesClient(): void {
  serviceClient = null;
}

export interface NewActivityInput {
  title: string;
  level: Level | null;
  blocks: Block[];
}

/**
 * Create a brand-new activity and its first `draft` revision, in that order.
 *
 * Returns the new activity's id, or `null` on ANY failure — including a
 * revision-insert failure AFTER the activity row was created. That leaves a
 * revision-less activity row behind rather than rolling it back (no
 * multi-statement transaction is available through the JS client here), but
 * it is harmless: the `activities_live_has_revision` check means it can
 * never become `live`, and it is simply an orphaned draft the author never
 * gets an id back for — logged, not surfaced.
 */
export async function createActivity(
  authorId: string,
  input: NewActivityInput,
): Promise<string | null> {
  if (authorId.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(ACTIVITIES_TABLE)
      .insert({ author_id: authorId, title: input.title, level: input.level })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('[activities] createActivity insert failed:', error?.message);
      return null;
    }

    const row = data as unknown as Record<string, unknown>;
    const activityId = row.id;
    if (typeof activityId !== 'string' || activityId.length === 0) return null;

    const { error: revisionError } = await client.from(ACTIVITY_REVISIONS_TABLE).insert({
      activity_id: activityId,
      blocks: input.blocks,
      created_by: authorId,
      status: 'draft',
    });

    if (revisionError) {
      console.error('[activities] createActivity revision insert failed:', revisionError.message);
      return null;
    }

    return activityId;
  } catch (err) {
    console.error('[activities] createActivity threw:', err);
    return null;
  }
}

/** One activity + its latest revision, as the editor needs them. */
export interface EditableActivity {
  id: string;
  title: string;
  level: Level | null;
  blocks: Block[];
  revisionId: string;
  /** `activity_revisions.status` — the save endpoint reads this to decide update-vs-insert. */
  revisionStatus: string;
  /** `activities.status` — the editor's own review-state badge (PR D, "Activities practice"). */
  status: string;
  /** `activities.review_note` — shown alongside the badge when `status === 'rejected'`. */
  reviewNote: string | null;
}

/**
 * Fetch one activity by id, for editing — but ONLY for `authorId`, its
 * owner, and only its LATEST revision (`activity_revisions_activity_created_idx`
 * orders exactly this way). See file header for the ownership/fail-safe posture.
 */
export async function getActivityForEdit(
  id: string,
  authorId: string,
): Promise<EditableActivity | null> {
  if (id.length === 0 || authorId.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data: activityData, error: activityError } = await client
      .from(ACTIVITIES_TABLE)
      .select('id, title, level, status, review_note')
      .eq('id', id)
      .eq('author_id', authorId)
      .neq('status', REMOVED_STATUS)
      .maybeSingle();

    if (activityError) {
      console.error('[activities] getActivityForEdit activity fetch failed:', activityError.message);
      return null;
    }
    if (!activityData) return null;

    const { data: revisionData, error: revisionError } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .select('id, blocks, status')
      .eq('activity_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (revisionError) {
      console.error('[activities] getActivityForEdit revision fetch failed:', revisionError.message);
      return null;
    }
    if (!revisionData) return null;

    const activityRow = activityData as unknown as Record<string, unknown>;
    const revisionRow = revisionData as unknown as Record<string, unknown>;

    if (typeof activityRow.title !== 'string') return null;
    if (typeof activityRow.status !== 'string') return null;
    if (typeof revisionRow.id !== 'string' || revisionRow.id.length === 0) return null;
    if (typeof revisionRow.status !== 'string') return null;

    const blocks = parseBlocks(revisionRow.blocks);
    if (!blocks) {
      console.error('[activities] malformed blocks for activity id:', id);
      return null;
    }

    return {
      id,
      title: activityRow.title,
      level: isLevel(activityRow.level) ? activityRow.level : null,
      blocks,
      revisionId: revisionRow.id,
      revisionStatus: revisionRow.status,
      status: activityRow.status,
      reviewNote: typeof activityRow.review_note === 'string' ? activityRow.review_note : null,
    };
  } catch (err) {
    console.error('[activities] getActivityForEdit threw:', err);
    return null;
  }
}
