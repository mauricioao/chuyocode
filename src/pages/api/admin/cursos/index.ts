/**
 * `POST /api/admin/cursos` `{ slug, title, subtitle?, description?, level?,
 * cover_path?, included_in_premium?, price_cents?, currency? }` — creates a
 * course (moderator authoring, hidden Courses feature).
 *
 * ```
 * 1. locals.user null                     -> 401
 * 2. signed in, not a moderator            -> 404 (never 403)
 * 3. bad JSON / missing slug or title      -> 400
 * 4. createCourse(): invalid_*             -> 422 { error }
 * 5. createCourse(): duplicate_slug        -> 409 { error }
 * 6. createCourse(): unavailable/db_error  -> 500 { error }
 * 7. success                               -> 201 { course }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { createCourse, type CourseInput } from '@lib/courses/admin';

const VALIDATION_ERRORS: ReadonlySet<string> = new Set([
  'invalid_slug',
  'invalid_title',
  'invalid_subtitle',
  'invalid_level',
  'invalid_price',
]);

interface CreateBody {
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

function toInput(body: CreateBody): CourseInput | null {
  if (typeof body.slug !== 'string' || typeof body.title !== 'string') return null;
  if (body.subtitle !== undefined && body.subtitle !== null && typeof body.subtitle !== 'string') return null;
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') return null;
  if (body.level !== undefined && body.level !== null && typeof body.level !== 'string') return null;
  if (body.cover_path !== undefined && body.cover_path !== null && typeof body.cover_path !== 'string') return null;
  if (body.included_in_premium !== undefined && typeof body.included_in_premium !== 'boolean') return null;
  if (body.price_cents !== undefined && body.price_cents !== null && typeof body.price_cents !== 'number') return null;
  if (body.currency !== undefined && typeof body.currency !== 'string') return null;

  return {
    slug: body.slug,
    title: body.title,
    subtitle: (body.subtitle as string | null | undefined) ?? null,
    description: (body.description as string | null | undefined) ?? null,
    level: (body.level as string | null | undefined) ?? null,
    cover_path: (body.cover_path as string | null | undefined) ?? null,
    included_in_premium: body.included_in_premium as boolean | undefined,
    price_cents: (body.price_cents as number | null | undefined) ?? null,
    currency: body.currency as string | undefined,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (typeof body !== 'object' || body === null) return jsonResponse({ error: 'bad_request' }, 400);

  const input = toInput(body as CreateBody);
  if (!input) return jsonResponse({ error: 'bad_request' }, 400);

  const result = await createCourse(input, moderator.id);
  if (result.ok) return jsonResponse({ course: result.value }, 201);

  if (VALIDATION_ERRORS.has(result.error)) return jsonResponse({ error: result.error }, 422);
  if (result.error === 'duplicate_slug') return jsonResponse({ error: result.error }, 409);
  return jsonResponse({ error: result.error }, 500);
};
