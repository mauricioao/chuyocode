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
 *
 * KIND PREFIX (question context images, `activities/blocks.ts`'s own
 * `QuizBlock.promptImages`; background images, `QuizBlock.background`'s own
 * `{kind: 'image'}`): a DISPLAY-ONLY image attached to a "Varios juegos"
 * question, or to a molded block's own decorative background, is never a
 * worksheet image, and every consumer must be able to tell the three apart
 * from the path alone — so each non-worksheet kind's filename carries its
 * own prefix the worksheet shape never has:
 *
 *   `activity-uploads/<userId>/question-<uuid>.webp`
 *   `activity-images/<activityId>/question-<uuid>.webp`
 *   `activity-uploads/<userId>/background-<uuid>.webp`
 *   `activity-images/<activityId>/background-<uuid>.webp`
 *
 * A flat FILENAME prefix, not a subfolder: Supabase Storage's own `.list()`
 * is non-recursive, and `countUserUploads`/`removeAllUserUploads`
 * (`storage.ts`) both list a user's folder ONE level deep — a subfolder
 * would hide every question/background image from the per-user upload cap
 * and from account-deletion cleanup. A filename prefix keeps both working
 * unchanged: a question or background image counts against the SAME
 * per-user cap as a worksheet one (same bucket, same owner folder) and is
 * still listed/removed by the existing whole-folder sweep.
 */

export const UPLOADS_BUCKET = 'activity-uploads';
export const IMAGES_BUCKET = 'activity-images';

/** Which shape of image a path names — see this file's own "KIND PREFIX" header. `'worksheet'` is the original, unprefixed shape; every path stored before this kind existed is one. */
export type ImageKind = 'worksheet' | 'question' | 'background';

/** The filename prefix for a `'question'`-kind object — absent entirely for `'worksheet'`. */
const QUESTION_PREFIX = 'question-';

/** The filename prefix for a `'background'`-kind object (plantillas: fondo, owner decision 2026-10-23) — same posture as {@link QUESTION_PREFIX}. */
const BACKGROUND_PREFIX = 'background-';

