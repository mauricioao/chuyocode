/**
 * `POST /api/actividades/imagen` — pre-moderation image upload for
 * activities (design.md "Stage 1 is public", `0011_activities.sql`).
 *
 * Every upload lands in the PRIVATE `activity-uploads` bucket. Nothing here
 * ever writes the PUBLIC `activity-images` bucket — that copy only exists
 * once a moderator approves the revision referencing it (PR E, no code in
 * this PR). Bytes are validated BEFORE anything reaches storage:
 *
 * ```
 * 1. locals.user null                          -> 401
 * 2. content-type is not image/webp             -> 415
 * 3. empty body                                 -> 400
 * 4. body > 2 MB (mirrors the bucket's own cap) -> 413
 * 5. not really WebP (bad magic bytes/header)   -> 422
 * 6. width/height outside [200, 2400] px        -> 422
 * 7. caller already has >= 100 uploads          -> 429
 * 8. storage write fails                        -> 500
 * 9. success                                    -> 200 { path, width, height }
 * ```
 *
 * `GET /api/actividades/imagen?path=…` — preview/read-back for a stored
 * path. A well-formed `activity-images/…` path is PUBLIC already (a
 * moderator-approved copy) and redirects with no identity check at all.
 * Anything else must be the caller's own upload or a moderator's, or the
 * response is a 404 — the SAME 404 for "no such path" and "exists but isn't
 * yours", so neither leaks which one it was.
 *
 * 🔴 THIS IS ALSO THE GUEST-PLAY IMAGE AUTHORIZATION RULE (practice/presentar
 * pages, `@lib/access`'s `isPublicActivityRoute`): "belongs to a published
 * activity" IS the `activity-images/…` bucket check above, not a separate
 * live lookup. A path only ever lands there via `copyToImagesBucket`
 * (`@lib/activities/storage`), called exclusively from `approveRevision`
 * when a moderator approves a revision — so the bucket/shape check already
 * means "a moderator approved this for publication", with no extra database
 * round trip. This was already true (and already anonymous: this endpoint
 * is under `/api/`, which the middleware's login gate never covers) before
 * guest play — it only now matters for a signed-OUT browser tab, not just a
 * bare HTTP client.
 *
 * Every response is private/no-store (T7 posture): both verbs read off
 * `locals.user`, and a shared cache serving either to a different visitor
 * would leak identity or content that visitor has no business seeing.
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import {
  isOwnUploadPath,
  isPublicImagePath,
  publicImageUrl,
  signedReadUrl,
  uploadToUploadsBucket,
  countUserUploads,
  MAX_UPLOADS_PER_USER,
} from '@lib/activities/storage';
import { hasWebpMagic, readWebpDimensions } from '@lib/activities/webp';

/** Mirrors the `activity-uploads` bucket's own `file_size_limit` (0011 migration). */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MIN_DIMENSION_PX = 200;
const MAX_DIMENSION_PX = 2400;

interface UploadResponse {
  path?: string;
  width?: number;
  height?: number;
  error?: string;
}

function json(body: UploadResponse, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function empty(status: number): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status, headers });
}

function redirect(location: string): Response {
  const headers = new Headers({ location });
  markPrivate(headers);
  return new Response(null, { status: 302, headers });
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Checked before anything else, same rule as every identity-gated write in
  // this codebase (`guardar.ts`, `reacciones/[exerciseId].ts`).
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('image/webp')) {
    return json({ error: 'unsupported_media_type' }, 415);
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) {
    return json({ error: 'empty_body' }, 400);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  const bytes = new Uint8Array(buffer);
  if (!hasWebpMagic(bytes)) {
    return json({ error: 'not_webp' }, 422);
  }

  const dimensions = readWebpDimensions(bytes);
  if (!dimensions) {
    return json({ error: 'not_webp' }, 422);
  }
  const { width, height } = dimensions;
  if (
    width > MAX_DIMENSION_PX ||
    height > MAX_DIMENSION_PX ||
    width < MIN_DIMENSION_PX ||
    height < MIN_DIMENSION_PX
  ) {
    return json({ error: 'invalid_dimensions' }, 422);
  }

  // FAILS CLOSED: a count we could not read is treated as "at the cap", same
  // reasoning as `countUserUploads`'s own header — an outage must not lift
  // the per-user limit.
  const uploadCount = await countUserUploads(user.id);
  if (uploadCount === null || uploadCount >= MAX_UPLOADS_PER_USER) {
    return json({ error: 'upload_limit_reached' }, 429);
  }

  const id = crypto.randomUUID();
  const path = await uploadToUploadsBucket(user.id, id, bytes);
  if (!path) {
    return json({ error: 'upload_failed' }, 500);
  }

  return json({ path, width, height }, 200);
};

export const GET: APIRoute = async ({ request, locals }) => {
  const path = new URL(request.url).searchParams.get('path');
  if (!path) return json({ error: 'bad_request' }, 400);

  // Already public — no identity check needed at all, moderator or not.
  if (isPublicImagePath(path)) {
    const url = publicImageUrl(path);
    if (!url) return empty(404);
    return redirect(url);
  }

  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const isOwner = isOwnUploadPath(path, user.id);
  const isModerator = !isOwner && (await requireRole(user, 'moderator')) !== null;
  if (!isOwner && !isModerator) {
    // Same response whether the path is malformed, does not exist, or
    // exists but belongs to someone else — never leak which one it was.
    return empty(404);
  }

  const signedUrl = await signedReadUrl(path);
  if (!signedUrl) return empty(404);

  return redirect(signedUrl);
};
