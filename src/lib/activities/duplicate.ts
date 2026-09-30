/**
 * Server-only "Duplicar y adaptar" write path (D7) —
 * `supabase/migrations/0016_activity_provenance.sql`'s TypeScript half.
 *
 * `POST /api/actividades/[id]/duplicar` (any signed-in visitor, including the
 * original's own author) creates a BRAND-NEW activity, owned by the caller,
 * `draft`, seeded from the ORIGINAL's PUBLISHED revision — never the
 * original author's own pending drafts, which `getPublishedActivity`
 * (`./activities`) already guarantees by construction (it reads
 * `published_revision_id`, nothing else):
 *
 * ```
 * 1. no LIVE activity at originalId              -> not_found (404 — same
 *    collapse as `getPublishedActivity`'s own posture: "does not exist" and
 *    "exists but is not live" read identically)
 * 2. caller already made >= 20 duplicates today   -> daily_limit (429)
 *    (count: source_activity_id is not null and author_id = caller and
 *    created_at > now() - interval '1 day')
 * 3. copying every worksheet image into the        -> upload_limit (429)
 *    caller's own uploads folder would exceed
 *    the per-user 100-object cap (checked BEFORE
 *    any copy happens — never a partial duplicate)
 * 4. a storage copy fails for any referenced image -> copy_failed (500)
 * 5. the new activity/revision insert fails         -> create_failed (500)
 * 6. success                                        -> ok: true, id
 * ```
 *
 * EVERY WORKSHEET IMAGE IS RE-HOMED, never referenced in place: the
 * original's published blocks point at `activity-images/<originalId>/…`
 * (public, but owned by the ORIGINAL activity's own approval — not a path
 * this caller may reference from their own draft, same invariant
 * `guardar.ts`/`index.ts` already enforce on every save). Each unique image
 * is copied once, under a freshly minted id, into
 * `activity-uploads/<callerId>/<uuid>.webp` via {@link copyToUploadsBucket}
 * — so the duplicate becomes an ordinary draft the caller may freely edit,
 * submit, and have approved on its own, with no residual dependency on the
 * original's own storage objects.
 *
 * NEW IDS for every block and (worksheet) zone — the duplicate is a fresh
 * document, not an alias of the original's: two activities must never share
 * a block/zone id (nothing in this codebase relies on that today, but
 * `blocks.ts`'s own `parseBlocks` already treats duplicate ids as a
 * malformed list WITHIN one activity, and cross-activity id reuse is exactly
 * the kind of coincidence a future feature could trip on). A quiz block's
 * OWN internal slot/pool ids are left untouched — they are internal to that
 * one payload's own grading logic, not an identity shared with anything
 * else, mirroring `approveRevision`'s own posture of rewriting only what
 * actually needs rewriting.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { getPublishedActivity, createActivity } from './activities';
import type { Block, WorksheetBlock } from './blocks';
import {
  parseImagePath,
  uploadPath,
  copyToUploadsBucket,
  countUserUploads,
  MAX_UPLOADS_PER_USER,
} from './storage';

const ACTIVITIES_TABLE = 'activities';

/** "max 20 duplicates per user per day" (task contract). */
export const MAX_DUPLICATES_PER_DAY = 20;

/** `activities.title` is capped at 120 chars (0011 migration's own check constraint). */
const MAX_TITLE_LENGTH = 120;
const COPY_SUFFIX = ' (copia)';

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
export function clearDuplicateClient(): void {
  serviceClient = null;
}

export type DuplicateError = 'not_found' | 'daily_limit' | 'upload_limit' | 'copy_failed' | 'create_failed';
export type DuplicateResult = { ok: true; id: string } | { ok: false; error: DuplicateError };

/** `"<original>" + " (copia)"`, truncating the ORIGINAL so the whole thing stays <= 120 chars. */
export function buildDuplicateTitle(originalTitle: string): string {
  const maxBase = MAX_TITLE_LENGTH - COPY_SUFFIX.length;
  const base = originalTitle.length > maxBase ? originalTitle.slice(0, maxBase) : originalTitle;
  return `${base}${COPY_SUFFIX}`;
}

