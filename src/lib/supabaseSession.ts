/**
 * Request-scoped Supabase session client — the THIRD kind of client in this
 * codebase, and the only one that carries a user identity.
 *
 * `src/lib/supabase.ts` holds the other two, both of which are content readers
 * with no session at all:
 *  - `supabaseServer` (anon key): public, read-only bootstrapping.
 *  - `createServiceClient()` (service-role key): privileged writes.
 *
 * This one is built PER REQUEST from the incoming cookies, because a session
 * client holds one caller's tokens. Reusing a single instance across requests
 * would leak one visitor's session into another's response. Construction does
 * no I/O, so building a fresh client per request is effectively free.
 *
 * Server-only, like its two neighbours: `SUPABASE_ANON_KEY` is already required
 * (`src/lib/env.ts`) and carries no `PUBLIC_` prefix, so nothing here reaches
 * the browser bundle.
 *
 * Server-side authorization MUST come from `client.auth.getUser()`, never from
 * `getSession()`: only `getUser()` revalidates the token against Supabase, so
 * only `getUser()` can reject a forged or stale cookie.
 *
 * 🔴 HARD RULE — `astro.config.mjs` MUST NEVER set `middlewareMode: 'edge'`.
 * Under edge middleware the Netlify adapter JSON-serializes `context.locals`
 * into a header, and nothing built here survives that round trip. Auth then
 * breaks SILENTLY: no error, no log, just a visitor who is never signed in.
 * The adapter is currently `netlify()` with no options, which is the supported
 * Node-function mode — leave it that way. A test guarding the config lands
 * with the middleware work unit.
 */
import {
  createServerClient,
  parseCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { loadEnv } from './env';

const env = loadEnv();

/**
 * Cookie flags for the session cookies, set EXPLICITLY on every field.
 *
 * `@supabase/ssr`'s own `DEFAULT_COOKIE_OPTIONS` ship `httpOnly: false` and
 * never set `secure`, so inheriting the library default is a security
 * regression rather than a shortcut. All four flags are spelled out here.
 *
 * `sameSite: 'lax'` — deliberately NOT `'strict'`. The magic link arrives as a
 * cross-site top-level navigation into the confirm route, and `'strict'`
 * withholds the cookie on exactly that navigation, so sign-in could never
 * complete. `'lax'` is also what makes cookies the CSRF defense here: the
 * browser does not attach them to a cross-site POST, and every mutating route
 * in this feature is POST-only.
 *
 * `secure: isProd` is the one environment-qualified flag. On `http://localhost`
 * a `Secure` cookie is discarded outright by the browser, so local magic-link
 * sign-in could not work at all. This mirrors the existing house rule in
 * `src/pages/api/me-gusta/[id].ts`. `httpOnly`, `sameSite` and `path` never
 * move with the environment.
 *
 * @param isProd - Whether this deployment is production (HTTPS).
 */
export function sessionCookieOptions(isProd: boolean): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' };
}

/** What `createSessionClient` hands back to middleware and API routes. */
export interface SessionClient {
  /** Request-scoped Supabase client. Resolve identity with `auth.getUser()`. */
  client: SupabaseClient;
  /**
   * Response headers Supabase asked for while writing auth cookies (cache
   * directives that keep a session response out of a shared cache).
   *
   * They are buffered rather than applied because middleware cannot reach the
   * `Response` until `next()` resolves. The caller MUST flush this map onto the
   * response headers after `next()`. Cookies need no such buffering:
   * `AstroCookies` already targets the outgoing response.
   */
  pendingHeaders: Map<string, string>;
}

/**
 * Build a Supabase client bound to one request's cookies.
 *
 * @param args.request - The incoming request; its `Cookie` header is the read side.
 * @param args.cookies - Astro's cookie jar for the outgoing response; the write side.
 * @param args.isProd - Whether this deployment is production. See {@link sessionCookieOptions}.
 */
export function createSessionClient(args: {
  request: Request;
  cookies: AstroCookies;
  isProd: boolean;
}): SessionClient {
  const { request, cookies, isProd } = args;
  const pendingHeaders = new Map<string, string>();

  const client = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      cookieOptions: sessionCookieOptions(isProd),
      cookies: {
        getAll() {
          const header = request.headers.get('cookie');
          if (!header) {
            return [];
          }
          // `GetAllCookies` promises `{ name, value: string }[]`. Older and
          // future parsers can emit an entry with no value for a malformed
          // `Cookie` header; passing one through would break that contract
          // downstream, where it is far harder to diagnose than here.
          return parseCookieHeader(header).filter(
            (cookie) => typeof cookie.value === 'string',
          );
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            // An empty value means "remove this cookie". `set(name, '')` would
            // leave a live, empty cookie behind — sign-out would then look
            // like it worked while the browser kept a cookie for the name.
            if (value === '') {
              cookies.delete(name, options);
            } else {
              cookies.set(name, value, options);
            }
          }

          for (const [key, headerValue] of Object.entries(headers ?? {})) {
            pendingHeaders.set(key, headerValue);
          }
        },
      },
    },
  );

  return { client, pendingHeaders };
}
