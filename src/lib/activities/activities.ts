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
import {
  normalizeSearchQuery,
  buildTitleIlikePattern,
  type SortOrder,
  type BlockTypeFilter,
} from './discoveryQuery';

/** DB table names — must match `supabase/migrations/0011_activities.sql`. */
export const ACTIVITIES_TABLE = 'activities';
export const ACTIVITY_REVISIONS_TABLE = 'activity_revisions';
/** `supabase/migrations/0012_activity_views.sql` — read here only for the `novistas` filter below. */
export const ACTIVITY_VIEWS_TABLE = 'activity_views';

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

    // 'draft' mode (creator polish round 3): the latest revision may be an
    // in-progress draft with an incomplete zone (no answer yet, a choice
    // zone with < 2 options) — `guardar.ts` now happily saves exactly that,
    // so the editor must be able to reopen it too, not just write it. See
    // `blocks.ts`'s own `BlocksParseMode` doc.
    const blocks = parseBlocks(revisionRow.blocks, 'draft');
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

/** One activity as the author's own workspace (`/[lang]/mis-actividades`, PR D) needs it. */
export interface AuthoredActivity {
  id: string;
  title: string;
  level: Level | null;
  status: string;
  blockCount: number;
  reviewNote: string | null;
  /**
   * True only when `status === 'live'` AND a fresher `pending_review`
   * revision already exists — the published revision keeps serving while
   * that edit awaits a moderator (0011 migration's own lifecycle rule). A
   * `draft`/`pending_review`/`rejected` activity is never flagged here: its
   * OWN status badge already says everything this flag would add.
   */
  hasPendingRevision: boolean;
  updatedAt: string | null;
}

/**
 * Fetch every activity `authorId` owns, newest updated first — their own
 * workspace listing. `removed` is excluded (see file header); nothing else
 * is, unlike {@link getActivityForEdit} which serves exactly one row: an
 * author must see every draft/pending/live/rejected activity they have.
 *
 * FAIL-SAFE: `[]` on any failure, same posture as `getExercisesByAuthor`.
 */
export async function getActivitiesByAuthor(authorId: string): Promise<AuthoredActivity[]> {
  if (authorId.length === 0) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(ACTIVITIES_TABLE)
      .select('id, title, level, status, review_note, block_count, updated_at')
      .eq('author_id', authorId)
      .neq('status', REMOVED_STATUS)
      // Most recently edited first; `id` breaks ties so the order is total.
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true });

    if (error) {
      console.error('[activities] getActivitiesByAuthor failed:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];

    const rows = data.flatMap((raw): AuthoredActivity[] => {
      const row = raw as unknown as Record<string, unknown>;
      if (typeof row.id !== 'string' || row.id.length === 0) return [];
      if (typeof row.title !== 'string') return [];
      if (typeof row.status !== 'string') return [];

      return [
        {
          id: row.id,
          title: row.title,
          level: isLevel(row.level) ? row.level : null,
          status: row.status,
          blockCount: typeof row.block_count === 'number' ? row.block_count : 0,
          reviewNote: typeof row.review_note === 'string' ? row.review_note : null,
          hasPendingRevision: false,
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
        },
      ];
    });

    // A second, narrow read: only for the LIVE activities, is there a
    // fresher pending_review revision already? One query for the whole
    // page rather than one per row.
    const liveIds = rows.filter((row) => row.status === 'live').map((row) => row.id);
    if (liveIds.length === 0) return rows;

    const { data: pendingData, error: pendingError } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .select('activity_id')
      .eq('status', 'pending_review')
      .in('activity_id', liveIds);

    if (pendingError) {
      console.error('[activities] getActivitiesByAuthor pending-revision check failed:', pendingError.message);
      return rows;
    }
    if (!Array.isArray(pendingData)) return rows;

    const pendingIds = new Set(
      pendingData.flatMap((raw): string[] => {
        const id = (raw as unknown as Record<string, unknown>).activity_id;
        return typeof id === 'string' ? [id] : [];
      }),
    );
    if (pendingIds.size === 0) return rows;

    return rows.map((row) => (pendingIds.has(row.id) ? { ...row, hasPendingRevision: true } : row));
  } catch (err) {
    console.error('[activities] getActivitiesByAuthor threw:', err);
    return [];
  }
}

