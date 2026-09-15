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
  serializeCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
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

/** The buffered response state one request's Supabase client accumulated. */
export interface SessionState {
  /**
   * Response headers Supabase asked for while writing auth cookies (cache
   * directives that keep a session response out of a shared cache).
   */
  pendingHeaders: Map<string, string>;
  /**
   * Fully serialized `Set-Cookie` values, in the order Supabase produced them.
   *
   * 🔴 A LIST, NOT A MAP KEYED BY NAME. `@supabase/ssr` deliberately emits two
   * directives for the SAME cookie name when a parent domain is configured — a
   * host-only clear beside a domain-scoped one — because the browser returns
   * both and a stale one resurrects a session that was signed out. Anything
   * keyed by name silently collapses that pair into whichever came last.
   */
  pendingCookies: string[];
}

/** What `createSessionClient` hands back to middleware and API routes. */
export interface SessionClient extends SessionState {
  /** Request-scoped Supabase client. Resolve identity with `auth.getUser()`. */
  client: SupabaseClient;
}

/**
 * Put everything Supabase buffered onto the headers of a response.
 *
 * 🔴 EVERY CALLER MUST DO THIS, AND MUST DO IT ON THE `Response` IT RETURNS.
 * Nothing here reaches a browser on its own.
 *
 * This module used to write through `AstroCookies` instead, which reaches the
 * wire by a route nothing in this repo owns: Astro attaches its cookie jar to
 * whatever `Response` a route returns, and the Netlify adapter consumes the jar
 * and appends the directives afterwards. That works right up until a version
 * bump or an adapter option changes one of those two steps, and when it breaks
 * it breaks silently — no error, no log, a visitor who is simply never signed
 * in. It is also untestable from here: the header does not exist yet on the
 * object the route hands back, so a test can only assert that the cookie jar
 * was CALLED. A suite of 1062 passing tests did exactly that while the browser
 * received no `Set-Cookie` at all.
 *
 * Putting the directives on the returned `Response` fixes both: it is the same
 * thing `src/pages/api/me-gusta/[id].ts` already does with its dedup cookie,
 * it is what Supabase documents for frameworks that build their own responses,
 * and it is assertable by the caller.
 *
 * 🔴 ONE MECHANISM, DELIBERATELY. Keeping the `AstroCookies` writes as well
 * would send every cookie TWICE, because the adapter appends the jar's copy on
 * top of this one. Two copies of a `Max-Age=0` clear beside a fresh session
 * cookie is not belt-and-braces, it is a race over which one the browser keeps.
 *
 * Headers are `set` (a second `Cache-Control` is an ambiguous directive, not a
 * stricter one) and cookies are `append` (several are legitimate, and a `set`
 * would drop one the route put there itself).
 *
 * @param headers - The outgoing response headers, mutated in place.
 * @param session - The buffered state from {@link createSessionClient}.
 */
export function flushSessionHeaders(
  headers: Headers,
  session: SessionState,
): void {
  for (const [key, value] of session.pendingHeaders) {
    headers.set(key, value);
  }

  for (const cookie of session.pendingCookies) {
    headers.append('set-cookie', cookie);
  }
}

/**
 * Build a Supabase client bound to one request's cookies.
 *
 * Takes no cookie jar: the write side is the `pendingCookies` buffer, flushed
 * by the caller through {@link flushSessionHeaders}. See that function for why
 * the framework's jar is not an option here.
 *
 * @param args.request - The incoming request; its `Cookie` header is the read side.
 * @param args.isProd - Whether this deployment is production. See {@link sessionCookieOptions}.
 */
export function createSessionClient(args: {
  request: Request;
  isProd: boolean;
}): SessionClient {
  const { request, isProd } = args;
  const pendingHeaders = new Map<string, string>();
  const pendingCookies: string[] = [];

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
            // Serialized verbatim, removals included. `@supabase/ssr` asks for
            // a removal as an empty value with `maxAge: 0` in `options`, so the
            // directive that expires the cookie is already fully described
            // here; re-deriving it would be a second, divergent opinion about
            // what "remove" means.
            pendingCookies.push(serializeCookieHeader(name, value, options));
          }

          for (const [key, headerValue] of Object.entries(headers ?? {})) {
            pendingHeaders.set(key, headerValue);
          }
        },
      },
    },
  );

  return { client, pendingHeaders, pendingCookies };
}
