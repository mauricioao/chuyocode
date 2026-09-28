/**
 * Storage I/O for activity images (design.md "Stage 1 is public" /
 * pre-moderation, `supabase/migrations/0011_activities.sql`).
 *
 * Path SHAPE and validation are pure and live in `./paths` (re-exported
 * here for callers that only need this one module); everything below talks
 * to Supabase Storage through the service-role client, created lazily the
 * same way `src/lib/roles.ts` creates it — on first use, not at module load,
 * so the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset (every
 * function here then simply returns `null`, never throws).
 *
 * NO anon/authenticated access exists on either bucket (0011 migration has
 * no `storage.objects` policy for them) — every read and write goes through
 * this module's service-role client, fronted by short-lived signed URLs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { loadEnv } from '../env';
import {
  UPLOADS_BUCKET,
  IMAGES_BUCKET,
  uploadPath,
  approvedImagePath,
  parseImagePath,
  isOwnUploadPath,
  isPublicImagePath,
  isUuid,
} from './paths';

export {
  UPLOADS_BUCKET,
  IMAGES_BUCKET,
  uploadPath,
  approvedImagePath,
  parseImagePath,
  isOwnUploadPath,
  isPublicImagePath,
};

/** Signed URL lifetime: long enough for one upload/preview round trip, no longer. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/** The per-user upload cap enforced by the upload endpoint (429 at/above this). */
export const MAX_UPLOADS_PER_USER = 100;

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

/** Reset the lazily-created service client. Test isolation only (see `roles.ts`). */
export function clearStorageClient(): void {
  serviceClient = null;
}

export interface SignedUploadTarget {
  path: string;
  signedUrl: string;
  token: string;
}

/**
 * A short-lived signed URL the caller may `PUT` webp bytes to directly.
 *
 * Foundation helper for a later direct-to-storage browser upload. PR A's own
 * upload endpoint (`/api/actividades/imagen`) does NOT use this — it proxies
 * bytes through the server so the magic-bytes/dimension/size checks can run
 * BEFORE anything reaches storage, which a direct browser upload could not
 * do without trusting the browser.
 */
export async function signedUploadUrl(
  userId: string,
  id: string,
): Promise<SignedUploadTarget | null> {
  if (!isUuid(userId) || !isUuid(id)) return null;
  const client = getClient();
  if (!client) return null;

  const path = uploadPath(userId, id);
  const parsed = parseImagePath(path);
  if (!parsed) return null;

  try {
    const { data, error } = await client.storage
      .from(UPLOADS_BUCKET)
      .createSignedUploadUrl(parsed.objectPath);
    if (error || !data) return null;
    return { path, signedUrl: data.signedUrl, token: data.token };
  } catch (err) {
    console.error('[activities/storage] signedUploadUrl threw:', err);
    return null;
  }
}

/**
 * A short-lived signed URL to READ the object at `path` (either bucket) —
 * the uploads bucket's only read path, since it is private. Used by the
 * preview endpoint (`GET /api/actividades/imagen`) once it has authorized
 * the caller.
 */
export async function signedReadUrl(path: string): Promise<string | null> {
  const parsed = parseImagePath(path);
  if (!parsed) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.objectPath, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return null;
    return data.signedUrl;
  } catch (err) {
    console.error('[activities/storage] signedReadUrl threw:', err);
    return null;
  }
}

/**
 * Upload already-validated webp bytes to `userId`'s upload folder under a
 * fresh object id, returning the stored (bucket-prefixed) path, or `null`
 * on any failure. Called only after the magic-bytes/dimension/size checks
 * in the upload endpoint have already passed — this function trusts its
 * caller on content, not on identity (it still derives the path itself from
 * `userId`, never from caller-supplied input).
 */
