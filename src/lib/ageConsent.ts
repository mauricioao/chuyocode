/**
 * Age/legal consent (Ley N° 29733 — `TermsContent.astro` §2 / `PrivacyContent.astro`
 * §4). Peru's data-protection law requires prior consent from a parent or
 * guardian before processing a minor's (under 14) personal data; this module
 * owns the one durable record of "an adult account holder agreed to this."
 *
 * This file owns three things:
 *  - the durable RECORD shape and where it lives (`app_metadata.ageConsent`,
 *    written only by the server through the service-role client — never
 *    `user_metadata`, which the visitor can edit themselves);
 *  - the pure predicate that reads it back ({@link hasRecordedConsent});
 *  - which routes the consent-screen gate in `src/middleware.ts` must never
 *    touch ({@link isConsentExemptPath}) — the public pages, the two
 *    guest-play activity routes, and the auth/legal routes themselves, so
 *    nothing that was reachable before this feature becomes gated by it and
 *    the gate can never loop against its own screen.
 *
 * 🔴 WHY `app_metadata`, NOT A TABLE. `app_metadata` is already read back for
 * free on every request: `src/middleware.ts` resolves `context.locals.user`
 * through `getUser()`, which (unlike `getSession()`) always asks the Supabase
 * Auth server for the CURRENT row rather than decoding a possibly-stale local
 * JWT — see that module's own header on why `getUser()` is the only identity
 * source this codebase trusts, and see {@link recordAgeConsent}'s own note on
 * why that same fact means there is no "stale JWT" loop to guard against
 * here. A field on that same row costs nothing extra to read; a table would
 * cost one more round trip on every gated request. Writing it is already
 * available too: `createServiceClient()` (`@lib/supabase`) is the same
 * privileged client `src/lib/accountDeletion.ts` already uses for
 * `auth.admin.deleteUser`, and `auth.admin.updateUserById` is its sibling.
 * Deleting the account deletes this field for free — it lives on the
 * `auth.users` row itself, so there is no cascade to write, unlike a table
 * would need.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';
import { isPublicActivityRoute } from './access';

/** Bumped only if the consent WORDING itself changes materially. */
export const AGE_CONSENT_VERSION = 'v1';

/** The durable shape recorded at `app_metadata.ageConsent`. */
export interface AgeConsentRecord {
  /** ISO-8601 timestamp of acceptance. */
  acceptedAt: string;
  /** {@link AGE_CONSENT_VERSION} at the moment of acceptance. */
  version: string;
}

/**
 * Has this signed-in visitor already recorded consent?
 *
 * Pure and defensive: any shape other than a string `acceptedAt` (absent
 * `app_metadata`, an absent key, or a malformed value) reads as "not
 * recorded" rather than throwing. The gate built on this fails CLOSED on
 * that — missing or ambiguous consent redirects to the consent screen — the
 * opposite of `src/middleware.ts`'s own identity resolution, and
 * deliberately so: that module answers "who is this?" (failing open costs
 * one visitor a session an outage could not verify); this one answers "may
 * they use a signed-in-only section without having agreed?" (failing open
 * would let that section run unconsented).
 */
export function hasRecordedConsent(
  user: Pick<User, 'app_metadata'> | null | undefined,
): boolean {
  const consent = user?.app_metadata?.ageConsent as
    | Partial<AgeConsentRecord>
    | null
    | undefined;
  return typeof consent?.acceptedAt === 'string';
}

/**
 * Sections the consent gate must NEVER touch (owner-approved allowlist):
 * home, Libros, Noticias, Créditos, Premium, and the legal/auth routes
 * themselves — `auth` covers both the sign-in/sign-up page and the consent
 * screen it would otherwise loop against. The two guest-play activity routes
 * are handled separately below via {@link isPublicActivityRoute} — they sit
 * UNDER `ingles`, which is otherwise gated.
 */