/** One live activity as the public "Actividades de la comunidad" feed card needs it. */
export interface PublishedActivityCard {
  id: string;
  title: string;
  level: Level | null;
  blockCount: number;
  publishedAt: string | null;
  /**
   * The first worksheet block's stored image path (bucket-prefixed, always
   * under the PUBLIC `activity-images` bucket for a published revision), or
   * `null` when the published revision has no worksheet block. Callers
   * resolve this to a URL with `publicImageUrl` (`@lib/activities/storage`)
   * — kept as a bare path here, the same separation `blocks.ts`/`paths.ts`
   * already draw between content and storage I/O.
   */
  thumbnailPath: string | null;
  /** Denormalized "gustadas" counter (`0014_activity_discovery.sql`). */
  heartCount: number;
  /** Denormalized "vistas" counter (`0014_activity_discovery.sql`). */
  viewTotal: number;
  /** Has the requesting viewer already opened this activity's practice page? `false` when there is no viewer. */
  viewedByViewer: boolean;
}

export interface PublishedActivitiesPage {
  activities: PublishedActivityCard[];
  total: number;
}

/** Cards per page — also the range width `getPublishedActivities` requests. */
export const ACTIVITIES_PAGE_SIZE = 20;

export interface GetPublishedActivitiesOptions {
  level: Level | null;
  page: number;
  /** Raw `?q=` — normalized/escaped here, never trusted as-is. */
  q?: string | null;
  /** `?tipo=` — filters on `block_types` (the GIN index from 0011). */
  tipo?: BlockTypeFilter | null;
  /** `?orden=` — defaults to `recientes`. */
  orden?: SortOrder;
  /** `?novistas=1` — excludes activities `viewerId` has already opened. No-op without a `viewerId`. */
  novistas?: boolean;
  /** The signed-in caller, for `novistas` and each card's `viewedByViewer`. `null` for an anonymous read. */
  viewerId?: string | null;
}

/**
 * Fetch one page of the public feed: `visible` (live) activities only,
 * narrowed by `level`/`tipo`/`q`/`novistas` and ordered by `orden`
 * (`recientes`/`gustadas`/`vistas` — see `discoveryQuery.ts` and the
 * matching partial indexes in `0014_activity_discovery.sql`).
 *
 * NO AUTHOR NAME on the card, deliberately: this codebase has no cheap way
 * to resolve an arbitrary author's display name (`src/lib/profile.ts`'s own
 * lookup is scoped to the CALLER's session, not a stranger's id), and the
 * task's own contract allows omitting it rather than adding an expensive
 * per-row lookup for a "nice to have".
 *
 * `novistas` is applied IN SQL, not by fetching every activity and filtering
 * in JavaScript: a first, narrow read gets the caller's own already-viewed
 * activity ids (one indexed `activity_views` lookup, bounded by how many
 * activities `viewerId` has actually opened), and the MAIN query then
 * excludes exactly those ids with `not(id, in, …)` — the filtering itself
 * still happens at the database, this only supplies the id list Postgrest
 * cannot correlate as a subquery on its own.
 *
 * TWO MORE narrow reads, each `.in(...)` over just this page's rows (never
 * N+1): the PUBLISHED revision's `blocks` for each card's thumbnail (same as
 * before `discoveryQuery` existed), and — only when `viewerId` is set —
 * whether the viewer has already seen each one, for the "Vista" badge.
 *
 * FAIL-SAFE: an empty page (`{ activities: [], total: 0 }`) on any failure,
 * same posture as every other read in this codebase — an outage must 404 or
 * render "nothing published", never 500 the page.
 */
