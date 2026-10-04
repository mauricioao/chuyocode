/**
 * `POST /api/actividades/[id]/duplicar` — "Duplicar y adaptar" (D7). Any
 * signed-in visitor, including the original activity's own author, may
 * duplicate a LIVE activity into a brand-new `draft` they own. See
 * `duplicateActivity` (`@lib/activities/duplicate`) for the whole write path
 * this wraps (rate limits, storage copy, fresh ids, provenance):
 *
 * ```
 * 1. locals.user null                    -> 401
 * 2. malformed id                        -> 404
 * 3. duplicateActivity(): not_found      -> 404 (does not exist, or not live
 *    — same collapse as the practice page's own 404)
 * 4. daily_limit / upload_limit          -> 429 { error }
 * 5. copy_failed / create_failed         -> 500 { error }
 * 6. success                             -> 200 { id }
 * ```
 *
 * Every response is private/no-store (T7): it is read off `locals.user`, and
 * a shared cache serving it to a different visitor would leak both identity
 * and content.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { isUuid } from '@lib/activities/paths';
import { duplicateActivity } from '@lib/activities/duplicate';

const RATE_LIMIT_ERRORS: ReadonlySet<string> = new Set(['daily_limit', 'upload_limit']);

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) return notFoundResponse();

  const result = await duplicateActivity(id, user.id);
  if (result.ok) return jsonResponse({ id: result.id }, 200);

  if (result.error === 'not_found') return notFoundResponse();
  if (RATE_LIMIT_ERRORS.has(result.error)) return jsonResponse({ error: result.error }, 429);
  return jsonResponse({ error: result.error }, 500);
};
