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
 *
 * ONE CARVE-OUT (guest play): the practice and presentation-mode pages for a
 * PUBLISHED activity are reachable without signing in — {@link isPublicActivityRoute}
 * — so a teacher's QR/WhatsApp link does not hit the login wall in class.
 * `hasAccess` is the only function that knows about it; `requiresLogin` stays
 * exactly as it was, so the middleware still treats these two routes as
 * "private, no-store" (the rendered page differs by visitor) even though
 * they no longer redirect an anonymous one away.
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
 * Is this one of the two guest-playable activity routes (owner-approved
 * "students can play a shared activity without an account")?
 *
 * Matches, for any `<id>`:
 *   - `/<lang>/ingles/actividades/<id>`             (practice)
 *   - `/<lang>/ingles/actividades/<id>/presentar`   (presentation mode)
 *
 * Does NOT match the catalog (`/<lang>/ingles/actividades`, no `<id>`),
 * `imprimir`, or anything else — those stay fully gated.
 *
 * SHAPE ONLY, same pure/zero-I/O posture as {@link requiresLogin}: whether
 * the activity at `<id>` is actually published is for the PAGE itself to
 * decide (`getPublishedActivity`, which 404s for anything not live, author
 * included) — never here. This keeps the gate a single synchronous check
 * with no per-request database round trip, and it is why an anonymous visit
 * to a draft/pending/rejected activity still collapses to a plain 404
 * (rendered past the gate, not a sign-in redirect) rather than leaking that
 * the id exists.
 *
 * @param pathname - A request path, e.g. `/es/ingles/actividades/abc123`.
 */
export function isPublicActivityRoute(pathname: string): boolean {
  const segments = pathname.split('/');
  if (segments[2] !== 'ingles' || segments[3] !== 'actividades') return false;

  const id = segments[4];
  if (!id) return false; // the catalog itself: /<lang>/ingles/actividades

  if (segments.length === 5) return true; // .../actividades/<id>
  return segments.length === 6 && segments[5] === 'presentar'; // .../<id>/presentar
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
 * Status rules (`status` per `0019_billing_foundation.sql`'s extended
 * vocabulary — active/trialing/canceled/past_due):
 *   - `active`/`trialing`: premium when `current_period_end` is null (a
 *     manual/test grant with no billing cycle) OR still in the future.
 *   - `canceled`/`past_due`: premium ONLY while `current_period_end` is set
 *     AND still in the future — a provider subscription that lapsed or was
 *     canceled with no grace period left is `'free'`, and so is one with no
 *     period end at all (there is nothing to grace into). This is what lets
 *     `src/lib/billing/apply.ts` write `status: 'canceled'` the moment Paddle
 *     cancels a subscription while the customer keeps access through the
 *     period they already paid for, without a separate "access until" field.
 *   - Anything else (no row, an unrecognized status, an expired period): `'free'`.
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
    const status = row.status;
    if (status !== 'active' && status !== 'trialing' && status !== 'canceled' && status !== 'past_due') {
      return 'free';
    }

    const currentPeriodEnd = row.current_period_end;
    const isWithinPeriod =
      typeof currentPeriodEnd === 'string' &&
      !Number.isNaN(Date.parse(currentPeriodEnd)) &&
      Date.parse(currentPeriodEnd) > Date.now();

    if (status === 'active' || status === 'trialing') {
      // null (no end date) is the manual/test-grant shape; anything else
      // must still be in the future.
      return currentPeriodEnd == null || isWithinPeriod ? 'premium' : 'free';
    }

    // canceled / past_due: only a real, still-future period grants access.
    return isWithinPeriod ? 'premium' : 'free';
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
 * A public section is always accessible, signed in or not. The two guest-play
 * activity routes ({@link isPublicActivityRoute}) are accessible to EVERY
 * visitor too — the page itself is what turns an anonymous visit to a
 * non-published activity into a 404, not this gate. Every other gated
 * section defers to {@link isEntitled}.
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
  if (isPublicActivityRoute(pathname)) {
    return true;
  }
  return isEntitled(user);
}
