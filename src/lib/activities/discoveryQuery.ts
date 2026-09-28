/**
 * Pure query vocabulary for the community discovery feed
 * (`/[lang]/ingles/actividades`): the `?q=`/`?tipo=`/`?orden=`/`?novistas=`
 * params `getPublishedActivities` (`@lib/activities/activities`) turns into
 * SQL. Kept separate from that function, and zero I/O, so the parsing/
 * escaping rules are testable without a mocked Supabase client — the same
 * separation `paths.ts` draws from `storage.ts` for activity images.
 */

/** Sort orders the community list understands, in the order the `<select>` offers them. */
export const SORT_ORDERS = ['recientes', 'gustadas', 'vistas'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export function isSortOrder(value: unknown): value is SortOrder {
  return typeof value === 'string' && (SORT_ORDERS as readonly string[]).includes(value);
}

/** Block-type filters — must match `activities.block_types`' own vocabulary (`blocks.ts`). */
export const BLOCK_TYPE_FILTERS = ['worksheet', 'quiz'] as const;
export type BlockTypeFilter = (typeof BLOCK_TYPE_FILTERS)[number];

export function isBlockTypeFilter(value: unknown): value is BlockTypeFilter {
  return typeof value === 'string' && (BLOCK_TYPE_FILTERS as readonly string[]).includes(value);
}

/** `?q=`'s cap — long enough for any real title search, short enough to bound the `ilike` scan. */
export const SEARCH_QUERY_MAX_LENGTH = 80;

/**
 * Trim and cap a raw `?q=` value, or `null` when there is nothing left to
 * search for. Applied BEFORE {@link escapeIlikePattern} — this only decides
 * whether a search is happening at all.
 */
export function normalizeSearchQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Escape `%`, `_`, and `\` in a value that is about to be interpolated into
 * an `ilike` pattern. Without this, a title search for "50%" or "a_b" would
 * be read as SQL wildcards instead of literal characters — same reasoning as
 * every other codebase boundary that treats user input as DATA, never
 * syntax.
 */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Build the full `ilike` pattern for a normalized search query: escape, then wrap in `%…%`. */
export function buildTitleIlikePattern(normalizedQuery: string): string {
  return `%${escapeIlikePattern(normalizedQuery)}%`;
}