/** Canonical 8-4-4-4-12 hex form — what `gen_random_uuid()`/`crypto.randomUUID()` produce. */
const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`, 'i');

const FULL_PATH_RE = new RegExp(
  `^(${UPLOADS_BUCKET}|${IMAGES_BUCKET})/(${UUID_SOURCE})/(?:(${QUESTION_PREFIX})|(${BACKGROUND_PREFIX}))?(${UUID_SOURCE})\\.webp$`,
  'i',
);

/** Is `value` shaped like a canonical uuid? */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** This kind's own filename, given its object id (no owner/bucket prefix). */
function imageFileName(id: string, kind: ImageKind): string {
  if (kind === 'question') return `${QUESTION_PREFIX}${id}.webp`;
  if (kind === 'background') return `${BACKGROUND_PREFIX}${id}.webp`;
  return `${id}.webp`;
}

/** The uploads-bucket path for one user's fresh upload. `kind` defaults to `'worksheet'` — every call site written before question images existed keeps producing exactly the same path. */
export function uploadPath(userId: string, id: string, kind: ImageKind = 'worksheet'): string {
  return `${UPLOADS_BUCKET}/${userId}/${imageFileName(id, kind)}`;
}

/** The images-bucket path for one activity's moderator-approved copy. `kind` defaults to `'worksheet'`, same reasoning as {@link uploadPath}. */
export function approvedImagePath(activityId: string, id: string, kind: ImageKind = 'worksheet'): string {
  return `${IMAGES_BUCKET}/${activityId}/${imageFileName(id, kind)}`;
}

export interface ParsedImagePath {
  bucket: typeof UPLOADS_BUCKET | typeof IMAGES_BUCKET;
  /** The user id (uploads) or activity id (images) that owns this object. */
  ownerId: string;
  objectId: string;
  /** See {@link ImageKind}. */
  kind: ImageKind;
  /** This object's own filename (owner segment not included) — `{objectId}.webp`, or `question-{objectId}.webp` for a `'question'`-kind path. */
  fileName: string;
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
  const [, bucket, ownerId, questionPrefix, backgroundPrefix, objectId] = match;
  const kind: ImageKind = questionPrefix ? 'question' : backgroundPrefix ? 'background' : 'worksheet';
  const lowerOwnerId = ownerId.toLowerCase();
  const lowerObjectId = objectId.toLowerCase();
  const fileName = imageFileName(lowerObjectId, kind);
  return {
    bucket: bucket.toLowerCase() as typeof UPLOADS_BUCKET | typeof IMAGES_BUCKET,
    ownerId: lowerOwnerId,
    objectId: lowerObjectId,
    kind,
    fileName,
    objectPath: `${lowerOwnerId}/${fileName}`,
  };
}

/** Is `path` a well-formed, already-approved `'question'`-kind path (either bucket)? Mirrors {@link isPublicImagePath}'s own shape but keyed on kind rather than bucket — used where a caller must tell a question image apart from a worksheet one regardless of moderation stage. */
export function isQuestionImagePath(path: string): boolean {
  return parseImagePath(path)?.kind === 'question';
}

/** Is `path` a well-formed `'background'`-kind path (either bucket)? Same shape as {@link isQuestionImagePath}, for a molded block's own decorative background image (plantillas: fondo, owner decision 2026-10-23). */
export function isBackgroundImagePath(path: string): boolean {
  return parseImagePath(path)?.kind === 'background';
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

/**
 * Browser-loadable URL for a stored `image.path`, via the preview endpoint
 * (which redirects to the public URL or a short-lived signed one). Pure, so
 * islands compute it themselves — a function can't be passed to a hydrated
 * island as a prop (see `src/astroIslandProps.test.ts`).
 */
export function imagePreviewUrl(path: string): string {
  return `/api/actividades/imagen?path=${encodeURIComponent(path)}`;
}

/** Is `path` a well-formed path under the public, already-approved images bucket? */
export function isPublicImagePath(path: string): boolean {
  const parsed = parseImagePath(path);
  return parsed !== null && parsed.bucket === IMAGES_BUCKET;
}

/**
 * Path vocabulary for worksheet audio markers (`supabase/migrations/0021_activity_audio.sql`)
 * — the audio counterpart of the image buckets above, same two-stage
 * pre-/post-moderation shape:
 *
 *   `activity-audio-uploads/<userId>/<uuid>.<ext>`   (private, pre-moderation)
 *   `activity-audio/<activityId>/<uuid>.<ext>`       (public, approved)
 *
 * UNLIKE the image pipeline (which re-encodes everything to webp before
 * upload), an audio marker keeps whatever format the browser actually
 * produced — an upload or a `MediaRecorder` recording — so the stored
 * extension varies per object instead of being fixed. `AUDIO_EXTENSIONS`
 * is the one place content-type <-> extension is decided; every other
 * audio path helper takes/returns the extension explicitly rather than
 * assuming one.
 */
export const AUDIO_UPLOADS_BUCKET = 'activity-audio-uploads';
export const AUDIO_BUCKET = 'activity-audio';

/**
 * Accepted audio content-types -> their stored file extension. Mirrors the
 * 0021 migration's `allowed_mime_types` on both audio buckets exactly —
 * `src/pages/api/actividades/audio.ts` rejects anything else with 415
 * before this map is ever consulted.
 */
export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

const AUDIO_EXT_SOURCE = '(?:webm|m4a|mp3|ogg|wav)';
const AUDIO_FULL_PATH_RE = new RegExp(
  `^(${AUDIO_UPLOADS_BUCKET}|${AUDIO_BUCKET})/(${UUID_SOURCE})/(${UUID_SOURCE})\\.(${AUDIO_EXT_SOURCE})$`,
  'i',
);

/** The audio-uploads-bucket path for one user's fresh upload/recording. */
export function uploadAudioPath(userId: string, id: string, ext: string): string {
  return `${AUDIO_UPLOADS_BUCKET}/${userId}/${id}.${ext}`;
}

/** The audio-bucket path for one activity's moderator-approved copy. */
export function approvedAudioPath(activityId: string, id: string, ext: string): string {
  return `${AUDIO_BUCKET}/${activityId}/${id}.${ext}`;
}

export interface ParsedAudioPath {
  bucket: typeof AUDIO_UPLOADS_BUCKET | typeof AUDIO_BUCKET;
  /** The user id (uploads) or activity id (approved) that owns this object. */
  ownerId: string;
  objectId: string;
  ext: string;
  /** Path relative to the bucket, as the storage API (`.from(bucket)`) expects it. */
  objectPath: string;
}

/**
 * Parse a stored audio marker `path` into its bucket/owner/object/extension
 * parts, or `null` when it does not match the storage layout exactly — no
 * URLs, no `..`, no bucket/extension this codebase does not know about.
 */
export function parseAudioPath(path: string): ParsedAudioPath | null {
  const match = AUDIO_FULL_PATH_RE.exec(path);
  if (!match) return null;
  const [, bucket, ownerId, objectId, ext] = match;
  return {
    bucket: bucket.toLowerCase() as typeof AUDIO_UPLOADS_BUCKET | typeof AUDIO_BUCKET,
    ownerId: ownerId.toLowerCase(),
    objectId: objectId.toLowerCase(),
    ext: ext.toLowerCase(),
    objectPath: `${ownerId.toLowerCase()}/${objectId.toLowerCase()}.${ext.toLowerCase()}`,
  };
}

/** Is `path` a well-formed audio upload path, owned by `userId`? */
export function isOwnAudioUploadPath(path: string, userId: string): boolean {
  if (!isUuid(userId)) return false;
  const parsed = parseAudioPath(path);
  return (
    parsed !== null &&
    parsed.bucket === AUDIO_UPLOADS_BUCKET &&
    parsed.ownerId === userId.toLowerCase()
  );
}

/** Browser-loadable URL for a stored audio marker `path`, via the preview endpoint — same redirect shape as {@link imagePreviewUrl}. */
export function audioPreviewUrl(path: string): string {
  return `/api/actividades/audio?path=${encodeURIComponent(path)}`;
}

/** Is `path` a well-formed path under the public, already-approved audio bucket? */
export function isPublicAudioPath(path: string): boolean {
  const parsed = parseAudioPath(path);
  return parsed !== null && parsed.bucket === AUDIO_BUCKET;
}