export async function getPublishedActivities(opts: GetPublishedActivitiesOptions): Promise<PublishedActivitiesPage> {
  const client = getClient();
  if (!client) return { activities: [], total: 0 };

  const page = Number.isFinite(opts.page) && opts.page >= 1 ? Math.floor(opts.page) : 1;
  const offset = (page - 1) * ACTIVITIES_PAGE_SIZE;
  const orden: SortOrder = opts.orden ?? 'recientes';
  const normalizedQuery = normalizeSearchQuery(opts.q ?? null);

  try {
    let excludedIds: string[] = [];
    if (opts.novistas && opts.viewerId) {
      const { data: viewedData, error: viewedError } = await client
        .from(ACTIVITY_VIEWS_TABLE)
        .select('activity_id')
        .eq('user_id', opts.viewerId);

      if (viewedError) {
        console.error('[activities] getPublishedActivities novistas lookup failed:', viewedError.message);
        // Degrades to "no exclusion" rather than failing the whole page —
        // same posture as the thumbnail/viewed-lookup failures below.
      } else if (Array.isArray(viewedData)) {
        excludedIds = viewedData.flatMap((raw): string[] => {
          const id = (raw as unknown as Record<string, unknown>).activity_id;
          return typeof id === 'string' ? [id] : [];
        });
      }
    }

    let query = client
      .from(ACTIVITIES_TABLE)
      .select('id, title, level, block_count, published_at, published_revision_id, heart_count, view_total', {
        count: 'exact',
      })
      .eq('visible', true);
    if (opts.level) {
      query = query.eq('level', opts.level);
    }
    if (opts.tipo) {
      query = query.contains('block_types', [opts.tipo]);
    }
    if (normalizedQuery) {
      query = query.ilike('title', buildTitleIlikePattern(normalizedQuery));
    }
    if (excludedIds.length > 0) {
      query = query.not('id', 'in', `(${excludedIds.join(',')})`);
    }

    if (orden === 'gustadas') {
      query = query.order('heart_count', { ascending: false }).order('published_at', { ascending: false });
    } else if (orden === 'vistas') {
      query = query.order('view_total', { ascending: false }).order('published_at', { ascending: false });
    } else {
      query = query.order('published_at', { ascending: false });
    }
    // Total order in every case: `published_at` (or the sort column above)
    // is unique-enough in practice, but `id` breaks a tie deterministically
    // rather than leaving it to Postgres.
    const { data, error, count } = await query
      .order('id', { ascending: true })
      .range(offset, offset + ACTIVITIES_PAGE_SIZE - 1);

    if (error) {
      console.error('[activities] getPublishedActivities failed:', error.message);
      return { activities: [], total: 0 };
    }
    if (!Array.isArray(data)) return { activities: [], total: 0 };

    const rows = data.flatMap((raw): Array<{
      id: string;
      title: string;
      level: Level | null;
      blockCount: number;
      publishedAt: string | null;
      publishedRevisionId: string;
      heartCount: number;
      viewTotal: number;
    }> => {
      const row = raw as unknown as Record<string, unknown>;
      if (typeof row.id !== 'string' || row.id.length === 0) return [];
      if (typeof row.title !== 'string') return [];
      // `activities_live_has_revision` guarantees a non-null revision id for
      // any `visible` row — but this is still a boundary read, so it is
      // checked rather than assumed.
      if (typeof row.published_revision_id !== 'string' || row.published_revision_id.length === 0) {
        return [];
      }
      return [
        {
          id: row.id,
          title: row.title,
          level: isLevel(row.level) ? row.level : null,
          blockCount: typeof row.block_count === 'number' ? row.block_count : 0,
          publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
          publishedRevisionId: row.published_revision_id,
          heartCount: typeof row.heart_count === 'number' ? row.heart_count : 0,
          viewTotal: typeof row.view_total === 'number' ? row.view_total : 0,
        },
      ];
    });

    const total = typeof count === 'number' ? count : rows.length;
    if (rows.length === 0) return { activities: [], total };

    const viewedIds = new Set<string>();
    if (opts.viewerId) {
      const { data: pageViewsData, error: pageViewsError } = await client
        .from(ACTIVITY_VIEWS_TABLE)
        .select('activity_id')
        .eq('user_id', opts.viewerId)
        .in(
          'activity_id',
          rows.map((row) => row.id),
        );

      if (pageViewsError) {
        console.error('[activities] getPublishedActivities viewed-lookup failed:', pageViewsError.message);
        // Degrades to "no badge shown" — cosmetic, never worth failing the page.
      } else if (Array.isArray(pageViewsData)) {
        for (const raw of pageViewsData) {
          const id = (raw as unknown as Record<string, unknown>).activity_id;
          if (typeof id === 'string') viewedIds.add(id);
        }
      }
    }

    const revisionIds = rows.map((row) => row.publishedRevisionId);
    const thumbnailByRevision = new Map<string, string | null>();

    const { data: revisionsData, error: revisionsError } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .select('id, blocks')
      .in('id', revisionIds);

    if (revisionsError) {
      console.error('[activities] getPublishedActivities thumbnail read failed:', revisionsError.message);
      // Cards without thumbnails still render fine — this is a degraded
      // page, not a failed one.
    } else if (Array.isArray(revisionsData)) {
      for (const raw of revisionsData) {
        const revisionRow = raw as unknown as Record<string, unknown>;
        if (typeof revisionRow.id !== 'string') continue;
        const blocks = parseBlocks(revisionRow.blocks);
        const firstWorksheet = blocks?.find((block) => block.type === 'worksheet');
        thumbnailByRevision.set(revisionRow.id, firstWorksheet ? firstWorksheet.image.path : null);
      }
    }

    const activities: PublishedActivityCard[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      level: row.level,
      blockCount: row.blockCount,
      publishedAt: row.publishedAt,
      thumbnailPath: thumbnailByRevision.get(row.publishedRevisionId) ?? null,
      heartCount: row.heartCount,
      viewTotal: row.viewTotal,
      viewedByViewer: viewedIds.has(row.id),
    }));

    return { activities, total };
  } catch (err) {
    console.error('[activities] getPublishedActivities threw:', err);
    return { activities: [], total: 0 };
  }
}

