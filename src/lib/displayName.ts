/**
 * displayName — the visitor's own display-name choice (Perfil page, T3):
 * the `user_metadata` key it lives under, plus the one normalization rule
 * both the server endpoint and the client form apply.
 *
 * DELIBERATELY SEPARATE FROM `./profile.ts`: that module imports `getPlan`
 * (`./access`), which imports `createServiceClient` (`./supabase`), which
 * calls `loadEnv()` at module scope — fine for a server-only reader, but
 * `ProfileNameForm` (a `client:load` React island) also needs
 * `normalizeDisplayName` for its own client-side pre-validation, and must
 * never pull that server-only chain (or its env-var requirement) into a
 * browser bundle. Same reasoning `seo.ts`'s own header gives for keeping a
 * local copy of `isPublicActivityRoute` instead of importing `./access`
 * there — this module has ZERO imports, on purpose.
 */

/**
 * The `user_metadata` key the visitor's OWN display-name choice is stored
 * under — never touched by Google's own OAuth metadata (`full_name`/`name`),
 * so a later re-sign-in through Google can never silently overwrite a name
 * chosen here. `./profile.ts`'s own `nameFrom` resolver prefers this key
 * above every other source.
 */
export const DISPLAY_NAME_METADATA_KEY = 'display_name';

/** Longest display name {@link normalizeDisplayName} accepts. */
export const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * Control characters {@link normalizeDisplayName} rejects outright rather
 * than silently stripping — ordinary whitespace (space/tab/newline/CR) is
 * deliberately EXCLUDED here because it is handled by the whitespace-collapse
 * step instead (a pasted multi-line value is a mistake to clean up, not a
 * reason to refuse the whole submission).
 */
const DISALLOWED_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * Validation for the Perfil page's "Nombre" field: trim, collapse internal
 * whitespace runs to one space, 1–{@link MAX_DISPLAY_NAME_LENGTH} characters,
 * reject disallowed control characters. Returns the normalized value to
 * store, or `null` for anything invalid.
 *
 * Called on BOTH sides: `ProfileNameForm` (nicer UX only) and
 * `/api/cuenta/nombre.ts` (the actual authority — the client's own
 * pre-validation is never trusted alone).
 */
export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (DISALLOWED_CONTROL_CHARS.test(raw)) return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length < 1 || collapsed.length > MAX_DISPLAY_NAME_LENGTH) return null;
  return collapsed;
}
