/**
 * POST /api/ejercicios/[id]/guardar — the authoring save/publish flow (slice
 * 17, design.md §8 "Publish flow"):
 *
 * ```
 * 1. locals.user null                      -> 401
 * 2. row.author_id !== user.id             -> 403
 * 3. parsePayload(raw) === null             -> 422 { code: 'payload_unparseable' }
 * 4. mustValidate && !validate().ok         -> 422 { issues }
 * 5. first publish && !acceptedTerms        -> 422 { code: 'terms_required' }
 * 6. insert/update; 23505 on the slug key   -> retry ONCE with a suffix
 * 7. status='live', published_at ??= now()  -> 200 { ok, slug, url }
 * ```
 *
 * 🔴 UPDATE-ONLY, DELIBERATELY. Step 6 is written as "insert/update" in the
 * design, but `AuthoringSaveInput` (`ExerciseAuthorIsland.tsx`) carries only
 * `{ payload, blocks, publish, acceptedTerms }` — no `skill`/`level`/`focus`/
 * `slug`. Those four columns are `NOT NULL` (`0003_exercises.sql`) and are
 * effectively PERMANENT once chosen (they sit in the public URL and in the
 * `(level, focus, slug)` unique key), so this endpoint never fabricates them
 * on an insert. No slice between 14 and 17 ever added a metadata-picker UI to
 * collect them either. Until that UI exists, an exercise's row — with real
 * `skill`/`level`/`focus`/`slug` — must already exist before an author can
 * reach this endpoint; `crear/[id].astro` (edit an existing row) is the only
 * page wired to it. See this slice's PR/report for the full note.
 *
 * 🔴 OWNERSHIP IS DECIDED SERVER-SIDE, NEVER FROM THE BODY (T3/T4). The row
 * is fetched by `id` alone; `author_id` comes only from the fetched row and
 * is compared against `locals.user.id` (server-verified by middleware via
 * `getUser()`). A non-owner gets 403 — unlike `getExerciseForEdit`'s 404,
 * this is an API contract that has to tell "doesn't exist" apart from
 * "exists but is not yours" so the threat matrix's own T4 wording is
 * satisfiable at all.
 *
 * 🔴 STATUS TRANSITIONS GO THROUGH `canTransition`, NARROWED TO WHAT AN
 * AUTHOR MAY TRIGGER. `canTransition('auditing', 'live')` is structurally
 * legal (design.md §3's table), but the ACTOR for that edge is a moderator,
 * not the author — `canTransition` only encodes the graph, not who may walk
 * it. `AUTHOR_PUBLISHABLE_FROM` is this endpoint's own actor-scoped gate:
 * an author may publish from `draft` or `needs_work` only. `removed` is
 * rejected outright for ANY save, publish or not — it is terminal
 * (`exerciseLifecycle.ts`) and "gone from the author's own workspace too"
 * (`getExercisesByAuthor`'s header).
 *
 * 🔴 NO CSRF CODE HERE, ON PURPOSE — same posture as `/api/reacciones/…` and
 * `/api/auth/signout`: POST-only plus `sameSite: 'lax'` session cookies
 * (`sessionCookieOptions`) is this codebase's whole CSRF defense, and this
 * route adds nothing beyond it.
 *
 * Every response is private/no-store (T7): it is read off `locals.user` and
 * a fetched row, so a shared cache serving it to a different visitor would
 * leak both identity and content.
 */
import type { APIRoute } from 'astro';
import { markPrivate } from '@lib/httpCache';
import { isExerciseId } from '@lib/likes';
import { canTransition, type Status } from '@lib/exerciseLifecycle';
import { parsePayload, type Payload } from '@lib/exercisePayload';
import { validateExercise, type ValidationIssue } from '@lib/exerciseValidator';
import { withCollisionSuffix } from '@lib/exerciseSlug';
import { createServiceClient } from '@lib/supabase';

/** DB table name — must match `supabase/migrations/0003_exercises.sql`. */
const EXERCISES_TABLE = 'exercises';

/** An author may trigger a `-> live` transition only from these states. */
const AUTHOR_PUBLISHABLE_FROM: ReadonlySet<Status> = new Set(['draft', 'needs_work']);

interface Row {
  id: string;
  slug: string;
  skill: string;
  level: string;
  focus: string;
  topic: string | null;
  status: Status;
  payload: unknown;
  author_id: string | null;
  published_at: string | null;
}

interface SaveResponse {
  ok: boolean;
  code?: string;
  issues?: ValidationIssue[];
  slug?: string;
  url?: string;
}

function json(body: SaveResponse, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
}

/** The `AuthoringSaveInput` shape, narrowed from `unknown` request JSON. */
interface SaveInput {
  payload: unknown;
  publish: boolean;
  acceptedTerms: boolean;
}

