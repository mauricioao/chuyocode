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
  AUDIO_UPLOADS_BUCKET,
  AUDIO_BUCKET,
  AUDIO_EXTENSIONS,
  uploadAudioPath,
  approvedAudioPath,
  parseAudioPath,
  isOwnAudioUploadPath,
  isPublicAudioPath,
} from './paths';

export {
  UPLOADS_BUCKET,
  IMAGES_BUCKET,
  uploadPath,
  approvedImagePath,
  parseImagePath,
  isOwnUploadPath,
  isPublicImagePath,
  AUDIO_UPLOADS_BUCKET,
  AUDIO_BUCKET,
  AUDIO_EXTENSIONS,
  uploadAudioPath,
  approvedAudioPath,
  parseAudioPath,
  isOwnAudioUploadPath,
  isPublicAudioPath,
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
 * Delete every object in `userId`'s private uploads folder, whole-folder,
 * never a per-activity subset (account deletion,
 * `supabase/migrations/0020_account_deletion.sql`).
 *
 * Safe regardless of which of that user's activities/exercises were just
 * transferred to ChuyoCode vs hard-deleted by `transfer_and_purge_user`:
 * once a worksheet image is moderator-approved, the revision that
 * references it is rewritten to point at the PUBLIC
 * `activity-images/<activityId>/…` copy instead (`copyToImagesBucket`,
 * called from `aprobar.ts`), so nothing a transferred/live activity still
 * shows ever lives in this bucket — only drafts-in-progress and
 * already-superseded originals do, and ALL of those are gone or orphaned
 * the moment the account itself is gone.
 *
 * The folder's path is a pure function of `userId` alone
 * ({@link uploadPath}), so this needs no list of paths FROM the database —
 * only `userId`, which the caller already has.
 *
 * PAGINATES past {@link MAX_UPLOADS_PER_USER}: `.list()` itself caps at
 * `limit` objects per call, so a user with MORE than that many uploads (the
 * limit only bounds NEW uploads going forward, via `countUserUploads` — it
 * never shrinks an already-larger folder) would otherwise have every object
 * past the first page silently left behind. Each page is removed BEFORE the
 * next `.list()` call, always re-listing from the top (no `offset`):
 * removing a page shifts every later object down by exactly that many
 * positions, so an incrementing offset would skip objects past the first
 * page — re-listing from the top after each deletion sidesteps that
 * entirely, since everything already removed can never be listed again.
 * Stops once a page comes back empty or shorter than `limit` (the last
 * page).
 *
 * `true` when the folder was already empty or every found object (every
 * page) was removed; `false` on ANY page's list/remove failure — the caller
 * (`src/lib/accountDeletion.ts`) treats that as "stop here, do not delete
 * the auth user yet", same FAIL-CLOSED posture as {@link countUserUploads}.
 * A failure partway through still leaves every PRIOR page's objects
 * removed; retrying (the caller's own story, see its header) simply resumes
 * against whatever remains.
 */
export async function removeAllUserUploads(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const client = getClient();
  if (!client) return false;

  try {
    for (;;) {
      const { data, error } = await client.storage
        .from(UPLOADS_BUCKET)
        .list(userId, { limit: MAX_UPLOADS_PER_USER });
      if (error) {
        console.error('[activities/storage] removeAllUserUploads list failed:', error.message);
        return false;
      }
      if (!data || data.length === 0) return true;

      const paths = data.map((file) => `${userId}/${file.name}`);
      const { error: removeError } = await client.storage.from(UPLOADS_BUCKET).remove(paths);
      if (removeError) {
        console.error('[activities/storage] removeAllUserUploads remove failed:', removeError.message);
        return false;
      }

      // A full page: more may remain, go around again (from the top — see
      // this function's own header for why never an offset). Fewer than a
      // full page: that was the last one.
      if (data.length < MAX_UPLOADS_PER_USER) return true;
    }
  } catch (err) {
    console.error('[activities/storage] removeAllUserUploads threw:', err);
    return false;
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

/**
 * Copy an already-PUBLIC image from the `activity-images` bucket into a
 * fresh owner's PRIVATE `activity-uploads` folder ("Duplicar y adaptar", D7)
 * — the mirror image of {@link copyToImagesBucket}, direction reversed: a
 * duplicate's first draft must reference only paths its new owner is allowed
 * to use (the same invariant `guardar.ts`/`index.ts` already enforce on every
 * save), so every worksheet image the ORIGINAL's published revision points
 * at is copied here, under a brand-new id, into the caller's own uploads
 * folder before the duplicate activity is ever created.
 *
 * `toPath` is always derived from a freshly minted uuid by the caller
 * ({@link uploadPath}(callerId, crypto.randomUUID())) — unlike
 * `copyToImagesBucket`'s retried-approval case, there is no reasonable
 * collision to guard against, so this does not pre-check for an existing
 * object at the destination.
 */
export async function copyToUploadsBucket(fromPath: string, toPath: string): Promise<boolean> {
  const fromParsed = parseImagePath(fromPath);
  const toParsed = parseImagePath(toPath);
  if (!fromParsed || fromParsed.bucket !== IMAGES_BUCKET) return false;
  if (!toParsed || toParsed.bucket !== UPLOADS_BUCKET) return false;

  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.storage
      .from(IMAGES_BUCKET)
      .copy(fromParsed.objectPath, toParsed.objectPath, { destinationBucket: UPLOADS_BUCKET });
    if (error) {
      console.error('[activities/storage] copyToUploadsBucket copy failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[activities/storage] copyToUploadsBucket threw:', err);
    return false;
  }
}

/**
 * Storage I/O for worksheet audio markers (`supabase/migrations/0021_activity_audio.sql`)
 * — mirrors every function above, one-for-one, over the two audio buckets
 * instead of the two image ones. Same lazily-created service-role client,
 * same fail-closed/fail-safe postures per function (documented on each).
 */

/** The per-user audio-upload cap enforced by `POST /api/actividades/audio` (429 at/above this) — same value as {@link MAX_UPLOADS_PER_USER}, its own named constant so either can change independently. */
export const MAX_AUDIO_UPLOADS_PER_USER = 100;

/** A short-lived signed URL to READ an audio object at `path` (either bucket) — the audio-uploads bucket's only read path, since it is private. */
export async function signedAudioReadUrl(path: string): Promise<string | null> {
  const parsed = parseAudioPath(path);
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
    console.error('[activities/storage] signedAudioReadUrl threw:', err);
    return null;
  }
}

/**
 * Upload already-validated audio bytes to `userId`'s audio-upload folder
 * under a fresh object id, returning the stored (bucket-prefixed) path, or
 * `null` on any failure (including an unrecognized `contentType` — the
 * caller, `audio.ts`, has already checked it against {@link AUDIO_EXTENSIONS}
 * and the format's own magic bytes before this is ever called).
 */
export async function uploadToAudioUploadsBucket(
  userId: string,
  id: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const ext = AUDIO_EXTENSIONS[contentType];
  if (!ext) return null;
  if (!isUuid(userId) || !isUuid(id)) return null;
  const client = getClient();
  if (!client) return null;

  const path = uploadAudioPath(userId, id, ext);
  const parsed = parseAudioPath(path);
  if (!parsed) return null;

  try {
    const { error } = await client.storage.from(AUDIO_UPLOADS_BUCKET).upload(parsed.objectPath, bytes, {
      contentType,
      upsert: false,
    });
    if (error) {
      console.error('[activities/storage] audio upload failed:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error('[activities/storage] audio upload threw:', err);
    return null;
  }
}

/** The public URL for an already-approved audio object, or `null` for anything else — same `?redirect=1` Netlify-safe shape as {@link publicImageUrl}. */
export function publicAudioUrl(path: string): string | null {
  const parsed = parseAudioPath(path);
  if (!parsed || parsed.bucket !== AUDIO_BUCKET) return null;
  const { SUPABASE_URL } = loadEnv();
  return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${parsed.objectPath}?redirect=1`;
}

/** How many objects currently sit in `userId`'s audio-uploads folder, capped at {@link MAX_AUDIO_UPLOADS_PER_USER} — `null` on any read failure, treated by the caller as "at the cap" (fails CLOSED, same posture as {@link countUserUploads}). */
export async function countUserAudioUploads(userId: string): Promise<number | null> {
  if (!isUuid(userId)) return null;
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.storage
      .from(AUDIO_UPLOADS_BUCKET)
      .list(userId, { limit: MAX_AUDIO_UPLOADS_PER_USER });
    if (error || !data) return null;
    return data.length;
  } catch (err) {
    console.error('[activities/storage] countUserAudioUploads threw:', err);
    return null;
  }
}

/**
 * Delete every object in `userId`'s private audio-uploads folder —
 * paginated exactly like {@link removeAllUserUploads}, for the same reason
 * (account deletion, `src/lib/accountDeletion.ts`).
 */
export async function removeAllUserAudioUploads(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const client = getClient();
  if (!client) return false;

  try {
    for (;;) {
      const { data, error } = await client.storage
        .from(AUDIO_UPLOADS_BUCKET)
        .list(userId, { limit: MAX_AUDIO_UPLOADS_PER_USER });
      if (error) {
        console.error('[activities/storage] removeAllUserAudioUploads list failed:', error.message);
        return false;
      }
      if (!data || data.length === 0) return true;

      const paths = data.map((file) => `${userId}/${file.name}`);
      const { error: removeError } = await client.storage.from(AUDIO_UPLOADS_BUCKET).remove(paths);
      if (removeError) {
        console.error('[activities/storage] removeAllUserAudioUploads remove failed:', removeError.message);
        return false;
      }

      if (data.length < MAX_AUDIO_UPLOADS_PER_USER) return true;
    }
  } catch (err) {
    console.error('[activities/storage] removeAllUserAudioUploads threw:', err);
    return false;
  }
}

/**
 * Copy an approved audio upload from the PRIVATE `activity-audio-uploads`
 * bucket to its moderator-approved home in the PUBLIC `activity-audio`
 * bucket — the audio counterpart of {@link copyToImagesBucket}, called from
 * `approveRevision` for every audio marker the revision being approved
 * references, BEFORE the approval RPC itself runs, same "copy first, a
 * partial copy is a harmless orphan" reasoning. IDEMPOTENT, same as
 * {@link copyToImagesBucket}: an existing object at `toPath` is left
 * untouched.
 */
export async function copyToAudioBucket(fromPath: string, toPath: string): Promise<boolean> {
  const fromParsed = parseAudioPath(fromPath);
  const toParsed = parseAudioPath(toPath);
  if (!fromParsed || fromParsed.bucket !== AUDIO_UPLOADS_BUCKET) return false;
  if (!toParsed || toParsed.bucket !== AUDIO_BUCKET) return false;

  const client = getClient();
  if (!client) return false;

  try {
    const objectName = `${toParsed.objectId}.${toParsed.ext}`;
    const { data: existing, error: listError } = await client.storage
      .from(AUDIO_BUCKET)
      .list(toParsed.ownerId, { search: objectName });
    if (listError) {
      console.error('[activities/storage] copyToAudioBucket list failed:', listError.message);
      return false;
    }
    if (Array.isArray(existing) && existing.some((file) => file.name === objectName)) {
      return true;
    }

    const { error } = await client.storage
      .from(AUDIO_UPLOADS_BUCKET)
      .copy(fromParsed.objectPath, toParsed.objectPath, { destinationBucket: AUDIO_BUCKET });
    if (error) {
      console.error('[activities/storage] copyToAudioBucket copy failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[activities/storage] copyToAudioBucket threw:', err);
    return false;
  }
}

/**
 * Copy an already-PUBLIC audio marker from the `activity-audio` bucket into
 * a fresh owner's PRIVATE `activity-audio-uploads` folder ("Duplicar y
 * adaptar", mirrors {@link copyToUploadsBucket}) — every audio marker the
 * ORIGINAL's published revision points at is copied here, under a brand-new
 * id, into the caller's own uploads folder before the duplicate activity is
 * ever created, same reasoning as the image copy.
 */
export async function copyAudioToUploadsBucket(fromPath: string, toPath: string): Promise<boolean> {
  const fromParsed = parseAudioPath(fromPath);
  const toParsed = parseAudioPath(toPath);
  if (!fromParsed || fromParsed.bucket !== AUDIO_BUCKET) return false;
  if (!toParsed || toParsed.bucket !== AUDIO_UPLOADS_BUCKET) return false;

  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.storage
      .from(AUDIO_BUCKET)
      .copy(fromParsed.objectPath, toParsed.objectPath, { destinationBucket: AUDIO_UPLOADS_BUCKET });
    if (error) {
      console.error('[activities/storage] copyAudioToUploadsBucket copy failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[activities/storage] copyAudioToUploadsBucket threw:', err);
    return false;
  }
}