export async function uploadToUploadsBucket(
  userId: string,
  id: string,
  bytes: Uint8Array,
): Promise<string | null> {
  if (!isUuid(userId) || !isUuid(id)) return null;
  const client = getClient();
  if (!client) return null;

  const path = uploadPath(userId, id);
  const parsed = parseImagePath(path);
  if (!parsed) return null;

  try {
    const { error } = await client.storage.from(UPLOADS_BUCKET).upload(parsed.objectPath, bytes, {
      contentType: 'image/webp',
      upsert: false,
    });
    if (error) {
      console.error('[activities/storage] upload failed:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error('[activities/storage] upload threw:', err);
    return null;
  }
}

/**
 * The public URL for an already-approved object in the PUBLIC images
 * bucket, or `null` for anything else (including a well-formed uploads path
 * — that bucket is private and has no public URL at all).
 *
 * Always carries a query string of its own (`?redirect=1`, otherwise
 * unused) — the Netlify gotcha this endpoint must not trip: a 30x whose
 * `Location` has no query of its own gets the ORIGINAL request's query
 * string appended by Netlify, which would otherwise silently tack this
 * preview endpoint's own `?path=…` onto the public object URL.
 */
export function publicImageUrl(path: string): string | null {
  const parsed = parseImagePath(path);
  if (!parsed || parsed.bucket !== IMAGES_BUCKET) return null;
  const { SUPABASE_URL } = loadEnv();
  return `${SUPABASE_URL}/storage/v1/object/public/${IMAGES_BUCKET}/${parsed.objectPath}?redirect=1`;
}

/**
 * How many objects currently sit in `userId`'s uploads folder, capped at
 * {@link MAX_UPLOADS_PER_USER} (we only ever need "at or above the cap",
 * never the exact count beyond it) — `null` when the check itself failed.
 *
 * FAILS CLOSED, unlike most storage reads in this codebase: the caller
 * (`imagen.ts`) treats `null` the same as "at the cap" and refuses the
 * upload, because the alternative — treating an unreadable count as "under
 * the cap" — would let a storage outage silently lift the per-user limit.
 */
export async function countUserUploads(userId: string): Promise<number | null> {
  if (!isUuid(userId)) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.storage
      .from(UPLOADS_BUCKET)
      .list(userId, { limit: MAX_UPLOADS_PER_USER });
    if (error || !data) return null;
    return data.length;
  } catch (err) {
    console.error('[activities/storage] countUserUploads threw:', err);
    return null;
  }
}

/**
 * Copy an approved upload from the PRIVATE `activity-uploads` bucket to its
 * moderator-approved home in the PUBLIC `activity-images` bucket (PR E,
 * "Moderation"). Called by `aprobar.ts` for every worksheet image the
 * revision being approved references, BEFORE the approval RPC itself runs —
 * see that endpoint's own header for why (copy first: an RPC failure after a
 * successful copy leaves a harmless orphan, never a live activity pointing
 * at a path nothing backs).
 *
 * `fromPath` must be a well-formed `activity-uploads/…` path and `toPath` a
 * well-formed `activity-images/…` one — both checked with {@link parseImagePath}
 * rather than trusted from the caller, even though the caller (`aprobar.ts`)
 * already derives `toPath` itself via {@link approvedImagePath}.
 *
 * IDEMPOTENT: if an object already sits at `toPath` (a retried approval, or
 * two images that happen to share an id across revisions), the existing copy
 * is left untouched and this returns `true` without writing again.
 */
export async function copyToImagesBucket(fromPath: string, toPath: string): Promise<boolean> {
  const fromParsed = parseImagePath(fromPath);
  const toParsed = parseImagePath(toPath);
  if (!fromParsed || fromParsed.bucket !== UPLOADS_BUCKET) return false;
  if (!toParsed || toParsed.bucket !== IMAGES_BUCKET) return false;

  const client = getClient();
  if (!client) return false;

  try {
    const objectName = `${toParsed.objectId}.webp`;
    const { data: existing, error: listError } = await client.storage
      .from(IMAGES_BUCKET)
      .list(toParsed.ownerId, { search: objectName });
    if (listError) {
      console.error('[activities/storage] copyToImagesBucket list failed:', listError.message);
      return false;
    }
    if (Array.isArray(existing) && existing.some((file) => file.name === objectName)) {
      return true;
    }

    const { error } = await client.storage
      .from(UPLOADS_BUCKET)
      .copy(fromParsed.objectPath, toParsed.objectPath, { destinationBucket: IMAGES_BUCKET });
    if (error) {
      console.error('[activities/storage] copyToImagesBucket copy failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[activities/storage] copyToImagesBucket threw:', err);
    return false;
  }
}
