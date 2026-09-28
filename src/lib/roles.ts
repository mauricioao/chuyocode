/**
 * Server-only role assignment and authorization (design.md §5, `0008_user_roles.sql`).
 *
 * Backs the four moderation surfaces (`/[lang]/moderacion/**` and
 * `/api/moderacion/**`). Reads go through the service-role client because
 * `user_roles` has RLS enabled with no public policies, exactly like
 * `exercises` and `exercise_likes` — the anon key gets nothing.
 *
 * 🔴 FAILS CLOSED — THE INVERSE OF THE HOUSE IDIOM. Every other read-path
 * module in this codebase (`exercises.ts`, `likes.ts`) fails OPEN: a Supabase
 * outage collapses to an empty/`null` result and the caller renders a blank
 * or a 404, because the worst case is a page with nothing on it. That idiom
 * is deliberately inverted HERE: if a role check cannot be answered, the
 * answer is DENIAL, never "no roles found, so no problem". Fail-open on a
 * role check would mean an outage silently OPENS the moderation dashboard and
 * every moderation endpoint to every signed-in user — worse than the outage
 * itself. So `getUserRoles` still returns `readonly Role[]` (never throws),
 * but an error, a thrown client, or an unconfigured key all collapse to `[]`
 * — the one shape that both `hasRole` and `requireRole` read as "deny".
 *
 * NO ROUND TRIP ON HOT PATHS. Nothing here runs in `src/middleware.ts`; only
 * `requireRole` calls `hasRole`, and only the moderation surfaces call
 * `requireRole`, so an ordinary exercise page pays zero role queries.
 *
 * NO CACHE, ON PURPOSE. A role change takes effect on the very next request
 * because nothing here remembers an answer across calls. An in-memory TTL
 * cache was considered and rejected: it would reintroduce exactly the
 * staleness window that already disqualified a JWT custom claim, while
 * hiding that window behind a cache that looks fresh.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';

/** DB table name — must match `supabase/migrations/0008_user_roles.sql`. */
export const USER_ROLES_TABLE = 'user_roles';

/**
 * The closed vocabulary of assignable roles. `supabase/migrations/0008_user_roles.sql`
 * enforces the same domain at the database (`check (role in ('moderator'))`),
 * so a role that could never be granted can also never be checked for.
 */
export const ROLES = ['moderator'] as const;
export type Role = (typeof ROLES)[number];

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Lazily-created service-role client. Created on first use (not module load)
 * so the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset — role
 * checks simply become no-ops (which, per the fail-closed contract above,
 * means every check DENIES).
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
 * Every role granted to `userId`, or `[]` — for "has none" AND for "the
 * check failed and we must deny". The two are indistinguishable on purpose:
 * `hasRole` and `requireRole` need exactly one signal to refuse access, and a
 * caller that could tell them apart would be tempted to treat "unknown" as
 * "probably fine", which is the one behavior this module exists to prevent.
 */
export async function getUserRoles(userId: string): Promise<readonly Role[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(USER_ROLES_TABLE)
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.error('[roles] getUserRoles failed:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.flatMap((raw): Role[] => {
      const row = raw as unknown as Record<string, unknown>;
      return isRole(row?.role) ? [row.role] : [];
    });
  } catch (err) {
    console.error('[roles] getUserRoles threw:', err);
    return [];
  }
}

/** Does `userId` currently hold `role`? Denies on any failure (see header). */
export async function hasRole(userId: string, role: Role): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.includes(role);
}

/**
 * The route guard every moderation surface calls: the caller's own `User` on
 * success, `null` on ANY denial — no session, wrong role, or a failed check.
 * Callers do not need to (and must not try to) tell those apart; each one is
 * the same "not authorized" response (design.md §5's 404/401/403 table).
 *
 * `user` is `Locals.user` verbatim (never re-derived here), so this never
 * queries Supabase for a request that was never signed in — a role check for
 * `null` would be a wasted round trip guaranteed to deny anyway.
 */
export async function requireRole(
  user: User | null,
  role: Role,
): Promise<User | null> {
  if (!user) return null;
  const allowed = await hasRole(user.id, role);
  return allowed ? user : null;
}

/**
 * Reset the lazily-created service client. Primarily for test isolation: it
 * is a module-level singleton, so a test that configures a key would
 * otherwise leak the live client into a later "unconfigured key" test.
 */
export function clearRolesClient(): void {
  serviceClient = null;
}
