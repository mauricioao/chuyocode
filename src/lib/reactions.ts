/**
 * Server-only reaction upsert data layer (slice 9, design.md §4 "API").
 *
 * Backs `POST /api/reacciones/[exerciseId]`. Identity-backed by design —
 * unlike `exercise_likes` (0005), which is anonymous and untouched — so a
 * reaction is keyed by the AUTHENTICATED user's id, never a cookie.
 *
 * Writes go through the service-role client, the same as `likes.ts` and
 * `roles.ts`: `exercise_reactions` has RLS enabled with ZERO public policies
 * (`0009_exercise_reactions.sql`), so the anon/session client cannot write it
 * at all — only `service_role` (BYPASSRLS plus the explicit table grants that
 * migration adds) reaches it. The caller's identity already comes from
 * `Locals.user` (server-verified by middleware via `getUser()`); this module
 * only needs that id, never the request's own session client.
 *
 * ONE ROW PER (user_id, exercise_id), enforced twice: the unique constraint at
 * the database is the source of truth, and `upsertReaction` always upserts on
 * it (`onConflict: 'user_id,exercise_id'`) so changing an existing reaction
 * updates in place rather than racing a second insert into that constraint.
 *
 * FAIL-SAFE, without exception, mirroring `likes.ts`: `upsertReaction` never
 * throws. A Supabase outage or an unconfigured service-role key both collapse
 * to `false`, which the endpoint reports as `{ ok: false }` rather than a 500
 * — a reaction is not on the critical path of grading an exercise.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';

/** DB table name — must match `supabase/migrations/0009_exercise_reactions.sql`. */
export const EXERCISE_REACTIONS_TABLE = 'exercise_reactions';

/** The closed vocabulary of reaction kinds, mirroring the table's CHECK. */
export const REACTION_KINDS = ['like', 'dislike'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/**
 * The dislike reason taxonomy, mirroring `is_quality_dislike` /
 * `is_too_hard_dislike` in `0009_exercise_reactions.sql`. The SQL copy is the
 * authoritative one (it is what the threshold trigger evaluates); this list
 * exists so the endpoint can reject an invalid reason before ever reaching
 * the database.
 */
export const DISLIKE_REASONS = ['ambiguous', 'wrong_answer', 'too_hard', 'typo'] as const;
export type DislikeReason = (typeof DISLIKE_REASONS)[number];

function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === 'string' && (REACTION_KINDS as readonly string[]).includes(value);
}

function isDislikeReason(value: unknown): value is DislikeReason {
  return typeof value === 'string' && (DISLIKE_REASONS as readonly string[]).includes(value);
}

/** A reaction, exactly as the endpoint's request body must shape it. */
export interface ReactionInput {
  kind: ReactionKind;
  reason?: DislikeReason;
}

/**
 * Is `value` a well-formed reaction? Mirrors
 * `exercise_reactions_reason_pairing` (0009): a dislike MUST carry a
 * taxonomy reason, a like MUST NOT carry one. Checked here so a malformed
 * body is rejected before any round trip, exactly like `isExerciseId` in
 * `likes.ts`.
 */
export function isValidReaction(value: unknown): value is ReactionInput {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, reason } = value as Record<string, unknown>;
  if (!isReactionKind(kind)) return false;
  if (kind === 'dislike') return isDislikeReason(reason);
  return reason === undefined || reason === null;
}

/**
 * Lazily-created service-role client. Created on first use (not module load)
 * so the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset —
 * reactions simply become no-ops until the key is configured.
 */
let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

/**
 * Upsert `userId`'s reaction to `exerciseId`. Returns `true` on a confirmed
 * write, `false` on ANY failure — never throws.
 *
 * `updated_at` is set explicitly rather than relied on as a column default:
 * the default only applies on INSERT, and changing an existing reaction
 * (`typo` -> `ambiguous`) is an UPDATE via the upsert's conflict branch.
 */
export async function upsertReaction(
  userId: string,
  exerciseId: string,
  reaction: ReactionInput,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.from(EXERCISE_REACTIONS_TABLE).upsert(
      {
        user_id: userId,
        exercise_id: exerciseId,
        kind: reaction.kind,
        reason: reaction.kind === 'dislike' ? reaction.reason : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,exercise_id' },
    );

    if (error) {
      console.error('[reactions] upsertReaction failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[reactions] upsertReaction threw:', err);
    return false;
  }
}

/**
 * Reset the lazily-created service client. Primarily for test isolation: it
 * is a module-level singleton, so a test that configures a key would
 * otherwise leak the live client into a later "unconfigured key" test.
 */
export function clearReactionsClient(): void {
  serviceClient = null;
}
