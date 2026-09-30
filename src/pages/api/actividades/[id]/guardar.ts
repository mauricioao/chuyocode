/**
 * `POST /api/actividades/[id]/guardar` — the activities author save flow
 * (PR B, "Activities creator"). No status transition happens here (submit
 * for review / publish are a later PR) — every call either updates the
 * activity's own metadata and its latest DRAFT revision in place, or opens a
 * fresh draft revision when the latest one is not a draft (submitted,
 * approved, rejected, or superseded):
 *
 * ```
 * 1. locals.user null                          -> 401
 * 2. malformed id                              -> 404
 * 3. no row at (id, author_id=caller)           -> 404 (never 403 — see below)
 * 4. bad JSON / wrong shape                    -> 400
 * 5. title not 1..120 chars (trimmed)          -> 422 { error: 'invalid_title' }
 * 6. level neither null nor a CEFR code        -> 422 { error: 'invalid_level' }
 * 7. parseBlocks(blocks, 'draft') === null     -> 422 { error: 'invalid_blocks' }
 *    (TOLERANT — creator polish round 3: a save is not a publish. A zone
 *    with no answer yet, a choice zone with < 2 options, or a worksheet with
 *    0 zones are all normal mid-drafting states and MUST autosave without
 *    error; `enviar.ts` alone enforces submit-completeness. Safety/integrity
 *    checks — ids, types, coordinates, the block/zone limits, image paths,
 *    name length, rotation — still apply exactly as before; see
 *    `blocks.ts`'s own `BlocksParseMode` doc.)
 * 8. a worksheet image.path is neither the      -> 422 { error: 'invalid_image_path' }
 *    caller's own upload path NOR an
 *    `activity-images/<thisId>/…` path
 * 9. latest revision status === 'draft'        -> UPDATE it in place
 *    else                                      -> INSERT a fresh draft revision
 * 10. update activities.title/level/updated_at
 * 11. any DB failure                           -> 500 { error: 'save_failed' }
 * 12. success                                  -> 200 { ok: true }
 * ```
 *
 * 🔴 404 FOR BOTH "DOES NOT EXIST" AND "EXISTS BUT ISN'T YOURS", DELIBERATELY
 * — unlike `/api/ejercicios/[id]/guardar` (which 403s a non-owner because
 * that row's existence is not a secret: exercise ids are never treated as
 * sensitive elsewhere). An activity id IS: `getActivityForEdit` and this
 * endpoint's own fetch both filter by `(id, author_id)` in the query itself,
 * so a stranger's activity id can never be confirmed to exist by probing
 * this endpoint — same posture as `getExerciseForEdit`'s header and this
 * PR's `imagen.ts` GET.
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { isLevel, type Level } from '@lib/exerciseTaxonomy';
import { parseBlocks, type Block } from '@lib/activities/blocks';
import { isOwnUploadPath, isUuid, parseImagePath, IMAGES_BUCKET } from '@lib/activities/paths';
import { createServiceClient } from '@lib/supabase';

const ACTIVITIES_TABLE = 'activities';
const ACTIVITY_REVISIONS_TABLE = 'activity_revisions';

interface SaveResponse {
  ok?: boolean;
  error?: string;
}

function json(body: SaveResponse, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
}

interface SaveInput {
  title: unknown;
  level: unknown;
  blocks: unknown;
}

function isSaveInput(value: unknown): value is SaveInput {
  if (typeof value !== 'object' || value === null) return false;
  return 'title' in value && 'level' in value && 'blocks' in value;
}

/** Is `path` a worksheet image this activity's save may legally reference? */
function isAllowedImagePath(path: string, userId: string, activityId: string): boolean {
  if (isOwnUploadPath(path, userId)) return true;
  const parsed = parseImagePath(path);
  return parsed !== null && parsed.bucket === IMAGES_BUCKET && parsed.ownerId === activityId.toLowerCase();
}

function everyImageAllowed(blocks: Block[], userId: string, activityId: string): boolean {
  return blocks.every((block) => {
    // A block with no image yet (the editor's own empty-state block —
    // `blocks.ts`'s `parseWorksheetBlock`, `'draft'` mode only) has nothing
    // to check.
    if (block.type !== 'worksheet' || !block.image) return true;
    return isAllowedImagePath(block.image.path, userId, activityId);
  });
}

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

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) {
    return notFound();
  }

  const client = getClient();
  if (!client) {
    return json({ error: 'save_unavailable' }, 503);
  }

  // Ownership enforced IN THE QUERY — see file header for why this 404s
  // rather than 403ing a non-owner.
  const { data: activityData, error: activityError } = await client
    .from(ACTIVITIES_TABLE)
    .select('id')
    .eq('id', id)
    .eq('author_id', user.id)
    .neq('status', 'removed')
    .maybeSingle();

  if (activityError) {
    console.error('[guardar] activity fetch failed:', activityError.message);
    return json({ error: 'save_failed' }, 500);
  }
  if (!activityData) {
    return notFound();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!isSaveInput(body)) {
    return json({ error: 'bad_request' }, 400);
  }

  if (typeof body.title !== 'string') {
    return json({ error: 'invalid_title' }, 422);
  }
  const title = body.title.trim();
  if (title.length < 1 || title.length > 120) {
    return json({ error: 'invalid_title' }, 422);
  }

  let level: Level | null;
  if (body.level === null) {
    level = null;
  } else if (isLevel(body.level)) {
    level = body.level;
  } else {
    return json({ error: 'invalid_level' }, 422);
  }

  const blocks = parseBlocks(body.blocks, 'draft');
  if (!blocks) {
    return json({ error: 'invalid_blocks' }, 422);
  }

  if (!everyImageAllowed(blocks, user.id, id)) {
    return json({ error: 'invalid_image_path' }, 422);
  }

  const { data: revisionData, error: revisionFetchError } = await client
    .from(ACTIVITY_REVISIONS_TABLE)
    .select('id, status')
    .eq('activity_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (revisionFetchError) {
    console.error('[guardar] revision fetch failed:', revisionFetchError.message);
    return json({ error: 'save_failed' }, 500);
  }

  const latestRevision = revisionData as unknown as { id: string; status: string } | null;

  if (latestRevision && latestRevision.status === 'draft') {
    const { error: updateRevisionError } = await client
      .from(ACTIVITY_REVISIONS_TABLE)
      .update({ blocks })
      .eq('id', latestRevision.id);
    if (updateRevisionError) {
      console.error('[guardar] revision update failed:', updateRevisionError.message);
      return json({ error: 'save_failed' }, 500);
    }
  } else {
    const { error: insertRevisionError } = await client.from(ACTIVITY_REVISIONS_TABLE).insert({
      activity_id: id,
      blocks,
      created_by: user.id,
      status: 'draft',
    });
    if (insertRevisionError) {
      console.error('[guardar] revision insert failed:', insertRevisionError.message);
      return json({ error: 'save_failed' }, 500);
    }
  }

  const { error: updateActivityError } = await client
    .from(ACTIVITIES_TABLE)
    .update({ title, level, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', user.id);

  if (updateActivityError) {
    console.error('[guardar] activity update failed:', updateActivityError.message);
    return json({ error: 'save_failed' }, 500);
  }

  return json({ ok: true }, 200);
};
