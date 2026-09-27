/**
 * Access model for gated sections (Login step 1).
 *
 * The site is becoming a Wordwall-style platform: Libros and Noticias stay
 * PUBLIC, while Inglés (`/[lang]/ingles/**`) and Cursos (`/[lang]/cursos/**`,
 * no pages yet — the rule is reserved ahead of them) require a signed-in
 * visitor today, and will require an active paid subscription later.
 *
 * Kept as two pure, zero-I/O functions so the gate is unit-testable without a
 * request/response round trip, and so the single spot a future subscription
 * check replaces is obvious rather than scattered across every gated route.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';

/** Section slugs that require login (and later, a subscription). */
const GATED_SECTIONS = ['ingles', 'cursos'] as const;

/**
 * Does this path belong to a gated section?
 *
 * True for `/<lang>/ingles`, `/<lang>/cursos`, and anything nested under
 * either — the third path segment (`pathname.split('/')[2]`) names the
 * section, and the lang segment before it is never inspected: this predicate
 * does not care whether the lang is valid, only whether the section is
 * gated. A section name that merely starts with `ingles`/`cursos`
 * (`/es/inglesx`) does not match, because the split compares the whole
 * segment, not a prefix.
 *
 * @param pathname - A request path, e.g. `/es/ingles/A1/present-simple`.
 */
export function requiresLogin(pathname: string): boolean {
  const section = pathname.split('/')[2];
  return (GATED_SECTIONS as readonly string[]).includes(section ?? '');
}

/**
 * The plans a signed-in visitor may be on.
 *
 * `'premium'` mirrors the closed vocabulary `supabase/migrations/0010_user_subscriptions.sql`
 * enforces at the database (`check (plan in ('premium'))`) — a plan that
 * could never be granted can also never be checked for.
 */
export type Plan = 'free' | 'premium';

/** DB table name — must match `supabase/migrations/0010_user_subscriptions.sql`. */
export const USER_SUBSCRIPTIONS_TABLE = 'user_subscriptions';

/**
 * Lazily-created service-role client. Created on first use (not module load)
 * so the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset — plan
 * checks simply become no-ops (which, per the fail-closed contract below,
 * means every check answers `'free'`, the lower plan).
 *
 * Mirrors `src/lib/roles.ts`'s `getClient` exactly: its own module-level
 * singleton, so a test that configures a key would otherwise leak the live
 * client into a later "unconfigured key" test (hence {@link clearAccessClient}).
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
 * Which plan a signed-in visitor is on.
 *
 * 🔴 FAILS CLOSED to `'free'` — the lower plan — on ANY failure: no client,
 * no row, a Supabase error, or a thrown client, exactly the inverse of
 * `exercises.ts`/`likes.ts`'s fail-OPEN idiom and the same posture
 * `src/lib/roles.ts#getUserRoles` takes for role checks. The worst case of
 * failing open here would be granting premium content to a visitor an outage
 * could not actually verify; failing closed only ever costs a visitor a badge
 * they were, in fact, entitled to.
 *
 * A row counts as premium when `status = 'active'` AND (`current_period_end`
 * is null — a manual/test grant with no billing cycle — OR still in the
 * future). A canceled/past_due row, an expired one, or no row at all is
 * `'free'`.
 *
 * @param user - A signed-in caller, or `null` for an anonymous visitor —
 *   resolved to `'free'` immediately, with no round trip, mirroring
 *   `requireRole`'s null short-circuit.
 */
export async function getPlan(user: Pick<User, 'id'> | null): Promise<Plan> {
  if (!user) return 'free';

  const client = getClient();
  if (!client) return 'free';

  try {
    const { data, error } = await client
      .from(USER_SUBSCRIPTIONS_TABLE)
      .select('status, current_period_end')
      .eq('user_id', user.id);

    if (error) {
      console.error('[access] getPlan failed:', error.message);
      return 'free';
    }
    if (!Array.isArray(data) || data.length === 0) {
      return 'free';
    }

    const row = data[0] as unknown as Record<string, unknown>;
    if (row.status !== 'active') {
      return 'free';
    }

    const currentPeriodEnd = row.current_period_end;
    if (typeof currentPeriodEnd === 'string') {
      const end = Date.parse(currentPeriodEnd);
      if (!Number.isNaN(end) && end <= Date.now()) {
        return 'free';
      }
    }

    return 'premium';
  } catch (err) {
    console.error('[access] getPlan threw:', err);
    return 'free';
  }
}

/**
 * Reset the lazily-created service client. Primarily for test isolation: it
 * is a module-level singleton, so a test that configures a key would
 * otherwise leak the live client into a later "unconfigured key" test.
 */
export function clearAccessClient(): void {
  serviceClient = null;
}

/**
 * The one function body a future subscription check replaces.
 *
 * Today: signed in is the whole entitlement. Tomorrow: signed in AND an
 * active paid subscription. Every caller of {@link hasAccess} stays
 * unchanged when that day comes — only this body's `return` changes, to a
 * lookup keyed on `user.id`.
 */
function isEntitled(user: Pick<User, 'id'> | null): boolean {
  return user !== null;
}

/**
 * May this visitor see this path?
 *
 * A public section is always accessible, signed in or not. A gated section
 * defers to {@link isEntitled}.
 *
 * @param user - The server-verified caller from `Astro.locals.user`, or
 *   `null` for an anonymous visitor.
 * @param pathname - The request path being checked.
 */
export function hasAccess(
  user: Pick<User, 'id'> | null,
  pathname: string,
): boolean {
  if (!requiresLogin(pathname)) {
    return true;
  }
  return isEntitled(user);
}
