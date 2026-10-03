/**
 * Server-only sibling of {@link "./exerciseMedia"}: derives the Supabase
 * storage host from the configured `SUPABASE_URL` via `loadEnv()`, so
 * server-side callers (the structural validator, at publish time) get the
 * full allow-list — `cdn.sanity.io` plus the Supabase project's own host.
 *
 * Kept out of `exerciseMedia.ts` on purpose: that module is reachable from
 * a hydrated client island (`MediaBlockEditor.tsx`), and `./env` must never
 * be — see this file's `src/lib/build/serverOnlyModules.ts` guard and
 * `exerciseMedia.ts`'s own header comment.
 *
 * Lazy and fail-safe, same semantics as before the split: `loadEnv()` is
 * called only when a host is actually needed, never at import time, so
 * importing this module can never throw. An unreadable `SUPABASE_URL`
 * simply means the allow-list falls back to `cdn.sanity.io` alone.
 */
import { loadEnv } from './env';
import { mediaHostsFor } from './exerciseMedia';

let cachedHosts: readonly string[] | null = null;

/**
 * The full allow-list, computed once and cached: {@link "./exerciseMedia".STATIC_ALLOWED_MEDIA_HOSTS}
 * plus the Supabase storage host when it can be derived from `SUPABASE_URL`.
 */
export function serverAllowedMediaHosts(): readonly string[] {
  if (cachedHosts) return cachedHosts;

  let supabaseUrl: string | undefined;
  try {
    supabaseUrl = loadEnv().SUPABASE_URL;
  } catch {
    supabaseUrl = undefined;
  }

  cachedHosts = mediaHostsFor(supabaseUrl);
  return cachedHosts;
}

/** Test isolation: the host list is cached across calls in the same module instance. */
export function resetMediaHostsCache(): void {
  cachedHosts = null;
}