const CONSENT_PUBLIC_SECTIONS = [
  'libros',
  'noticias',
  'creditos',
  'premium',
  'legal',
  'auth',
] as const;

/**
 * Is `pathname` exempt from the age-consent gate?
 *
 * Same shape-only, zero-I/O posture as `@lib/access`'s `requiresLogin`: the
 * THIRD path segment (`pathname.split('/')[2]`) names the section, the lang
 * segment before it is never inspected, and an absent segment (the
 * lang-prefixed home page, `/<lang>/` or `/<lang>`) is exempt too.
 *
 * Deliberately an ALLOWLIST, not the inverse of `requiresLogin`'s
 * `GATED_SECTIONS`: a section `requiresLogin` has never heard of (`crear`,
 * `mis-actividades`, `admin`) is signed-in-only IN INTENT even though today's
 * login gate never enforces it at the middleware level — each of those pages
 * checks `Astro.locals.user` itself instead (see `@lib/access`'s own header).
 * The consent gate still must catch a signed-in, non-consented visitor
 * there; an inverse of `GATED_SECTIONS` would miss every one of them.
 *
 * @param pathname - A request path, e.g. `/es/ingles/A1/present-simple`.
 */
export function isConsentExemptPath(pathname: string): boolean {
  if (isPublicActivityRoute(pathname)) {
    return true;
  }
  const section = pathname.split('/')[2];
  if (!section) {
    return true; // home: /<lang> or /<lang>/
  }
  return (CONSENT_PUBLIC_SECTIONS as readonly string[]).includes(section);
}

/**
 * Lazily-created service-role client. Created on first use, not module load,
 * so the app still boots with `SUPABASE_SERVICE_ROLE_KEY` unset — same
 * pattern as `@lib/access`'s and `@lib/accountDeletion`'s own `getClient`,
 * including the module-level singleton {@link clearAgeConsentClient} resets
 * for test isolation.
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

/** Reset the lazily-created service client. Test isolation only. */
export function clearAgeConsentClient(): void {
  serviceClient = null;
}

/**
 * Durably record this user's age/legal consent — the ONLY writer of
 * `app_metadata.ageConsent` in this codebase (never trust a client-supplied
 * value for this field; both call sites re-derive `userId` from their own
 * server-verified `getUser()` call, never from request input).
 *
 * 🔴 THE CALLER'S CURRENT `app_metadata` IS SPREAD BEFORE WRITING,
 * DELIBERATELY. Other keys already live there (`provider`/`providers`, set
 * by Supabase itself on every sign-up/identity link). Whether
 * `auth.admin.updateUserById` merges or replaces `app_metadata` server-side
 * is not a contract this file is willing to bet on — spreading the caller's
 * already-known current value first makes this correct either way, at the
 * cost of one extra parameter instead of one extra round trip to re-fetch it.
 *
 * Fails closed to `false` on a missing service-role key, a Supabase error, or
 * a thrown client — logged server-side, never surfaced to the caller. Both
 * call sites (the sign-up endpoint and the standalone consent endpoint) treat
 * a `false` result as non-fatal: the signed-in visitor simply still has no
 * recorded consent afterward, and `src/middleware.ts`'s gate asks again the
 * next time they reach a signed-in-only section — the same safety net that
 * already has to exist for an EXISTING account nobody ever asked.
 *
 * @param userId - The signed-in visitor's id.
 * @param currentAppMetadata - Their CURRENT `app_metadata`, from the same
 *   `getUser()` call the caller already made.
 */
export async function recordAgeConsent(
  userId: string,
  currentAppMetadata: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const record: AgeConsentRecord = {
    acceptedAt: new Date().toISOString(),
    version: AGE_CONSENT_VERSION,
  };

  try {
    const { error } = await client.auth.admin.updateUserById(userId, {
      app_metadata: { ...(currentAppMetadata ?? {}), ageConsent: record },
    });
    if (error) {
      console.error('[ageConsent] updateUserById failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ageConsent] updateUserById threw:', err);
    return false;
  }
}
