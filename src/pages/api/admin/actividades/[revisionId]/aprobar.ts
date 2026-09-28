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
import { markPrivate } from '@lib/httpCache';
import { requireRole } from '@lib/roles';
import { isUuid } from '@lib/activities/paths';
import { approveRevision } from '@lib/activities/moderation';

function json(body: Record<string, unknown>, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
}

/** `approveRevision`'s error codes that mean "the request itself was bad", never a server fault. */
const VALIDATION_ERRORS: ReadonlySet<string> = new Set(['not_pending', 'invalid_blocks', 'foreign_upload']);

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const moderator = await requireRole(user, 'moderator');
  if (!moderator) return notFound();

  const revisionId = params.revisionId;
  if (typeof revisionId !== 'string' || !isUuid(revisionId)) return notFound();

  const result = await approveRevision(revisionId, moderator.id);
  if (result.ok) return json({ ok: true }, 200);

  if (result.error === 'not_found') return notFound();
  if (VALIDATION_ERRORS.has(result.error)) return json({ error: result.error }, 422);
  return json({ error: result.error }, 500);
};
