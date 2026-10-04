/**
 * `POST /api/actividades/[id]/visto` — record one practice-page view for the
 * signed-in caller (PR D, "Activities practice"). Called by
 * `ActivityViewBadge` (the practice page's own island) right after mount —
 * see that component's header for why this is a client-triggered POST
 * rather than an awaited call in the page's own SSR frontmatter (it would
 * delay the whole page render for a cosmetic counter).
 *
 * ```
 * 1. locals.user null           -> 401
 * 2. malformed id                -> 404
 * 3. recordActivityView(...)     -> the RPC's own atomic upsert-increment
 *    returns null (any failure)  -> 500 { error: 'view_failed' }
 * 4. success                     -> 200 { viewCount }
 * ```
 *
 * Deliberately does NOT check the activity's own visibility here — a stale
 * or since-unpublished id simply fails the RPC's FK constraint, which
 * `recordActivityView` already reports as `null`/500. No separate existence
 * check is worth a second round trip for a counter nobody's page render
 * depends on.
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { isUuid } from '@lib/activities/paths';
import { recordActivityView } from '@lib/activities/views';

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) {
    return notFoundResponse();
  }

  const viewCount = await recordActivityView(user.id, id);
  if (viewCount === null) {
    return jsonResponse({ error: 'view_failed' }, 500);
  }

  return jsonResponse({ viewCount }, 200);
};
