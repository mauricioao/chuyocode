/**
 * `POST /api/actividades/[id]/enviar` — submit an activity's latest DRAFT
 * revision for moderator review (PR D, "Activities practice"). Approval
 * itself is PR E — this endpoint only moves a revision/activity into the
 * `pending_review` state and records the author's rights confirmation:
 *
 * ```
 * 1. locals.user null                            -> 401
 * 2. malformed id                                -> 404
 * 3. no row at (id, author_id=caller)             -> 404 (never 403 — see
 *    guardar.ts's header for why: an activity id is not a fact this
 *    endpoint may confirm to a stranger)
 * 4. bad JSON / wrong shape                       -> 400
 * 5. acceptedRights !== true                      -> 422 { error: 'rights_required' }
 * 6. no revision exists at all (invariant broken) -> 500 { error: 'submit_failed' }
 * 7. latest revision already pending_review       -> 200 { ok: true }, NO writes
 *    (idempotent: a second click, or a race with an
 *    already-in-flight submit, changes nothing)
 * 8. latest revision is neither draft nor pending  -> 422 { error: 'no_draft' }
 *    (approved/rejected/superseded with no edit
 *    since — there is nothing new to send)
 * 9. activity title empty or the untranslated      -> 422 { error: 'invalid_title' }
 *    "Sin título"/"Untitled" placeholder
 * 10. parseBlocks(latest revision.blocks) === null -> 422 { error: 'invalid_blocks' }
 * 11. zero blocks                                  -> 422 { error: 'no_blocks' }
 * 12. a worksheet block with zero zones            -> 422 { error: 'missing_zones' }
 * 13. mark the revision pending_review, stamp       -> UPDATE activity_revisions
 *     rights_accepted_at = now()
 * 14. activity.status is draft/rejected            -> UPDATE activities.status
 *     = 'pending_review'; if it is already `live`,
 *     it STAYS live — the published revision keeps
 *     serving while the pending one awaits review
 *     (0011 migration's own lifecycle comment)
 * 15. any DB failure                               -> 500 { error: 'submit_failed' }
 * 16. success                                      -> 200 { ok: true }
 * ```
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { UI_LABELS } from '@lib/i18n';
import { parseBlocks } from '@lib/activities/blocks';
import { isUuid } from '@lib/activities/paths';
import { createServiceClient } from '@lib/supabase';

const ACTIVITIES_TABLE = 'activities';
const ACTIVITY_REVISIONS_TABLE = 'activity_revisions';

/** The untranslated default title (`UI_LABELS[lang].activities.untitledTitle`), in every locale. */
const PLACEHOLDER_TITLES: ReadonlySet<string> = new Set(
  (['es', 'en'] as const).map((lang): string => UI_LABELS[lang].activities.untitledTitle),
);

interface EnviarResponse {
  ok?: boolean;
  error?: string;
}

function json(body: EnviarResponse, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
}

interface EnviarInput {
  acceptedRights: unknown;
}

function isEnviarInput(value: unknown): value is EnviarInput {
  if (typeof value !== 'object' || value === null) return false;
  return 'acceptedRights' in value;
}

let serviceClient: ReturnType<typeof createServiceClient> | null = null;
function getClient(): ReturnType<typeof createServiceClient> | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) {
    return notFound();
  }

  const client = getClient();
  if (!client) {
    return json({ error: 'submit_unavailable' }, 503);
  }

  // Ownership enforced IN THE QUERY — same 404-for-both posture as `guardar.ts`.
  const { data: activityData, error: activityError } = await client
    .from(ACTIVITIES_TABLE)
    .select('id, title, status')
    .eq('id', id)
    .eq('author_id', user.id)
    .neq('status', 'removed')
    .maybeSingle();

  if (activityError) {
    console.error('[enviar] activity fetch failed:', activityError.message);
    return json({ error: 'submit_failed' }, 500);
  }
  if (!activityData) {
    return notFound();
  }
  const activity = activityData as unknown as { id: string; title: string; status: string };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!isEnviarInput(body)) {
    return json({ error: 'bad_request' }, 400);
  }
  if (body.acceptedRights !== true) {
    return json({ error: 'rights_required' }, 422);
  }

  const { data: revisionData, error: revisionFetchError } = await client
    .from(ACTIVITY_REVISIONS_TABLE)
    .select('id, status, blocks')
    .eq('activity_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (revisionFetchError) {
    console.error('[enviar] revision fetch failed:', revisionFetchError.message);
    return json({ error: 'submit_failed' }, 500);
  }
  if (!revisionData) {
    // Every activity gets a first draft revision at creation time
    // (`createActivity`) — a missing one is a broken invariant, not a
    // request the caller can fix.
    console.error('[enviar] no revision found for activity id:', id);
    return json({ error: 'submit_failed' }, 500);
  }
  const revision = revisionData as unknown as { id: string; status: string; blocks: unknown };

  // Idempotent: a second submit while one is already pending changes nothing.
  if (revision.status === 'pending_review') {
    return json({ ok: true }, 200);
  }
  if (revision.status !== 'draft') {
    // approved / rejected / superseded, with no edit since — there is
    // nothing new for a moderator to look at.
    return json({ error: 'no_draft' }, 422);
  }

  const title = activity.title.trim();
  if (title.length === 0 || PLACEHOLDER_TITLES.has(title)) {
    return json({ error: 'invalid_title' }, 422);
  }

  const blocks = parseBlocks(revision.blocks);
  if (!blocks) {
    return json({ error: 'invalid_blocks' }, 422);
  }
  if (blocks.length === 0) {
    return json({ error: 'no_blocks' }, 422);
  }
  const hasEmptyWorksheet = blocks.some((block) => block.type === 'worksheet' && block.zones.length === 0);
  if (hasEmptyWorksheet) {
    return json({ error: 'missing_zones' }, 422);
  }

  const { error: revisionUpdateError } = await client
    .from(ACTIVITY_REVISIONS_TABLE)
    .update({ status: 'pending_review', rights_accepted_at: new Date().toISOString() })
    .eq('id', revision.id);

  if (revisionUpdateError) {
    console.error('[enviar] revision update failed:', revisionUpdateError.message);
    return json({ error: 'submit_failed' }, 500);
  }

  if (activity.status === 'draft' || activity.status === 'rejected') {
    const { error: activityUpdateError } = await client
      .from(ACTIVITIES_TABLE)
      .update({ status: 'pending_review', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('author_id', user.id);

    if (activityUpdateError) {
      console.error('[enviar] activity update failed:', activityUpdateError.message);
      return json({ error: 'submit_failed' }, 500);
    }
  }
  // `live` stays live — the published revision keeps serving while the
  // fresh pending one awaits review (0011 migration's own lifecycle rule).

  return json({ ok: true }, 200);
};
