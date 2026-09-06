/**
 * Level x focus facets for the English section entry screen.
 *
 * Zero I/O, zero dependencies — this is the whole decision layer behind
 * `/[lang]/ingles`, deliberately kept pure so it can be proven without a
 * browser. The entry page mounts no island, but anything that could silently be
 * WRONG still belongs in a function here rather than in a template expression.
 *
 * THE AXIS IS `focus`, NOT `topic`. Someone opening this section is choosing a
 * LANGUAGE POINT to practise — present simple, conditionals, phrasal verbs —
 * not a setting for it. `topic` is secondary context, it is nullable, and a
 * nullable column cannot key a navigation grid without inventing a "no topic"
 * bucket nobody would ever click. See `supabase/migrations/0004_exercises_focus.sql`.
 *
 * The contract that matters: a facet is only ever offered when it can actually
 * be opened. Every count is derived from rows that survived the taxonomy
 * guards, so a chip can never advertise exercises the grid cannot show.
 */
import {
  LEVELS,
  FOCUSES,
  isLevel,
  isFocus,
  type Level,
  type Focus,
} from './exerciseTaxonomy';

/**
 * One published row as the flat facets query returns it. Only the two columns
 * the entry screen groups by — neither the payload nor the topic is read here.
 */
export interface FacetRow {
  level: string;
  focus: string;
}

/** A language point that has at least one exercise at some level. */
export interface FocusFacet {
  focus: Focus;
  count: number;
}

/**
 * A CEFR level and what is published under it. `focuses` holds ONLY language
 * points with content, so an empty array means "nothing at this level yet" —
 * never "thirty-three focuses, all of them empty".
 */
export interface LevelFacet {
  level: Level;
  count: number;
  focuses: FocusFacet[];
}

/**
 * Group published `(level, focus)` rows into a facet per CEFR level.
 *
 * All six levels are ALWAYS returned, in taxonomy order, because the chip row is
 * a fixed piece of navigation: it must not reflow as content is published. A
 * level with nothing simply reports `count: 0`, which the caller renders as a
 * dimmed, unclickable chip.
 *
 * The SAME focus at two levels is counted under each level independently, which
 * is the whole reason `FOCUSES` is a flat list: `present-simple` is an A1
 * introduction and a B1 contrast, and both are real.
 *
 * Rows whose `level` or `focus` fell out of the taxonomy are DISCARDED — from
 * the focus list and from the level count alike. A retired value orphans its
 * published rows (docs/exercise-model.md, "Changing a taxonomy value"); showing
 * it would offer a chip that routes to a guaranteed 404, and counting it would
 * put a number on the screen the grid cannot honour. The `'unassigned'`
 * sentinel written by the migration is discarded by exactly this rule.
 *
 * Null-safe: the query is fail-safe and hands back `[]` on any Supabase error,
 * so this must degrade to "six empty levels" rather than throw mid-render.
 */
export function buildFacets(
  rows: readonly FacetRow[] | null | undefined,
): LevelFacet[] {
  const tally = {} as Record<Level, Partial<Record<Focus, number>>>;
  for (const level of LEVELS) {
    tally[level] = {};
  }

  if (Array.isArray(rows)) {
    for (const raw of rows) {
      if (typeof raw !== 'object' || raw === null) continue;
      const { level, focus } = raw as { level?: unknown; focus?: unknown };
      // Both guards, every row: one bad column is enough to make the pair
      // unroutable, and an unroutable pair must not reach the screen.
      if (!isLevel(level) || !isFocus(focus)) continue;
      tally[level][focus] = (tally[level][focus] ?? 0) + 1;
    }
  }

  return LEVELS.map((level) => {
    const byFocus = tally[level];
    const focuses: FocusFacet[] = [];
    for (const focus of FOCUSES) {
      const count = byFocus[focus] ?? 0;
      if (count > 0) focuses.push({ focus, count });
    }
    // Summed from the surviving focuses rather than counted separately, so the
    // level total and the chip numbers cannot drift apart by construction.
    const count = focuses.reduce((total, entry) => total + entry.count, 0);
    return { level, count, focuses };
  });
}

/**
 * The level the entry screen opens on: the LOWEST one that actually has
 * content.
 *
 * Not simply `A1`. If the first published exercises land at B1, defaulting to
 * A1 would greet every visitor with an empty grid and imply the section is
 * broken. Falls back to the first CEFR level only when nothing is published
 * anywhere, which is also what a Supabase outage degrades to.
 */
export function pickDefaultLevel(facets: readonly LevelFacet[]): Level {
  return facets.find((facet) => facet.count > 0)?.level ?? LEVELS[0];
}

/**
 * Resolve the `?nivel=` search param into the active level.
 *
 * A valid but EMPTY level is honoured on purpose. It is a real level the user
 * explicitly asked for, so the grid answers "nothing here yet" instead of
 * silently swapping in a different level — a redirect would quietly contradict
 * the URL the user is looking at. Only a value that is not a CEFR level at all
 * (absent, misspelled, wrong case) falls back to {@link pickDefaultLevel}.
 */
export function resolveLevel(
  facets: readonly LevelFacet[],
  param: unknown,
): Level {
  return isLevel(param) ? param : pickDefaultLevel(facets);
}

/** The language points published at `level`, or `[]` when that level is empty. */
export function focusesForLevel(
  facets: readonly LevelFacet[],
  level: Level,
): FocusFacet[] {
  return facets.find((facet) => facet.level === level)?.focuses ?? [];
}
