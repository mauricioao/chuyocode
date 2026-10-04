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
 * (`MediaBlockEditor.tsx`) checks a value against the STATIC list only (see
 * that component's own comment), the structural validator
 * (`exerciseValidator.ts`) rejects it at publish time with
 * `media_url_not_allowed` against the full, Supabase-aware list, and this
 * module plus {@link "./exerciseMedia.server"} are the only two places
 * either would have to change.
 *
 * PURE — NO `env` IMPORT, ON PURPOSE. `MediaBlockEditor.tsx` is a hydrated
 * client island, so this module sits in its bundle; `./env` reads
 * `SUPABASE_SERVICE_ROLE_KEY`/`AD_HMAC_SECRET` and must never be reachable
 * from there (`src/lib/build/serverOnlyModules.ts` fails the build if it
 * is). The Supabase-aware host list — the one piece that needs `env` —
 * lives in {@link "./exerciseMedia.server"}, a server-only sibling built on
 * top of this module's pure {@link mediaHostsFor}.
 */

/** Always allowed — the site's existing Sanity media CDN. */
export const STATIC_ALLOWED_MEDIA_HOSTS = ['cdn.sanity.io'] as const;

/**
 * {@link STATIC_ALLOWED_MEDIA_HOSTS} plus the Supabase project's own host
 * (its storage host, same origin as the API) when `supabaseUrl` parses to
 * one. Pure and synchronous: obtaining `supabaseUrl` (from `env` on the
 * server, or not at all on the client) is the caller's job — see
 * {@link "./exerciseMedia.server"}'s `serverAllowedMediaHosts`.
 */
export function mediaHostsFor(supabaseUrl: string | undefined): readonly string[] {
  if (!supabaseUrl) return STATIC_ALLOWED_MEDIA_HOSTS;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    return hostname.length > 0
      ? [...STATIC_ALLOWED_MEDIA_HOSTS, hostname]
      : STATIC_ALLOWED_MEDIA_HOSTS;
  } catch {
    return STATIC_ALLOWED_MEDIA_HOSTS;
  }
}

/**
 * Is `value` an acceptable authored media URL? `https:` only, and its host
 * must be in `hosts` (default {@link STATIC_ALLOWED_MEDIA_HOSTS} — the
 * client's effective allow-list, since it has no access to `SUPABASE_URL`).
 * An unparsable string is never allowed — the same fail-closed instinct
 * `parseBlock`'s https-only check uses one level down.
 */
export function isAllowedMediaUrl(
  value: string,
  hosts: readonly string[] = STATIC_ALLOWED_MEDIA_HOSTS,
): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && hosts.includes(url.hostname);
}
