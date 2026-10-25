/**
 * `POST /api/actividades/[id]/descartar` — offer to discard a draft
 * activity that never got any real content (T4, "offer to discard": the
 * owner's own report — picking a mold on `/crear` always creates a real row
 * in "Mis actividades" even when the author leaves without touching it).
 * Built on `eliminar.ts`'s own skeleton — this IS a soft delete, same
 * `status = 'removed'` outcome — with extra guards on top, since this one is
 * offered PROACTIVELY by the window's own close flow rather than asked for
 * explicitly:
 *
 * ```
 * 1. locals.user null                                  -> 401
 * 2. malformed id                                       -> 404
 * 3. no service client (SUPABASE_SERVICE_ROLE_KEY unset) -> 503 { error: 'discard_unavailable' }
 * 4. activity select fails (DB error)                    -> 500 { error: 'discard_failed' }
 * 5. no row at (id, author_id=caller, status='draft')   -> 404 (never 403 —
 *    see `guardar.ts`'s header; also 404 for a live/pending/rejected/
 *    already-removed activity, which may never be discarded this way)
 * 6. revision select fails (DB error)                    -> 500 { error: 'discard_failed' }
 * 7. latest revision's blocks fail to parse, OR          -> 409 { error: 'has_content' }
 *    `hasContent(blocks)` is true
 * 8. discard_empty_draft RPC returns 'removed'           -> 200 { ok: true }
 *    RPC returns 'changed'                               -> 409 { error: 'concurrent_change' }
 *    RPC returns 'not_found'                              -> 404
 *    RPC errors with any OTHER code, or returns an        -> 500 { error: 'discard_failed' }
 *    unrecognized value
 *    RPC errors with 'PGRST202'/'42883' (the function      -> falls back to the
 *    itself is missing — migration 0023 not applied yet)   legacy optimistic
 *                                                           UPDATE path below
 * ```
 *
 * ATOMIC CHECK-AND-FLIP (`supabase/migrations/0023_discard_empty_draft.sql`):
 * the RPC receives the RAW (unparsed, exactly as stored) latest revision's
 * own id AND blocks — the same values this endpoint already read in step 6
 * to classify content — and re-checks them against whatever is ACTUALLY the
 * latest revision at that instant, under a row lock held for its whole
 * transaction. Either the revision id or its exact blocks having drifted
 * means a concurrent `POST .../guardar` (a second tab) committed something
 * since this endpoint's own reads, so the RPC refuses rather than trusting a
 * classification that may no longer hold — closing the gap a plain
 * read-then-write pair across two round trips cannot close (there is no way
 * to hold a lock between them from application code), and leaving
 * `guardar.ts`'s own final write to refuse a row this discard already
 * removed (that file's own `.neq('status', 'removed')` guard).
 * Remaining edge: that guard covers guardar's LAST write only, so a
 * revision write racing a successful discard can still land on the now
 * removed row. The author still gets a 404, and nothing is lost:
 * `removed` is a soft delete.
 *
 * MIGRATION-ROLLOUT FALLBACK: while `discard_empty_draft` has not been
 * created yet in a given environment (migration 0023 not yet run), Supabase
 * reports it missing via `PGRST202` (PostgREST: no matching function in the
 * schema cache) or `42883` (Postgres: undefined function) — either one falls
 * back to the PREVIOUS optimistic-`UPDATE`-with-`updated_at`-filter path
 * (`legacyDiscard` below), so an environment mid-rollout keeps discarding
 * correctly, just without the stronger atomic guarantee, until the migration
 * runs.
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { parseBlocks } from '@lib/activities/blocks';
import { hasContent } from '@lib/activities/draftContent';
import { isUuid } from '@lib/activities/paths';
import { createServiceClient } from '@lib/supabase';

/**
 * Supabase's own "the RPC function does not exist" error codes — PostgREST's
 * schema-cache miss (`PGRST202`) and Postgres' own undefined-function error
 * (`42883`, reachable if the schema cache were somehow stale in the other
 * direction). Either one means migration 0023 has not run yet in this
 * environment, never a real failure of the discard itself.
 */
const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

const ACTIVITIES_TABLE = 'activities';
const ACTIVITY_REVISIONS_TABLE = 'activity_revisions';

let serviceClient: ReturnType<typeof createServiceClient> | null = null;
function getClient(): ReturnType<typeof createServiceClient> | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

