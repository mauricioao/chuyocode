/**
 * `POST /api/admin/cursos/[courseId]/actualizar` — updates a course's own
 * fields (never its `status`, which lives at `.../estado`).
 *
 * ```
 * 1. locals.user null                     -> 401
 * 2. signed in, not a moderator            -> 404 (never 403)
 * 3. malformed courseId                    -> 404
 * 4. bad JSON / malformed field types      -> 400
 * 5. updateCourse(): invalid_*             -> 422 { error }
 * 6. updateCourse(): duplicate_slug        -> 409 { error }
 * 7. updateCourse(): unavailable/db_error  -> 500 { error }
 * 8. success                               -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { updateCourse, type CourseInput } from '@lib/courses/admin';

const VALIDATION_ERRORS: ReadonlySet<string> = new Set([
  'invalid_slug',
  'invalid_title',
  'invalid_subtitle',
  'invalid_level',
  'invalid_price',
]);

interface UpdateBody {
  slug?: unknown;
  title?: unknown;
  subtitle?: unknown;
  description?: unknown;
  level?: unknown;
  cover_path?: unknown;
  included_in_premium?: unknown;
  price_cents?: unknown;
  currency?: unknown;
}

function toPatch(body: UpdateBody): Partial<CourseInput> | null {
  const patch: Partial<CourseInput> = {};
  if (body.slug !== undefined) {
    if (typeof body.slug !== 'string') return null;
    patch.slug = body.slug;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') return null;
    patch.title = body.title;
  }
  if (body.subtitle !== undefined) {
    if (body.subtitle !== null && typeof body.subtitle !== 'string') return null;
    patch.subtitle = body.subtitle as string | null;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') return null;
    patch.description = body.description as string | null;
  }
  if (body.level !== undefined) {
    if (body.level !== null && typeof body.level !== 'string') return null;
    patch.level = body.level as string | null;
  }
  if (body.cover_path !== undefined) {
    if (body.cover_path !== null && typeof body.cover_path !== 'string') return null;
    patch.cover_path = body.cover_path as string | null;
  }
  if (body.included_in_premium !== undefined) {
    if (typeof body.included_in_premium !== 'boolean') return null;
    patch.included_in_premium = body.included_in_premium;
  }
  if (body.price_cents !== undefined) {
    if (body.price_cents !== null && typeof body.price_cents !== 'number') return null;
    patch.price_cents = body.price_cents as number | null;
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== 'string') return null;
    patch.currency = body.currency;
  }
  return patch;
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const courseId = params.courseId;
  if (typeof courseId !== 'string' || !isUuid(courseId)) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (typeof body !== 'object' || body === null) return jsonResponse({ error: 'bad_request' }, 400);

  const patch = toPatch(body as UpdateBody);
  if (!patch) return jsonResponse({ error: 'bad_request' }, 400);

  const result = await updateCourse(courseId, patch);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (VALIDATION_ERRORS.has(result.error)) return jsonResponse({ error: result.error }, 422);
  if (result.error === 'duplicate_slug') return jsonResponse({ error: result.error }, 409);
  return jsonResponse({ error: result.error }, 500);
};
