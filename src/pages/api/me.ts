/**
 * GET /api/me — identity for the header's client-only user menu.
 *
 * `Header.astro` renders byte-identical HTML for every visitor (it is part
 * of `BaseLayout`, which every PUBLIC page — home, libros, noticias — serves
 * under a PUBLIC cache policy; see `src/lib/httpCache.ts`). Baking
 * `Astro.locals.user` into that markup would let the CDN serve one visitor's
 * name/avatar to the next one (T7). So the header mounts a client-only
 * island (`UserMenu`) instead, and THIS endpoint is the one place it asks
 * "who is signed in".
 *
 * No Supabase call happens here: `locals.user` is already the
 * server-verified caller middleware resolved with `client.auth.getUser()`
 * for every request (`src/middleware.ts`), API routes included. Re-deriving
 * it with a second session client would just repeat that round trip for
 * nothing.
 *
 * Always private/no-store, signed in or not — the response's WHOLE content
 * is per-visitor, so there is no anonymous-safe variant worth caching.
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '@lib/apiResponse';
import { toProfile } from '@lib/profile';

export const GET: APIRoute = async ({ locals }) => {
  const profile = locals.user ? await toProfile(locals.user) : null;

  return jsonResponse({ profile });
};