/** Every worksheet image path in `blocks`, in first-seen order, deduplicated. */
function uniqueWorksheetImagePaths(blocks: Block[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'worksheet') continue;
    if (seen.has(block.image.path)) continue;
    seen.add(block.image.path);
    paths.push(block.image.path);
  }
  return paths;
}

/**
 * Rebuild `blocks` with a fresh id on every block (and, for a worksheet,
 * every zone), rewriting each worksheet's image path through `pathMapping` —
 * see file header for why both are regenerated.
 */
function rebuildBlocksForDuplicate(blocks: Block[], pathMapping: ReadonlyMap<string, string>): Block[] {
  return blocks.map((block): Block => {
    const id = crypto.randomUUID();
    if (block.type !== 'worksheet') {
      return { ...block, id };
    }
    const worksheet = block as WorksheetBlock;
    const newPath = pathMapping.get(worksheet.image.path) ?? worksheet.image.path;
    return {
      ...worksheet,
      id,
      image: { ...worksheet.image, path: newPath },
      zones: worksheet.zones.map((zone) => ({ ...zone, id: crypto.randomUUID() })),
    };
  });
}

/**
 * How many activities `callerId` has duplicated (from ANY source) in the
 * last 24 hours — `null` on any read failure.
 *
 * FAILS CLOSED, same posture as `countUserUploads`: the caller
 * ({@link duplicateActivity}) treats `null` the same as "at the cap" — an
 * outage must never lift the daily limit.
 */
async function countRecentDuplicates(client: SupabaseClient, callerId: string): Promise<number | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { count, error } = await client
      .from(ACTIVITIES_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('author_id', callerId)
      .not('source_activity_id', 'is', null)
      .gte('created_at', since);

    if (error) {
      console.error('[activities/duplicate] countRecentDuplicates failed:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.error('[activities/duplicate] countRecentDuplicates threw:', err);
    return null;
  }
}

/**
 * `POST /api/actividades/[id]/duplicar`'s whole write path — see file header
 * for the full step list.
 */
export async function duplicateActivity(originalId: string, callerId: string): Promise<DuplicateResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'create_failed' };

  const original = await getPublishedActivity(originalId);
  if (!original) return { ok: false, error: 'not_found' };

  const duplicateCount = await countRecentDuplicates(client, callerId);
  if (duplicateCount === null || duplicateCount >= MAX_DUPLICATES_PER_DAY) {
    return { ok: false, error: 'daily_limit' };
  }

  const imagePaths = uniqueWorksheetImagePaths(original.blocks);

  // FAILS CLOSED: an unreadable count is treated as "at the cap", same
  // reasoning as `imagen.ts`'s own upload-cap check.
  const currentUploads = await countUserUploads(callerId);
  if (currentUploads === null || currentUploads + imagePaths.length > MAX_UPLOADS_PER_USER) {
    return { ok: false, error: 'upload_limit' };
  }

  const pathMapping = new Map<string, string>();
  for (const path of imagePaths) {
    const parsed = parseImagePath(path);
    // Defensive only: every path here already passed `parseBlocks` when
    // `getPublishedActivity` loaded it, so this can never actually fail.
    if (!parsed) return { ok: false, error: 'create_failed' };

    const newObjectId = crypto.randomUUID();
    const toPath = uploadPath(callerId, newObjectId);
    const copied = await copyToUploadsBucket(path, toPath);
    if (!copied) return { ok: false, error: 'copy_failed' };
    pathMapping.set(path, toPath);
  }

  const newBlocks = rebuildBlocksForDuplicate(original.blocks, pathMapping);
  const title = buildDuplicateTitle(original.title);

  const id = await createActivity(callerId, {
    title,
    level: original.level,
    blocks: newBlocks,
    sourceActivityId: originalId,
  });
  if (!id) return { ok: false, error: 'create_failed' };

  return { ok: true, id };
}
