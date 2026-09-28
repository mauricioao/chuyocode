/**
 * Server-only moderation read/write path (PR E, "Moderation") —
 * `supabase/migrations/0013_activity_moderation.sql`'s TypeScript half.
 *
 * Mirrors `activities.ts`'s fail-safe posture for READS (a queue that could
 * not be built collapses to empty, never a 500 page) but NOT for WRITES:
 * `approveRevision`/`rejectRevision`/`restoreActivity`/`removeActivity`/
 * `recordReport` all return a typed `Result`, because a moderation action's
 * caller (the admin endpoints) needs to tell "not found" from "wrong state"
 * from "storage failed" apart to answer with the right HTTP status —
 * collapsing them to `null`/`false` the way a read does would throw away
 * exactly the information those endpoints exist to report.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { parseBlocks, type Block } from './blocks';
import { approvedImagePath, parseImagePath, UPLOADS_BUCKET, copyToImagesBucket } from './storage';

const ACTIVITIES_TABLE = 'activities';
const ACTIVITY_REVISIONS_TABLE = 'activity_revisions';
const ACTIVITY_REPORTS_TABLE = 'activity_reports';

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
export function clearModerationClient(): void {
  serviceClient = null;
}

/** Closed taxonomy — must match `activity_reports.reason`'s own check constraint. */
export const REPORT_REASONS = ['inappropriate', 'off_topic', 'copyright', 'wrong_answers', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/** A minimal author identity, resolved from `auth.users` for the queue's display. */
export interface QueueAuthor {
  id: string;
  email: string | null;
}

/** One pending revision as the moderator queue needs it. */
export interface ReviewQueueItem {
  revisionId: string;
  activityId: string;
  activityTitle: string;
  author: QueueAuthor;
  /** `activity_revisions.rights_accepted_at` — when the author submitted this revision. */
  submittedAt: string | null;
  /** True when this revision is an edit of an already-live activity (has a published sibling). */
  isEdit: boolean;
  blocks: Block[];
  /** The currently PUBLISHED revision's blocks, for the "Versión publicada / Nueva versión" toggle — `null` for a first publication. */
  publishedBlocks: Block[] | null;
}

/** One report against an activity, as the moderator queue needs it. */
export interface ActivityReport {
  id: string;
  reporterId: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
}

/** One activity hidden by reports (see file header: `status = 'pending_review'` + `published_revision_id` set). */
export interface ReportedActivityItem {
  activityId: string;
  activityTitle: string;
  author: QueueAuthor;
  reports: ActivityReport[];
}

export interface ReviewQueue {
  pending: ReviewQueueItem[];
  reported: ReportedActivityItem[];
}

/** Resolve `id -> email` for a set of user ids, via the service-role admin API. `null` email on any failure per id. */
async function resolveAuthors(client: SupabaseClient, userIds: readonly string[]): Promise<Map<string, QueueAuthor>> {
  const unique = Array.from(new Set(userIds));
  const authors = new Map<string, QueueAuthor>();
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data, error } = await client.auth.admin.getUserById(id);
        const user = (data as unknown as { user: User | null } | null)?.user ?? null;
        authors.set(id, { id, email: !error && user ? (user.email ?? null) : null });
      } catch (err) {
        console.error('[activities/moderation] resolveAuthors threw:', err);
        authors.set(id, { id, email: null });
      }
    }),
  );
  return authors;
}

/**
 * The whole moderator dashboard's data in one call: pending revisions
 * (oldest first, so the queue drains fairly) plus activities currently
 * hidden by reports. FAIL-SAFE: both lists collapse to `[]` independently on
 * a failure reading THEM — one broken query never blanks the other tab.
 */
export async function getReviewQueue(): Promise<ReviewQueue> {
  const client = getClient();
  if (!client) return { pending: [], reported: [] };

  // Sequential, not `Promise.all` — both reads still fail independently (a
  // broken query never blanks the other tab, per this function's own doc),
  // but running them one after another keeps each one's own multi-query
  // sequence easy to reason about (and to test) instead of interleaving two
  // independent call sequences against the same client.
  const pending = await loadPendingRevisions(client);
  const reported = await loadReportedActivities(client);

  return { pending, reported };
}