/**
 * The PREVIOUS optimistic-concurrency path (`updated_at`-filtered UPDATE,
 * requesting its affected rows back via `.select('id')` — Supabase only
 * returns written rows when a `.select()` is chained onto the mutation) —
 * kept as the fallback for an environment where migration 0023 has not run
 * yet (see this file's own header, `RPC_MISSING_CODES`). A concurrent
 * `guardar` committing a revision between the earlier reads and this UPDATE
 * bumps `updated_at`, so this filter then misses the row and zero rows come
 * back, instead of silently removing one that now has real content.
 */
async function legacyDiscard(
  client: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  expectedUpdatedAt: string,
): Promise<Response> {
  const { data: updatedRows, error: updateError } = await client
    .from(ACTIVITIES_TABLE)
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', userId)
    .eq('status', 'draft')
    .eq('updated_at', expectedUpdatedAt)
    .select('id');

  if (updateError) {
    console.error('[descartar] legacy update failed:', updateError.message);
    return jsonResponse({ error: 'discard_failed' }, 500);
  }
  if (!updatedRows || updatedRows.length === 0) {
    return jsonResponse({ error: 'concurrent_change' }, 409);
  }

  return jsonResponse({ ok: true }, 200);
}

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) {
    return notFoundResponse();
  }

  const client = getClient();
  if (!client) {
    return jsonResponse({ error: 'discard_unavailable' }, 503);
  }

  // Ownership AND draft status enforced IN THE QUERY — same 404-for-both
  // posture as `eliminar.ts`/`guardar.ts`, extended with `status='draft'` so
  // a live/pending/rejected/already-removed activity 404s here exactly like
  // a stranger's activity does.
  const { data: activityData, error: activityError } = await client
    .from(ACTIVITIES_TABLE)
    .select('id, updated_at')
    .eq('id', id)
    .eq('author_id', user.id)
    .eq('status', 'draft')
    .maybeSingle();

  if (activityError) {
    console.error('[descartar] activity fetch failed:', activityError.message);
    return jsonResponse({ error: 'discard_failed' }, 500);
  }
  if (!activityData) {
    return notFoundResponse();
  }
  // The optimistic-concurrency token the final UPDATE below filters on.
  const activity = activityData as unknown as { id: string; updated_at: string };

  const { data: revisionData, error: revisionFetchError } = await client
    .from(ACTIVITY_REVISIONS_TABLE)
    .select('id, blocks')
    .eq('activity_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (revisionFetchError) {
    console.error('[descartar] revision fetch failed:', revisionFetchError.message);
    return jsonResponse({ error: 'discard_failed' }, 500);
  }

  // Same `'draft'`-tolerant parse `guardar.ts` itself saves under — this
  // never rejects a normal mid-drafting shape, only a genuinely malformed
  // one. Unparseable is treated exactly like "has content": either way,
  // silently discarding it would be the wrong call. No revision row at all
  // (should not happen — every activity gets one on creation) degrades to
  // "nothing to lose", same as an empty blocks array.
  const latestRevision = revisionData as unknown as { id: string; blocks: unknown } | null;
  const parsedBlocks = latestRevision ? parseBlocks(latestRevision.blocks, 'draft') : [];
  if (!parsedBlocks || hasContent(parsedBlocks)) {
    return jsonResponse({ error: 'has_content' }, 409);
  }

  // ATOMIC CHECK-AND-FLIP (this file's own header): the RPC receives the
  // RAW (unparsed) latest revision — exactly what is actually stored, not
  // `parsedBlocks` above — so its own re-check compares byte-for-byte
  // against what a concurrent `guardar` may have just written.
  const { data: rpcResult, error: rpcError } = await client.rpc('discard_empty_draft', {
    p_activity: id,
    p_author: user.id,
    p_expected_revision: latestRevision?.id ?? null,
    p_expected_blocks: latestRevision?.blocks ?? null,
  });

  if (rpcError) {
    const code = (rpcError as { code?: string }).code;
    if (code && RPC_MISSING_CODES.has(code)) {
      console.warn(
        '[descartar] discard_empty_draft RPC is missing (migration 0023 not applied yet) — falling back to the optimistic UPDATE path',
      );
      return legacyDiscard(client, id, user.id, activity.updated_at);
    }
    console.error('[descartar] discard_empty_draft RPC failed:', rpcError.message);
    return jsonResponse({ error: 'discard_failed' }, 500);
  }

  switch (rpcResult) {
    case 'removed':
      return jsonResponse({ ok: true }, 200);
    case 'changed':
      return jsonResponse({ error: 'concurrent_change' }, 409);
    case 'not_found':
      return notFoundResponse();
    default:
      console.error('[descartar] discard_empty_draft RPC returned an unexpected value:', rpcResult);
      return jsonResponse({ error: 'discard_failed' }, 500);
  }
};
