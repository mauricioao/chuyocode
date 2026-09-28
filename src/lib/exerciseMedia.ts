/**
 * Allow-listed media hosts for authored exercise media (slice 15).
 *
 * PRODUCT AMBIGUITY, RESOLVED FOR NOW. Neither design.md nor
 * specs/exercise-authoring/spec.md says anything about which hosts an
 * authored `image`/`audio` URL may point at — the owner will decide the
 * real policy later. The simplest reversible option in the meantime: an
 * explicit, exported host allow-list, `https:` only. `cdn.sanity.io`
 * (already the site's media CDN) plus the Supabase project's own storage
 * host — derived from the already-configured `SUPABASE_URL`, never
 * hardcoded, so this stays correct across environments.
 *
 * ONE LIST, THREE CALL SITES: the authoring media block editor
 * (`MediaBlockEditor.tsx`) refuses to accept anything else, the structural
 * validator (`exerciseValidator.ts`) rejects it at publish time with
 * `media_url_not_allowed`, and this is the single place either would have
 * to change.
 *
 * Lazy and fail-safe: `loadEnv()` is called only when a host is actually
 * needed, never at import time, so importing this module can never throw —
 * a module-load-time failure here would take down the validator and every
 * page that imports it transitively. An unreadable `SUPABASE_URL` simply
 * means the allow-list falls back to `cdn.sanity.io` alone.
 */
import { loadEnv } from './env';

/** Always allowed — the site's existing Sanity media CDN. */
export const STATIC_ALLOWED_MEDIA_HOSTS = ['cdn.sanity.io'] as const;

let cachedHosts: readonly string[] | null = null;

/** The Supabase project's own host (its storage host, same origin as the API), or `null`. */
function supabaseStorageHost(): string | null {
  try {
    const hostname = new URL(loadEnv().SUPABASE_URL).hostname;
    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

/**
 * The full allow-list, computed once and cached: {@link STATIC_ALLOWED_MEDIA_HOSTS}
 * plus the Supabase storage host when it can be derived.
 */
export function allowedMediaHosts(): readonly string[] {
  if (cachedHosts) return cachedHosts;
  const supabaseHost = supabaseStorageHost();
  cachedHosts = supabaseHost
    ? [...STATIC_ALLOWED_MEDIA_HOSTS, supabaseHost]
    : STATIC_ALLOWED_MEDIA_HOSTS;
  return cachedHosts;
}

/**
 * Is `value` an acceptable authored media URL? `https:` only, and its host
 * must be in {@link allowedMediaHosts}. An unparsable string is never
 * allowed — the same fail-closed instinct `parseBlock`'s https-only check
 * uses one level down.
 */
export function isAllowedMediaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && allowedMediaHosts().includes(url.hostname);
}

/** Test isolation: the host list is cached across calls in the same module instance. */
export function resetMediaHostsCache(): void {
  cachedHosts = null;
}