/** One activity + its PUBLISHED revision, as the practice page needs it. */
export interface PublishedActivity {
  id: string;
  title: string;
  level: Level | null;
  blocks: Block[];
  /**
   * The activity's author (PR E, "Moderation"): the practice page uses it to
   * hide the "Reportar" button from the activity's own author — reporting
   * one's own activity is refused server-side too (`recordReport`'s own
   * header), this is only the UI-level courtesy of not offering it.
   */
  authorId: string;
  /** Denormalized "gustadas" counter (`0014_activity_discovery.sql`). */
  heartCount: number;
  /** Denormalized "vistas" counter (`0014_activity_discovery.sql`). */
  viewTotal: number;
}

/**
 * Fetch one LIVE activity and its published revision's blocks, in ONE round
 * trip — a Postgrest embedded select through `activities.published_revision_id`'s
 * own FK (`activities_published_revision_id_fkey`, named explicitly in
 * `0011_activities.sql` for exactly this: `activities` and
 * `activity_revisions` have TWO FKs between them — this one, and
 * `activity_revisions.activity_id` back the other way — so the relationship
 * must be named or Postgrest cannot tell which embed is meant).
 *
 * `visible = true` (i.e. `status = 'live'`) is the ONLY access rule: no
 * ownership check, because the practice page is public to any signed-in
 * visitor, not just the author — a non-live activity 404s for everyone,
 * author included (the editor's own preview covers that case instead; see
 * `WorksheetPlayer`'s creator-preview mode).
 *
 * FAIL-SAFE: `null` on any failure — same posture as `getActivityForEdit`.
 */
export async function getPublishedActivity(id: string): Promise<PublishedActivity | null> {
  if (id.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(ACTIVITIES_TABLE)
      .select(
        'id, title, level, author_id, heart_count, view_total, activity_revisions!activities_published_revision_id_fkey(blocks)',
      )
      .eq('id', id)
      .eq('visible', true)
      .maybeSingle();

    if (error) {
      console.error('[activities] getPublishedActivity failed:', error.message);
      return null;
    }
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    if (typeof row.title !== 'string') return null;
    if (typeof row.author_id !== 'string' || row.author_id.length === 0) return null;

    // A `belongs-to` embed (the FK lives on `activities`) comes back as a
    // single object, not an array — but this is still a boundary read, so
    // both shapes are tolerated defensively rather than assumed.
    const embedded = row.activity_revisions;
    const revision = Array.isArray(embedded) ? embedded[0] : embedded;
    if (typeof revision !== 'object' || revision === null) return null;

    const blocks = parseBlocks((revision as Record<string, unknown>).blocks);
    if (!blocks) {
      console.error('[activities] malformed published blocks for activity id:', id);
      return null;
    }

    return {
      id,
      title: row.title,
      level: isLevel(row.level) ? row.level : null,
      blocks,
      authorId: row.author_id,
      heartCount: typeof row.heart_count === 'number' ? row.heart_count : 0,
      viewTotal: typeof row.view_total === 'number' ? row.view_total : 0,
    };
  } catch (err) {
    console.error('[activities] getPublishedActivity threw:', err);
    return null;
  }
}