function isSaveInput(value: unknown): value is SaveInput {
  if (typeof value !== 'object' || value === null) return false;
  const { payload, publish, acceptedTerms } = value as Record<string, unknown>;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof publish === 'boolean' &&
    typeof acceptedTerms === 'boolean'
  );
}

/**
 * Lazily-created service-role client — same posture as `exercises.ts` and
 * `reactions.ts`: created on first use, never at module load, so the app
 * still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset.
 */
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
  // T3: no session, no read, no write — checked before anything else, same
  // rule as `/api/reacciones/[exerciseId]`.
  const user = locals.user;
  if (!user) {
    return json({ ok: false }, 401);
  }

  const id = params.id;
  if (!isExerciseId(id)) {
    return notFound();
  }

  const client = getClient();
  if (!client) {
    return json({ ok: false, code: 'save_unavailable' }, 503);
  }

  const { data, error: fetchError } = await client
    .from(EXERCISES_TABLE)
    .select('id, slug, skill, level, focus, topic, status, payload, author_id, published_at')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('[guardar] row fetch failed:', fetchError.message);
    return json({ ok: false, code: 'save_failed' }, 500);
  }
  if (!data) {
    return notFound();
  }

  const row = data as unknown as Row;

  // T4: the row exists, but it is not this caller's — 403, and nothing is
  // written. Ownership is decided from the FETCHED row, never from the body.
  if (row.author_id !== user.id) {
    return json({ ok: false, code: 'forbidden' }, 403);
  }

  // Terminal in v1 (`exerciseLifecycle.ts`) and out of the author's own
  // workspace (`getExercisesByAuthor`'s header) — no save of any kind
  // reaches a `removed` row through this endpoint.
  if (row.status === 'removed') {
    return json({ ok: false, code: 'exercise_removed' }, 409);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: 'bad_request' }, 400);
  }
  if (!isSaveInput(body)) {
    return json({ ok: false, code: 'bad_request' }, 400);
  }

  // Step 3: `parsePayload` is the one gate that turns untrusted `unknown`
  // into a `Payload` this endpoint can store and validate.
  const parsedPayload: Payload | null = parsePayload(body.payload);
  if (!parsedPayload) {
    return json({ ok: false, code: 'payload_unparseable' }, 422);
  }

  // Step 4: validation is required whenever the row is, or is about to
  // become, publicly visible (design.md §7).
  const mustValidate = body.publish || row.status !== 'draft';
  if (mustValidate) {
    const result = validateExercise({
      skill: row.skill,
      level: row.level,
      focus: row.focus,
      slug: row.slug,
      payload: parsedPayload,
    });
    if (!result.ok) {
      return json({ ok: false, issues: result.issues }, 422);
    }
  }

  // "First publish" is tied to `published_at`, not to the current status —
  // a `needs_work` -> `live` republish already accepted terms once and must
  // not be asked again.
  const isFirstPublish = body.publish && row.published_at === null;
  if (isFirstPublish && !body.acceptedTerms) {
    return json({ ok: false, code: 'terms_required' }, 422);
  }

  // Step 6/7: resolve the transition an author may actually request. Already
  // `live` and publishing again is a harmless no-op, not a transition; any
  // OTHER state moving to `live` must be one this actor is allowed to walk.
  let nextStatus: Status = row.status;
  if (body.publish) {
    const isTransition = row.status !== 'live';
    if (isTransition && (!AUTHOR_PUBLISHABLE_FROM.has(row.status) || !canTransition(row.status, 'live'))) {
      return json({ ok: false, code: 'invalid_transition' }, 409);
    }
    nextStatus = 'live';
  }

  const publishedAt =
    nextStatus === 'live' && row.published_at === null ? new Date().toISOString() : null;

  const userId = user.id;

  async function attemptUpdate(slug: string): Promise<{ error: { code?: string; message: string } | null }> {
    const update: Record<string, unknown> = {
      payload: parsedPayload,
      status: nextStatus,
      slug,
      updated_by: userId,
    };
    if (publishedAt) update.published_at = publishedAt;

    return client!
      .from(EXERCISES_TABLE)
      .update(update)
      .eq('id', id)
      .eq('author_id', userId);
  }

  let finalSlug = row.slug;
  let { error: updateError } = await attemptUpdate(finalSlug);

  // Slug collisions: try verbatim, retry ONCE with a random suffix on a
  // `23505` (`UNIQUE(level, focus, slug)`), give up after the second.
  if (updateError?.code === '23505') {
    finalSlug = withCollisionSuffix(row.slug);
    ({ error: updateError } = await attemptUpdate(finalSlug));
    if (updateError?.code === '23505') {
      return json({ ok: false, code: 'slug_collision_unresolved' }, 422);
    }
  }

  if (updateError) {
    console.error('[guardar] update failed:', updateError.message);
    return json({ ok: false, code: 'save_failed' }, 500);
  }

  const url = `/ingles/${row.level}/${row.focus}/${finalSlug}`;
  return json({ ok: true, slug: finalSlug, url }, 200);
};
