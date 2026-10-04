/**
 * `POST /api/admin/actividades/[revisionId]/aprobar` — moderator approval
 * (PR E, "Moderation"). See `approveRevision` (`@lib/activities/moderation`)
 * for the whole write path this wraps (strict block re-validation, the
 * private-upload -> public-copy step, then the `approve_activity_revision`
 * RPC) — this endpoint only translates that result into HTTP:
 *
 * ```
 * 1. locals.user null                            -> 401
 * 2. signed in, not a moderator                   -> 404 (never 403 —
 *    `requireRole`'s own "don't confirm the surface exists" posture)
 * 3. malformed revisionId                         -> 404
 * 4. approveRevision(): not_found                 -> 404
 * 5. not_pending / invalid_blocks / foreign_upload -> 422 { error }
 * 6. copy_failed / approve_failed                 -> 500 { error }
 * 7. success                                      -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, notFoundResponse, requireUser } from '@lib/apiResponse';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { approveRevision } from '@lib/activities/moderation';

/** `approveRevision`'s error codes that mean "the request itself was bad", never a server fault. */
const VALIDATION_ERRORS: ReadonlySet<string> = new Set(['not_pending', 'invalid_blocks', 'foreign_upload']);

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFoundResponse();

  const revisionId = params.revisionId;
  if (typeof revisionId !== 'string' || !isUuid(revisionId)) return notFoundResponse();

  const result = await approveRevision(revisionId, moderator.id);
  if (result.ok) return jsonResponse({ ok: true }, 200);

  if (result.error === 'not_found') return notFoundResponse();
  if (VALIDATION_ERRORS.has(result.error)) return jsonResponse({ error: result.error }, 422);
  return jsonResponse({ error: result.error }, 500);
};
