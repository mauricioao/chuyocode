/**
 * `POST /api/actividades/[id]/eliminar` — soft-delete an activity (PR D,
 * "Activities practice"). Mirrors `guardar.ts`'s ownership posture exactly:
 *
 * ```
 * 1. locals.user null                    -> 401
 * 2. malformed id                        -> 404
 * 3. no row at (id, author_id=caller)     -> 404 (never 403 — see guardar.ts's
 *    header)
 * 4. activities.status = 'removed'       -> UPDATE
 * 5. update failure                      -> 500 { error: 'delete_failed' }
 * 6. success                             -> 200 { ok: true }
 * ```
 *
 * `removed` is terminal (0011 migration's own lifecycle comment) and is
 * already excluded from every author-facing read (`getActivityForEdit`,
 * `getActivitiesByAuthor`) and from the public feed (`visible` is generated
 * from `status = 'live'`), so no other table needs touching here — a
 * `removed` activity simply stops being reachable anywhere.
 *
 * Every response is private/no-store (T7).
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { isUuid } from '@lib/activities/paths';
import { createServiceClient } from '@lib/supabase';

const ACTIVITIES_TABLE = 'activities';

interface EliminarResponse {
  ok?: boolean;
  error?: string;
}

function json(body: EliminarResponse, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
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

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const id = params.id;
  if (typeof id !== 'string' || !isUuid(id)) {
    return notFound();
  }

  const client = getClient();
  if (!client) {
    return json({ error: 'delete_unavailable' }, 503);
  }

  // Ownership enforced IN THE QUERY — same 404-for-both posture as `guardar.ts`.
  const { data: activityData, error: activityError } = await client
    .from(ACTIVITIES_TABLE)
    .select('id')
    .eq('id', id)
    .eq('author_id', user.id)
    .neq('status', 'removed')
    .maybeSingle();

  if (activityError) {
    console.error('[eliminar] activity fetch failed:', activityError.message);
    return json({ error: 'delete_failed' }, 500);
  }
  if (!activityData) {
    return notFound();
  }

  const { error: updateError } = await client
    .from(ACTIVITIES_TABLE)
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', user.id);

  if (updateError) {
    console.error('[eliminar] update failed:', updateError.message);
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ ok: true }, 200);
};
