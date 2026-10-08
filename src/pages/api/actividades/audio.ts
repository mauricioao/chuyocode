/**
 * `POST /api/actividades/audio` — pre-moderation audio upload for worksheet
 * audio markers ("colocar un audio propio", `0021_activity_audio.sql`).
 * Mirrors `imagen.ts` exactly, over the audio buckets instead of the image
 * ones — see that file's own header for the shared reasoning.
 *
 * Every upload lands in the PRIVATE `activity-audio-uploads` bucket.
 * Nothing here ever writes the PUBLIC `activity-audio` bucket — that copy
 * only exists once a moderator approves the revision referencing it
 * (`approveRevision`, `src/lib/activities/moderation.ts`). Bytes are
 * validated BEFORE anything reaches storage:
 *
 * ```
 * 1. locals.user null                              -> 401
 * 2. content-type is not an accepted audio format   -> 415
 * 3. empty body                                     -> 400
 * 4. body > 5 MB (mirrors the bucket's own cap)      -> 413
 * 5. bytes don't match the claimed format's magic    -> 422
 *    bytes (`matchesAudioMagicBytes`)
 * 6. caller already has >= 100 audio uploads         -> 429
 * 7. storage write fails                             -> 500
 * 8. success                                         -> 200 { path }
 * ```
 *
 * `GET /api/actividades/audio?path=…` — preview/read-back for a stored
 * path, identical posture to `imagen.ts`'s own GET: a well-formed
 * `activity-audio/…` path is PUBLIC already (a moderator-approved copy) and
 * redirects with no identity check at all. Anything else must be the
 * caller's own upload or a moderator's, or the response is a 404 — the SAME
 * 404 for "no such path" and "exists but isn't yours".
 *
 * Every response is private/no-store (T7 posture), same as `imagen.ts`.
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import {
  isOwnAudioUploadPath,
  isPublicAudioPath,
  publicAudioUrl,
  signedAudioReadUrl,
  uploadToAudioUploadsBucket,
  countUserAudioUploads,
  MAX_AUDIO_UPLOADS_PER_USER,
  AUDIO_EXTENSIONS,
} from '@lib/activities/storage';
import { matchesAudioMagicBytes } from '@lib/activities/audioFormat';

/** Mirrors the `activity-audio-uploads` bucket's own `file_size_limit` (0021 migration). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function redirect(location: string): Response {
  const headers = new Headers({ location });
  markPrivate(headers);
  return new Response(null, { status: 302, headers });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!(contentType in AUDIO_EXTENSIONS)) {
    return jsonResponse({ error: 'unsupported_media_type' }, 415);
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) {
    return jsonResponse({ error: 'empty_body' }, 400);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'payload_too_large' }, 413);
  }

  const bytes = new Uint8Array(buffer);
  if (!matchesAudioMagicBytes(contentType, bytes)) {
    return jsonResponse({ error: 'invalid_audio' }, 422);
  }

  // FAILS CLOSED: a count we could not read is treated as "at the cap",
  // same reasoning as `imagen.ts`'s own upload-cap check.
  const uploadCount = await countUserAudioUploads(user.id);
  if (uploadCount === null || uploadCount >= MAX_AUDIO_UPLOADS_PER_USER) {
    return jsonResponse({ error: 'upload_limit_reached' }, 429);
  }

  const id = crypto.randomUUID();
  const path = await uploadToAudioUploadsBucket(user.id, id, bytes, contentType);
  if (!path) {
    return jsonResponse({ error: 'upload_failed' }, 500);
  }

  return jsonResponse({ path }, 200);
};

export const GET: APIRoute = async ({ request, locals }) => {
  const path = new URL(request.url).searchParams.get('path');
  if (!path) return jsonResponse({ error: 'bad_request' }, 400);

  // Already public — no identity check needed at all, moderator or not.
  if (isPublicAudioPath(path)) {
    const url = publicAudioUrl(path);
    if (!url) return notFoundResponse();
    return redirect(url);
  }

  const user = locals.user;
  if (!user) return requireUser();

  const isOwner = isOwnAudioUploadPath(path, user.id);
  const isModerator = !isOwner && (await requireRole(user, 'moderator')) !== null;
  if (!isOwner && !isModerator) {
    // Same response whether the path is malformed, does not exist, or
    // exists but belongs to someone else — never leak which one it was.
    return notFoundResponse();
  }

  const signedUrl = await signedAudioReadUrl(path);
  if (!signedUrl) return notFoundResponse();

  return redirect(signedUrl);
};
