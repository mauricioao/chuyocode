/**
 * POST /api/auth/consentimiento — Login step 2's durable write (Ley N° 29733:
 * processing a minor's data requires prior parent/guardian consent;
 * `TermsContent.astro` §2 / `PrivacyContent.astro` §4). Records that THIS
 * signed-in account holder affirmed the owner-approved sentence, through
 * `@lib/ageConsent#recordAgeConsent` (`app_metadata.ageConsent`, server-only).
 *
 * Reached from two places:
 *  - `src/pages/[lang]/auth/consentimiento.astro`'s `ConsentForm` island, the
 *    normal path — Google sign-in, any OTHER account with no recorded
 *    consent (including an existing user who signed up before this feature
 *    existed), and `src/middleware.ts`'s consent gate all land here.
 *  - Nowhere else: the sign-up checkbox (`PasswordAuthForm`) records consent
 *    itself, inline in `POST /api/auth/password`'s `signup` action, for the
 *    single request that just created the session — this endpoint is for
 *    every OTHER signed-in visitor who still lacks a recorded consent.
 *
 * 🔴 SIGNED-IN ONLY. Unlike `password.ts`/`signin.ts`, this endpoint is never
 * handed an arbitrary email — it acts on the CALLER's own server-verified
 * identity (`getUser()`, never request input), so there is no T3 enumeration
 * concern here and a plain 401 is correct.
 *
 * 🔴 `application/json` ONLY. A cross-site `<form enctype="text/plain">` can
 * set its BODY to look exactly like valid JSON (`{"consent":true}`) while
 * carrying `Content-Type: text/plain` — `request.json()` would happily parse
 * that text regardless of the header, so the header is checked EXPLICITLY,
 * before the body is ever read, rather than trusted to a parse failure.
 * `sameSite: 'lax'` cookies already block an ordinary cross-SITE POST from
 * carrying this visitor's session at all, but this check is the one barrier
 * that still holds for a cross-ORIGIN, same-SITE form (e.g. a compromised or
 * future subdomain), which Lax alone does not stop.
 *
 * 🔴 IDEMPOTENT. Calling this twice (a retried submit, a stale double-click)
 * simply records consent again with a fresh timestamp and returns the same
 * `{ ok: true }` — there is no "already recorded" error path to race against.
 *
 * Every response is `private, no-store` (T7): identity resolution may rotate
 * the session, same as every other endpoint in this feature.
 */
import type { APIRoute } from 'astro';
import { recordAgeConsent } from '@lib/ageConsent';
import { markPrivate } from '@lib/httpCache';
import {
  createSessionClient,
  flushSessionHeaders,
  type SessionClient,
} from '@lib/supabaseSession';

interface ConsentBody {
  consent?: unknown;
}

function json(body: unknown, status: number, session: SessionClient): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  });
  flushSessionHeaders(headers, session);
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

export const POST: APIRoute = async ({ request }) => {
  const session = createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });

  // Signed-in only — see file header. `getUser()` is the only identity
  // source this codebase trusts (same rule as `src/middleware.ts`): it
  // revalidates the token against Supabase rather than trusting a possibly
  // forged/stale cookie.
  let user: { id: string; app_metadata: Record<string, unknown> | null | undefined } | null =
    null;
  try {
    const { data } = await session.client.auth.getUser();
    user = data.user ?? null;
  } catch (err) {
    console.error('[auth/consentimiento] getUser() threw:', err);
  }
  if (!user) {
    return json({ ok: false }, 401, session);
  }

  // `application/json` only — see file header.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ ok: false }, 400, session);
  }

  let body: ConsentBody;
  try {
    body = (await request.json()) as ConsentBody;
  } catch {
    return json({ ok: false }, 400, session);
  }

  // Never trust the client: the checkbox state is re-asserted here exactly
  // like the sign-up endpoint re-asserts it (`password.ts`'s `signup`
  // action) — a missing/falsy/non-boolean value is rejected, uniformly,
  // before anything is written.
  if (body?.consent !== true) {
    return json({ ok: false }, 400, session);
  }

  const recorded = await recordAgeConsent(user.id, user.app_metadata);
  if (!recorded) {
    // Logged inside `recordAgeConsent` already; nothing more to say to the
    // caller than a generic failure (same "log it, never return why" rule
    // every other auth endpoint in this codebase follows).
    return json({ ok: false }, 500, session);
  }

  return json({ ok: true }, 200, session);
};
