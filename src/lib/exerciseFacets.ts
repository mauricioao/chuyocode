/**
 * Level x topic facets for the English section entry screen.
 *
 * Zero I/O, zero dependencies — this is the whole decision layer behind
 * `/[lang]/ingles`, deliberately kept pure so it can be proven without a
 * browser. AstroContainer cannot render the React islands the layout mounts
 * (see `src/pages/[lang]/libros/libros.test.ts:47`), so the page tests can only
 * assert status codes; anything that could silently be WRONG has to be a
 * function here instead of a expression inside the template.
 *
 * The contract that matters: a facet is only ever offered when it can actually
 * be opened. Every count is derived from rows that survived the taxonomy
 * guards, so a chip can never advertise exercises the grid cannot show.
 */
import {
  LEVELS,
  TOPICS,
  isLevel,
  isTopic,
  type Level,
  type Topic,
} from './exerciseTaxonomy';

/**
 * One published row as the flat facets query returns it. Only the two columns
 * the entry screen groups by — the payload is never read here.
 */
export interface FacetRow {
  level: string;
  topic: string;
}

/** A topic that has at least one exercise at some level. */
export interface TopicFacet {
  topic: Topic;
  count: number;
}

/**
 * A CEFR level and what is published under it. `topics` holds ONLY topics with
 * content, so an empty array means "nothing at this level yet" — never
 * "eight topics, all of them empty".
 */
export interface LevelFacet {
  level: Level;
  count: number;
  topics: TopicFacet[];
}

/**
 * Group published `(level, topic)` rows into a facet per CEFR level.
 *
 * All six levels are ALWAYS returned, in taxonomy order, because the chip row is
 * a fixed piece of navigation: it must not reflow as content is published. A
 * level with nothing simply reports `count: 0`, which the caller renders as a
 * dimmed, unclickable chip.
 *
 * Rows whose `level` or `topic` fell out of the taxonomy are DISCARDED — from
 * the topic list and from the level count alike. A retired value orphans its
 * published rows (docs/exercise-model.md, "Changing a taxonomy value"); showing
 * it would offer a chip that routes to a guaranteed 404, and counting it would
 * put a number on the screen the grid cannot honour.
 *
 * Null-safe: the query is fail-safe and hands back `[]` on any Supabase error,
 * so this must degrade to "six empty levels" rather than throw mid-render.
 */
export function buildFacets(
  rows: readonly FacetRow[] | null | undefined,
): LevelFacet[] {
  const tally = {} as Record<Level, Partial<Record<Topic, number>>>;
  for (const level of LEVELS) {
    tally[level] = {};
  }

  if (Array.isArray(rows)) {
    for (const raw of rows) {
      if (typeof raw !== 'object' || raw === null) continue;
      const { level, topic } = raw as { level?: unknown; topic?: unknown };
      // Both guards, every row: one bad column is enough to make the pair
      // unroutable, and an unroutable pair must not reach the screen.
      if (!isLevel(level) || !isTopic(topic)) continue;
      tally[level][topic] = (tally[level][topic] ?? 0) + 1;
    }
  }

  return LEVELS.map((level) => {
    const byTopic = tally[level];
    const topics: TopicFacet[] = [];
    for (const topic of TOPICS) {
      const count = byTopic[topic] ?? 0;
      if (count > 0) topics.push({ topic, count });
    }
    // Summed from the surviving topics rather than counted separately, so the
    // level total and the chip numbers cannot drift apart by construction.
    const count = topics.reduce((total, entry) => total + entry.count, 0);
    return { level, count, topics };
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

/** The topics published at `level`, or `[]` when that level is empty. */
export function topicsForLevel(
  facets: readonly LevelFacet[],
  level: Level,
): TopicFacet[] {
  return facets.find((facet) => facet.level === level)?.topics ?? [];
}
