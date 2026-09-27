/**
 * Shared, pure path vocabulary for activity images (design.md "Stage 1 is
 * public" / pre-moderation, `supabase/migrations/0011_activities.sql`).
 *
 * Zero I/O: bucket names, the on-disk path shape, and path builders/
 * validators only. `src/lib/activities/storage.ts` adds the service-role I/O
 * (signed URLs) on top of this; `src/lib/activities/blocks.ts` imports only
 * these pure helpers to validate a stored `image.path` without ever pulling
 * in a Supabase client.
 *
 * LAYOUT — every stored `image.path` is the FULL path, bucket included:
 *   `activity-uploads/<userId>/<uuid>.webp`  (private, pre-moderation)
 *   `activity-images/<activityId>/<uuid>.webp` (public, approved)
 *
 * Both the owner segment (a user id or an activity id) and the object name
 * are themselves uuids, which doubles as the traversal guard: neither `.`
 * nor `/` is a legal uuid character, so `../../x` can never match.
 */

export const UPLOADS_BUCKET = 'activity-uploads';
export const IMAGES_BUCKET = 'activity-images';

/** Canonical 8-4-4-4-12 hex form — what `gen_random_uuid()`/`crypto.randomUUID()` produce. */
const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`, 'i');

const FULL_PATH_RE = new RegExp(
  `^(${UPLOADS_BUCKET}|${IMAGES_BUCKET})/(${UUID_SOURCE})/(${UUID_SOURCE})\\.webp$`,
  'i',
);

/** Is `value` shaped like a canonical uuid? */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** The uploads-bucket path for one user's fresh upload. */
export function uploadPath(userId: string, id: string): string {
  return `${UPLOADS_BUCKET}/${userId}/${id}.webp`;
}

/** The images-bucket path for one activity's moderator-approved copy. */
export function approvedImagePath(activityId: string, id: string): string {
  return `${IMAGES_BUCKET}/${activityId}/${id}.webp`;
}

export interface ParsedImagePath {
  bucket: typeof UPLOADS_BUCKET | typeof IMAGES_BUCKET;
  /** The user id (uploads) or activity id (images) that owns this object. */
  ownerId: string;
  objectId: string;
  /** Path relative to the bucket, as the storage API (`.from(bucket)`) expects it. */
  objectPath: string;
}

/**
 * Parse a stored `image.path` into its bucket/owner/object parts, or `null`
 * when it does not match the storage layout exactly — no URLs, no `..`, no
 * bucket this codebase does not know about, and no extra path segments.
 */
export function parseImagePath(path: string): ParsedImagePath | null {
  const match = FULL_PATH_RE.exec(path);
  if (!match) return null;
  const [, bucket, ownerId, objectId] = match;
  return {
    bucket: bucket.toLowerCase() as typeof UPLOADS_BUCKET | typeof IMAGES_BUCKET,
    ownerId: ownerId.toLowerCase(),
    objectId: objectId.toLowerCase(),
    objectPath: `${ownerId.toLowerCase()}/${objectId.toLowerCase()}.webp`,
  };
}

/** Is `path` a well-formed upload path, owned by `userId`? */
export function isOwnUploadPath(path: string, userId: string): boolean {
  if (!isUuid(userId)) return false;
  const parsed = parseImagePath(path);
  return (
    parsed !== null &&
    parsed.bucket === UPLOADS_BUCKET &&
    parsed.ownerId === userId.toLowerCase()
  );
}

/** Is `path` a well-formed path under the public, already-approved images bucket? */
export function isPublicImagePath(path: string): boolean {
  const parsed = parseImagePath(path);
  return parsed !== null && parsed.bucket === IMAGES_BUCKET;
}
