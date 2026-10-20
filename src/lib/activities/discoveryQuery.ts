/**
 * Pure query vocabulary for the community discovery feed
 * (`/[lang]/ingles/actividades`): the `?q=`/`?tipo=`/`?orden=`/`?novistas=`
 * params `getPublishedActivities` (`@lib/activities/activities`) turns into
 * SQL. Kept separate from that function, and zero I/O, so the parsing/
 * escaping rules are testable without a mocked Supabase client — the same
 * separation `paths.ts` draws from `storage.ts` for activity images.
 */
import { VARIOS_JUEGOS_ENABLED } from './flags';
import type { BlockKind } from './blocks';

/** Sort orders the community list understands, in the order the `<select>` offers them. */
const SORT_ORDERS = ['recientes', 'gustadas', 'vistas'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export function isSortOrder(value: unknown): value is SortOrder {
  return typeof value === 'string' && (SORT_ORDERS as readonly string[]).includes(value);
}

/**
 * Every `activities.block_kinds` value (0022 migration, `blocks.ts`'s own
 * {@link BlockKind}) — the FULL vocabulary the column can hold.
 * {@link isBlockKindFilter} below narrows this to what `?tipo=` actually
 * ACCEPTS.
 */
const ALL_BLOCK_KINDS: readonly BlockKind[] = ['worksheet', 'basic', 'match', 'reorder', 'cloze', 'groupsort'];

/**
 * `?tipo=<kind>` validation (owner decision 2026-10-19/-20: hide "Varios
 * juegos" from the community filter): every {@link BlockKind} is accepted
 * EXCEPT `'basic'` ("Varios juegos" — a mold-less quiz block), which this
 * never offers while `VARIOS_JUEGOS_ENABLED` is `false` (`flags.ts`),
 * reversible by flipping that flag back to `true`. The OLD generic `'quiz'`
 * value (pre-mold-awareness) is also rejected now — too ambiguous to map to
 * one kind — and, like any other unrecognized value, simply means "no
 * filter" to every caller here (see `activities.ts`'s own `tipo` doc).
 */
export function isBlockKindFilter(value: unknown): value is BlockKind {
  if (typeof value !== 'string') return false;
  if (!(ALL_BLOCK_KINDS as readonly string[]).includes(value)) return false;
  if (value === 'basic') return VARIOS_JUEGOS_ENABLED;
  return true;
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

/**
 * Strip combining diacritical marks (accents) from `value` — "canción" ->
 * "cancion" — via the standard NFD-decompose-then-strip trick: `normalize('NFD')`
 * splits each accented character into its base letter plus a separate
 * combining-mark codepoint, and `\p{Diacritic}` removes exactly those marks,
 * leaving the base letters untouched (including ones the mark-removal alone
 * wouldn't otherwise round-trip cleanly, e.g. "ñ" — NFD-decomposed to "n" +
 * combining tilde, so it folds to "n" here too, matching Postgres'
 * `unaccent()` behavior the {@link buildTitleIlikePattern} pattern below is
 * matched against — see `supabase/migrations/0015_activity_search_unaccent.sql`).
 */
export function normalizeAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Build the full `ilike` pattern for a normalized search query against
 * `activities.title_search` (the generated, lowercased-and-unaccented
 * column — see the 0015 migration): lowercase, strip accents (mirroring the
 * column's own `lower(immutable_unaccent(title))` expression so "cancion"
 * and "canción" both match a title of "Canción"), escape, then wrap in
 * `%…%`.
 */
export function buildTitleIlikePattern(normalizedQuery: string): string {
  const folded = normalizeAccents(normalizedQuery.toLowerCase());
  return `%${escapeIlikePattern(folded)}%`;
}
