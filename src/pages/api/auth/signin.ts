/**
 * POST /api/auth/signin — request a magic link. Step one of two.
 *
 * Takes an email address and asks Supabase to email a link pointing at
 * `/api/auth/confirm`. It creates no session; only the confirm route does.
 *
 * ⚠️ THIS RESPONSE CARRIES THE PKCE CODE VERIFIER, WHICH IS WHY THE LINK IS
 * BROWSER-BOUND. `@supabase/ssr` runs the PKCE flow, so `signInWithOtp` mints a
 * code verifier here and the session client writes it as a cookie on THIS
 * response. `/api/auth/confirm` needs that cookie back to exchange the emailed
 * `code`. The consequence is a limitation worth knowing before debugging a
 * "broken" link: the mail must be opened in the SAME BROWSER that submitted this
 * form. Requested on a laptop, clicked on a phone, there is no verifier and
 * confirmation fails. `src/pages/api/auth/confirm.ts` documents the full flow
 * and the `token_hash` path that is exempt from this.
 *
 * 🔴 THE RESPONSE IS THE SAME BYTES NO MATTER WHAT HAPPENS (threat matrix T3).
 * Same status, same body, same headers, whether the address has an account, has
 * none, was rate-limited, or could not reach Supabase at all. This endpoint is
 * the only public surface handed an arbitrary email, so ANY observable
 * difference turns the sign-in form into a membership oracle: feed it a list of
 * addresses and it reports which people use this site.
 *
 * 🔴 `shouldCreateUser` IS LEFT AT ITS DEFAULT OF `true`, DELIBERATELY. That
 * default is what makes the uniformity above real rather than cosmetic: an
 * unknown address gets an account and the same link a known one gets, so the two
 * cases are indistinguishable at the provider as well as here. Setting it to
 * `false` makes Supabase refuse unknown addresses — one case sends an email and
 * the other does not, and no amount of uniform wrapping in this file hides that
 * from anyone who controls the destination mailbox. It also matches how the
 * feature works: there is no separate registration, so the first magic link IS
 * the sign-up. Design §1 specifies the call without the option for both reasons.
 *
 * Errors are logged server-side and never surfaced. That is the one place where
 * silence is correct: the caller must not learn WHY, and the operator must.
 *
 * JSON in, JSON out. The sign-in page (slice 4) posts with `fetch`, matching the
 * existing island-to-endpoint pattern in `src/pages/api/me-gusta/[id].ts`.
 *
 * Why this route is NOT under `/[lang]/`: the confirm URL it builds is
 * registered in Supabase's redirect allow-list, and a lang prefix would mean two
 * allow-list entries that drift apart. The locale rides in `next` and in user
 * metadata instead (design §1).
 */
import type { APIRoute } from 'astro';
import { safeNextPath } from '@lib/authRedirect';
import { markPrivate } from '@lib/httpCache';
import { DEFAULT_LANG, isValidLang } from '@lib/i18n';
import { createSessionClient } from '@lib/supabaseSession';

/** The body shape the sign-in form posts. */
interface SignInBody {
  email?: unknown;
  lang?: unknown;
  next?: unknown;
}

/**
 * Local, syntactic-only address check.
 *
 * Deliberately permissive: its job is to catch a form that submitted nothing
 * useful, not to adjudicate RFC 5322. Real validation is Supabase's, and its
 * verdict is never surfaced.
 *
 * Answering 400 here leaks nothing, because the result depends only on the
 * string itself and never on whether an account exists.
 */
function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The single response every caller gets, built fresh each time. */
function uniformAccepted(): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  });
  markPrivate(headers);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: SignInBody;
  try {
    body = (await request.json()) as SignInBody;
  } catch {
    return new Response(null, { status: 400, statusText: 'Bad Request' });
  }

  if (!looksLikeEmail(body?.email)) {
    return new Response(null, { status: 400, statusText: 'Bad Request' });
  }

  const email = body.email;
  const lang = isValidLang(body?.lang) ? body.lang : DEFAULT_LANG;

  // The guard runs here as well as at confirm time. `next` is embedded in an
  // emailed link, which is the hardest place for anyone to inspect it, so it is
  // never carried untrusted into a message we send ourselves.
  const next = safeNextPath(typeof body?.next === 'string' ? body.next : null);
  const confirmUrl = new URL('/api/auth/confirm', request.url);
  confirmUrl.searchParams.set('next', next);

  try {
    const { client } = createSessionClient({
      request,
      cookies,
      isProd: import.meta.env?.PROD === true,
    });

    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        // Read back server-side when a moderation email is sent (design §9).
        data: { lang },
        emailRedirectTo: confirmUrl.toString(),
      },
    });

    if (error) {
      // Logged, never returned. A rate limit and an unknown address must look
      // the same to the caller and different to whoever reads the logs.
      console.error('[auth/signin] signInWithOtp failed:', error.message);
    }
  } catch (err) {
    // An unreachable Supabase throws. Letting that become a 500 would answer
    // 200 for some addresses and 500 for others — the same leak, by accident.
    console.error('[auth/signin] signInWithOtp threw:', err);
  }

  return uniformAccepted();
};