async function loadPendingRevisions(client: SupabaseClient): Promise<ReviewQueueItem[]> {
  try {
    const { data: revisionsData, error: revisionsError } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .select('id, activity_id, blocks, created_by, rights_accepted_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true });

    if (revisionsError || !Array.isArray(revisionsData) || revisionsData.length === 0) {
      if (revisionsError) console.error('[activities/moderation] pending revisions read failed:', revisionsError.message);
      return [];
    }

    const revisionRows = revisionsData as unknown as Array<Record<string, unknown>>;
    const activityIds = Array.from(
      new Set(revisionRows.flatMap((r) => (typeof r.activity_id === 'string' ? [r.activity_id] : []))),
    );

    const { data: activitiesData, error: activitiesError } = await client
      .from(ACTIVITIES_TABLE)
      .select('id, title, author_id, published_revision_id')
      .in('id', activityIds);

    if (activitiesError || !Array.isArray(activitiesData)) {
      if (activitiesError) console.error('[activities/moderation] activities read failed:', activitiesError.message);
      return [];
    }

    const activityById = new Map(
      (activitiesData as unknown as Array<Record<string, unknown>>).flatMap((row) =>
        typeof row.id === 'string' ? [[row.id, row] as const] : [],
      ),
    );

    const publishedRevisionIds = Array.from(activityById.values()).flatMap((row) =>
      typeof row.published_revision_id === 'string' ? [row.published_revision_id] : [],
    );

    const publishedBlocksById = await loadRevisionBlocks(client, publishedRevisionIds);

    const authorIds = revisionRows.flatMap((r) => (typeof r.created_by === 'string' ? [r.created_by] : []));
    const authors = await resolveAuthors(client, authorIds);

    return revisionRows.flatMap((row): ReviewQueueItem[] => {
      const revisionId = row.id;
      const activityId = row.activity_id;
      const createdBy = row.created_by;
      if (typeof revisionId !== 'string' || typeof activityId !== 'string' || typeof createdBy !== 'string') {
        return [];
      }
      const activity = activityById.get(activityId);
      if (!activity || typeof activity.title !== 'string') return [];

      const blocks = parseBlocks(row.blocks, 'draft');
      if (!blocks) return [];

      const publishedRevisionId = activity.published_revision_id;
      const publishedBlocks =
        typeof publishedRevisionId === 'string' ? (publishedBlocksById.get(publishedRevisionId) ?? null) : null;

      return [
        {
          revisionId,
          activityId,
          activityTitle: activity.title,
          author: authors.get(createdBy) ?? { id: createdBy, email: null },
          submittedAt: typeof row.rights_accepted_at === 'string' ? row.rights_accepted_at : null,
          isEdit: typeof publishedRevisionId === 'string',
          blocks,
          publishedBlocks,
        },
      ];
    });
  } catch (err) {
    console.error('[activities/moderation] loadPendingRevisions threw:', err);
    return [];
  }
}

async function loadRevisionBlocks(client: SupabaseClient, revisionIds: string[]): Promise<Map<string, Block[]>> {
  const result = new Map<string, Block[]>();
  if (revisionIds.length === 0) return result;

  const { data, error } = await client.from(ACTIVITY_REVISIONS_TABLE).select('id, blocks').in('id', revisionIds);
  if (error || !Array.isArray(data)) {
    if (error) console.error('[activities/moderation] loadRevisionBlocks failed:', error.message);
    return result;
  }
  for (const raw of data as unknown as Array<Record<string, unknown>>) {
    if (typeof raw.id !== 'string') continue;
    const blocks = parseBlocks(raw.blocks, 'draft');
    if (blocks) result.set(raw.id, blocks);
  }
  return result;
}

async function loadReportedActivities(client: SupabaseClient): Promise<ReportedActivityItem[]> {
  try {
    // See file header (moved to `record_activity_report`'s own migration
    // comment too): a live activity that a report just hid is the ONLY way
    // `status = 'pending_review'` and `published_revision_id is not null`
    // co-occur — submitting an edit of a live activity never changes the
    // activity's own status, and a rejection never does either while it is
    // live. That pair is this tab's whole selector.
    const { data, error } = await client
      .from(ACTIVITIES_TABLE)
      .select('id, title, author_id')
      .eq('status', 'pending_review')
      .not('published_revision_id', 'is', null);

    if (error || !Array.isArray(data) || data.length === 0) {
      if (error) console.error('[activities/moderation] reported activities read failed:', error.message);
      return [];
    }

    const rows = data as unknown as Array<Record<string, unknown>>;
    const activityIds = rows.flatMap((r) => (typeof r.id === 'string' ? [r.id] : []));

    const { data: reportsData, error: reportsError } = await client
      .from(ACTIVITY_REPORTS_TABLE)
      .select('id, activity_id, reporter_id, reason, details, created_at')
      .in('activity_id', activityIds)
      .order('created_at', { ascending: true });

    if (reportsError) {
      console.error('[activities/moderation] reports read failed:', reportsError.message);
    }

    const reportsByActivity = new Map<string, ActivityReport[]>();
    if (Array.isArray(reportsData)) {
      for (const raw of reportsData as unknown as Array<Record<string, unknown>>) {
        const activityId = raw.activity_id;
        if (typeof activityId !== 'string') continue;
        if (typeof raw.id !== 'string' || typeof raw.reporter_id !== 'string') continue;
        if (!isReportReason(raw.reason)) continue;
        if (typeof raw.created_at !== 'string') continue;
        const list = reportsByActivity.get(activityId) ?? [];
        list.push({
          id: raw.id,
          reporterId: raw.reporter_id,
          reason: raw.reason,
          details: typeof raw.details === 'string' ? raw.details : null,
          createdAt: raw.created_at,
        });
        reportsByActivity.set(activityId, list);
      }
    }

    const authorIds = rows.flatMap((r) => (typeof r.author_id === 'string' ? [r.author_id] : []));
    const authors = await resolveAuthors(client, authorIds);

    return rows.flatMap((row): ReportedActivityItem[] => {
      const id = row.id;
      const authorId = row.author_id;
      if (typeof id !== 'string' || typeof row.title !== 'string' || typeof authorId !== 'string') return [];
      return [
        {
          activityId: id,
          activityTitle: row.title,
          author: authors.get(authorId) ?? { id: authorId, email: null },
          reports: reportsByActivity.get(id) ?? [],
        },
      ];
    });
  } catch (err) {
    console.error('[activities/moderation] loadReportedActivities threw:', err);
    return [];
  }
}

export type ApproveError =
  | 'not_found'
  | 'not_pending'
  | 'invalid_blocks'
  | 'foreign_upload'
  | 'copy_failed'
  | 'approve_failed';

export type ApproveResult = { ok: true } | { ok: false; error: ApproveError };

/** Every worksheet image in `blocks`, in order. */
function worksheetImagePaths(blocks: Block[]): string[] {
  return blocks.flatMap((block) => (block.type === 'worksheet' ? [block.image.path] : []));
}

/**
 * Rewrite every worksheet image's path via `mapping`, rebuilding each block
 * field by field — never spread — same posture as `blocks.ts`'s own parse
 * functions: an unknown key cannot survive this boundary either.
 */
function rewriteImagePaths(blocks: Block[], mapping: ReadonlyMap<string, string>): Block[] {
  return blocks.map((block) => {
    if (block.type !== 'worksheet') return block;
    const newPath = mapping.get(block.image.path) ?? block.image.path;
    return { ...block, image: { ...block.image, path: newPath } };
  });
}

/**
 * `POST /api/admin/actividades/[revisionId]/aprobar`'s whole write path:
 *
 * ```
 * 1. no row at revisionId                          -> not_found
 * 2. revision.status !== 'pending_review'           -> not_pending
 * 3. parseBlocks(revision.blocks, 'submit') === null -> invalid_blocks
 *    (the endpoint STRICTLY re-validates — never
 *    trusts whatever passed the author's own
 *    'draft'-mode save)
 * 4. any worksheet image under activity-uploads/…    -> foreign_upload
 *    NOT owned by the revision's own author
 *    (`activity_revisions.created_by`)
 * 5. a storage copy fails for any referenced image   -> copy_failed
 *    (COPY BEFORE the RPC — see storage.ts's header:
 *    a partial copy here is a harmless orphan, no
 *    activity references it yet)
 * 6. the approve_activity_revision RPC fails         -> approve_failed
 * 7. success                                         -> ok: true
 * ```
 */
export async function approveRevision(revisionId: string, reviewerId: string): Promise<ApproveResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'approve_failed' };

  try {
    const { data, error } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .select('id, activity_id, blocks, status, created_by')
      .eq('id', revisionId)
      .maybeSingle();

    if (error) {
      console.error('[activities/moderation] approveRevision fetch failed:', error.message);
      return { ok: false, error: 'approve_failed' };
    }
    if (!data) return { ok: false, error: 'not_found' };

    const row = data as unknown as Record<string, unknown>;
    if (row.status !== 'pending_review') return { ok: false, error: 'not_pending' };
    if (typeof row.activity_id !== 'string' || typeof row.created_by !== 'string') {
      return { ok: false, error: 'not_found' };
    }
    const activityId = row.activity_id;
    const authorId = row.created_by;

    const blocks = parseBlocks(row.blocks, 'submit');
    if (!blocks) return { ok: false, error: 'invalid_blocks' };

    // Every worksheet image must be either already-public (a prior
    // approval's own copy, reused unchanged by this edit) or an upload
    // owned by THIS revision's own author — never a path guessed into
    // another user's private uploads folder. See file header, mandatory
    // security test.
    const imagePaths = worksheetImagePaths(blocks);
    const pathMapping = new Map<string, string>();
    for (const path of imagePaths) {
      const parsed = parseImagePath(path);
      if (!parsed) return { ok: false, error: 'invalid_blocks' };
      if (parsed.bucket !== UPLOADS_BUCKET) continue; // already public, left as-is
      if (parsed.ownerId !== authorId.toLowerCase()) return { ok: false, error: 'foreign_upload' };
      if (!pathMapping.has(path)) {
        pathMapping.set(path, approvedImagePath(activityId, parsed.objectId));
      }
    }

    for (const [fromPath, toPath] of pathMapping) {
      const copied = await copyToImagesBucket(fromPath, toPath);
      if (!copied) return { ok: false, error: 'copy_failed' };
    }

    const rewrittenBlocks = rewriteImagePaths(blocks, pathMapping);
    const blockTypes = Array.from(new Set(rewrittenBlocks.map((b) => b.type)));

    const { error: rpcError } = await client.rpc('approve_activity_revision', {
      p_revision: revisionId,
      p_reviewer: reviewerId,
      p_blocks: rewrittenBlocks,
      p_block_types: blockTypes,
      p_block_count: rewrittenBlocks.length,
    });

    if (rpcError) {
      console.error('[activities/moderation] approve_activity_revision RPC failed:', rpcError.message);
      return { ok: false, error: 'approve_failed' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[activities/moderation] approveRevision threw:', err);
    return { ok: false, error: 'approve_failed' };
  }
}

export type RejectError = 'not_found' | 'not_pending' | 'invalid_note' | 'reject_failed';
export type RejectResult = { ok: true } | { ok: false; error: RejectError };

/**
 * `POST /api/admin/actividades/[revisionId]/rechazar`'s whole write path.
 * Pre-fetches the revision (same check-then-write shape as `approveRevision`)
 * so the endpoint can tell `not_found` from `not_pending` apart — the RPC
 * itself re-checks both anyway (never trust a stale read for the write).
 */
export async function rejectRevision(revisionId: string, reviewerId: string, note: string): Promise<RejectResult> {
  const trimmed = note.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    return { ok: false, error: 'invalid_note' };
  }

  const client = getClient();
  if (!client) return { ok: false, error: 'reject_failed' };

  try {
    const { data, error } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .select('id, status')
      .eq('id', revisionId)
      .maybeSingle();

    if (error) {
      console.error('[activities/moderation] rejectRevision fetch failed:', error.message);
      return { ok: false, error: 'reject_failed' };
    }
    if (!data) return { ok: false, error: 'not_found' };

    const row = data as unknown as Record<string, unknown>;
    if (row.status !== 'pending_review') return { ok: false, error: 'not_pending' };

    const { error: rpcError } = await client.rpc('reject_activity_revision', {
      p_revision: revisionId,
      p_reviewer: reviewerId,
      p_note: trimmed,
    });

    if (rpcError) {
      console.error('[activities/moderation] reject_activity_revision RPC failed:', rpcError.message);
      return { ok: false, error: 'reject_failed' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[activities/moderation] rejectRevision threw:', err);
    return { ok: false, error: 'reject_failed' };
  }
}

export type RestoreError = 'not_found' | 'not_hidden' | 'restore_failed';
export type RestoreResult = { ok: true } | { ok: false; error: RestoreError };

/**
 * `POST /api/admin/actividades/[activityId]/restaurar` (`action: 'restore'`)
 * — a reported/hidden activity goes back to `live`. `reviewed_at = now()`
 * resets the report-count window (`record_activity_report`'s own migration
 * comment) — kept simple, a plain UPDATE, no SQL function needed.
 */
export async function restoreActivity(activityId: string, reviewerId: string): Promise<RestoreResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'restore_failed' };

  try {
    const eligible = await fetchHiddenActivity(client, activityId);
    if (eligible === 'not_found') return { ok: false, error: 'not_found' };
    if (eligible === 'not_hidden') return { ok: false, error: 'not_hidden' };

    const { error } = await client
      .from(ACTIVITIES_TABLE)
      .update({ status: 'live', reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', activityId)
      .eq('status', 'pending_review');

    if (error) {
      console.error('[activities/moderation] restoreActivity update failed:', error.message);
      return { ok: false, error: 'restore_failed' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[activities/moderation] restoreActivity threw:', err);
    return { ok: false, error: 'restore_failed' };
  }
}

export type RemoveError = 'not_found' | 'not_hidden' | 'remove_failed';
export type RemoveResult = { ok: true } | { ok: false; error: RemoveError };

/**
 * `POST /api/admin/actividades/[activityId]/restaurar` (`action: 'remove'`)
 * — a reported/hidden activity is taken down for good (`status = 'removed'`,
 * the same terminal state `eliminar.ts` uses for an author's own delete).
 */
export async function removeActivity(activityId: string, reviewerId: string): Promise<RemoveResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'remove_failed' };

  try {
    const eligible = await fetchHiddenActivity(client, activityId);
    if (eligible === 'not_found') return { ok: false, error: 'not_found' };
    if (eligible === 'not_hidden') return { ok: false, error: 'not_hidden' };

    const { error } = await client
      .from(ACTIVITIES_TABLE)
      .update({ status: 'removed', reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', activityId)
      .eq('status', 'pending_review');

    if (error) {
      console.error('[activities/moderation] removeActivity update failed:', error.message);
      return { ok: false, error: 'remove_failed' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[activities/moderation] removeActivity threw:', err);
    return { ok: false, error: 'remove_failed' };
  }
}

/** Shared eligibility check for restore/remove: must be hidden-by-reports (see file header's signature). */
async function fetchHiddenActivity(
  client: SupabaseClient,
  activityId: string,
): Promise<'ok' | 'not_found' | 'not_hidden'> {
  const { data, error } = await client
    .from(ACTIVITIES_TABLE)
    .select('id, status, published_revision_id')
    .eq('id', activityId)
    .maybeSingle();

  if (error) {
    console.error('[activities/moderation] fetchHiddenActivity failed:', error.message);
    return 'not_found';
  }
  if (!data) return 'not_found';

  const row = data as unknown as Record<string, unknown>;
  if (row.status !== 'pending_review' || typeof row.published_revision_id !== 'string') {
    return 'not_hidden';
  }
  return 'ok';
}

export type ReportError = 'not_found' | 'self_report' | 'invalid_reason' | 'invalid_details' | 'report_failed';
export type ReportResult = { ok: true; hidden: boolean } | { ok: false; error: ReportError };

/**
 * `POST /api/actividades/[id]/reportar` — any signed-in visitor except the
 * author, reporting a LIVE activity. See `record_activity_report`'s own
 * migration comment for the atomic insert + threshold check this wraps.
 */
export async function recordReport(
  activityId: string,
  reporterId: string,
  reason: unknown,
  details: unknown,
): Promise<ReportResult> {
  if (!isReportReason(reason)) return { ok: false, error: 'invalid_reason' };
  const trimmedDetails = typeof details === 'string' ? details.trim() : '';
  if (trimmedDetails.length > 500) return { ok: false, error: 'invalid_details' };

  const client = getClient();
  if (!client) return { ok: false, error: 'report_failed' };

  try {
    const { data, error } = await client
      .from(ACTIVITIES_TABLE)
      .select('id, author_id')
      .eq('id', activityId)
      .eq('visible', true)
      .maybeSingle();

    if (error) {
      console.error('[activities/moderation] recordReport fetch failed:', error.message);
      return { ok: false, error: 'report_failed' };
    }
    if (!data) return { ok: false, error: 'not_found' };

    const row = data as unknown as Record<string, unknown>;
    if (row.author_id === reporterId) return { ok: false, error: 'self_report' };

    const { data: hiddenData, error: rpcError } = await client.rpc('record_activity_report', {
      p_activity: activityId,
      p_reporter: reporterId,
      p_reason: reason,
      p_details: trimmedDetails.length > 0 ? trimmedDetails : null,
    });

    if (rpcError) {
      console.error('[activities/moderation] record_activity_report RPC failed:', rpcError.message);
      return { ok: false, error: 'report_failed' };
    }

    return { ok: true, hidden: hiddenData === true };
  } catch (err) {
    console.error('[activities/moderation] recordReport threw:', err);
    return { ok: false, error: 'report_failed' };
  }
}
