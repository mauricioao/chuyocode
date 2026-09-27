/**
 * POST /api/auth/google — begin Google OAuth sign-in (Login step 1).
 *
 * 🔴 POST-ONLY, AND THAT IS A SECURITY PROPERTY, NOT A STYLE CHOICE — same
 * reasoning as `signout.ts`: with `sameSite: 'lax'` the browser does not
 * attach the session cookie to a cross-site POST, and a GET here would be
 * triggerable by any `<img src>`, prefetch or link preview on any page.
 *
 * A PLAIN `<form method="POST">` in `entrar.astro`, deliberately NOT a
 * `fetch` call: `signInWithOAuth` with `skipBrowserRedirect: true` returns a
 * provider URL instead of redirecting itself, and this route turns that
 * into a real 303 the browser follows on its own — no client JS required,
 * the same zero-JS posture `ingles/index.astro`'s header argues for wherever
 * a control needs no request state of its own. The body therefore arrives
 * form-encoded, read with `request.formData()`, not JSON.
 *
 * 🔴 THE PKCE VERIFIER COOKIE GOES ON THIS RESPONSE, EVERY EXIT. Same rule
 * as `signin.ts`: `@supabase/ssr` hardcodes `flowType: 'pkce'`, so
 * `signInWithOAuth` mints a code verifier here, and `/api/auth/confirm`
 * needs that cookie back to exchange the `code` Google's own redirect
 * carries.
 *
 * 🔴 NEVER A 500. If Google is not configured as a provider in this
 * Supabase project — or Supabase is simply unreachable — `signInWithOAuth`
 * answers an error (or throws) rather than a URL to send the browser to.
 * Either way the visitor is bounced back to sign in with
 * `?auth=google-unavailable` (`@lib/authRedirect`) instead of a blank error
 * page or an uncaught 500.
 */
import type { APIRoute } from 'astro';
import { safeNextPath, withGoogleUnavailable } from '@lib/authRedirect';
import { markPrivate } from '@lib/httpCache';
import { DEFAULT_LANG, isValidLang } from '@lib/i18n';
import {
  createSessionClient,
  flushSessionHeaders,
  type SessionClient,
} from '@lib/supabaseSession';

function redirect(target: string, session: SessionClient): Response {
  const headers = new Headers({ location: target });
  flushSessionHeaders(headers, session);
  markPrivate(headers);
  return new Response(null, { status: 303, statusText: 'See Other', headers });
}

export const POST: APIRoute = async ({ request }) => {
  // A malformed or missing body degrades to the defaults below rather than
  // a 400 — this route has no failure exit that isn't already a redirect.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }

  const rawLang = form.get('lang');
  const lang = isValidLang(rawLang) ? rawLang : DEFAULT_LANG;
  const rawNext = form.get('next');
  const next = safeNextPath(typeof rawNext === 'string' ? rawNext : null);

  const confirmUrl = new URL('/api/auth/confirm', request.url);
  confirmUrl.searchParams.set('next', next);

  const session = createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });

  try {
    const { data, error } = await session.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: confirmUrl.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      if (error) {
        console.error('[auth/google] signInWithOAuth failed:', error.message);
      }
      return redirect(withGoogleUnavailable(`/${lang}/auth/entrar`), session);
    }

    return redirect(data.url, session);
  } catch (err) {
    // An unreachable Supabase throws — degrade exactly like a declined
    // provider rather than letting it become an unhandled 500.
    console.error('[auth/google] signInWithOAuth threw:', err);
    return redirect(withGoogleUnavailable(`/${lang}/auth/entrar`), session);
  }
};
