/**
 * Server-only read path for English exercises.
 *
 * Every read here is keyed on `(level, focus)` — the LANGUAGE POINT, which is
 * the section's primary axis and the tuple the table is uniquely keyed on
 * (`supabase/migrations/0004_exercises_focus.sql`). `topic` is secondary
 * context: it rides along on the row, it is NULLABLE, and nothing routes or
 * filters by it.
 *
 * FAIL-SAFE, exactly like src/lib/downloads.ts: every failure mode collapses to
 * `null` and the caller renders a 404. A Supabase outage, a missing service-role
 * key, or a payload that drifted out of shape must never 500 the page.
 *
 * Reads go through the service-role client because `exercises` has RLS enabled
 * with no public policies, so the anon key can neither read nor write it (see
 * supabase/migrations/0003_exercises.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';
import type { FacetRow } from './exerciseFacets';
import { hasAudio, parsePayload, type Payload } from './exercisePayload';
import {
  isLevel,
  isFocus,
  isTopic,
  type Focus,
  type Level,
  type Skill,
  type Topic,
} from './exerciseTaxonomy';

/** DB table name — must match the SQL migration. */
export const EXERCISES_TABLE = 'exercises';

/**
 * How many related exercises a detail page offers.
 *
 * Six, because the block sits UNDER the exercise on a single-column
 * `max-w-3xl` route: a related list longer than the exercise itself stops being
 * a suggestion and becomes a second listing page. Six also fills a 1/2/3-column
 * responsive grid with no orphan row (6, 3x2, 2x3), and bounds the read to
 * seven `jsonb` payloads.
 */
export const RELATED_LIMIT = 6;

/** Columns the detail route needs. Selected explicitly, never `*`. */
const EXERCISE_COLUMNS = 'id, slug, skill, level, focus, topic, payload';

/**
 * Columns the entry screen groups by. Just the two the facets are built from —
 * counting exercises never needs their payloads, and `topic` is not an axis.
 */
const FACET_COLUMNS = 'level, focus';

/** A published exercise, validated and ready to render. */
export interface Exercise {
  id: string;
  slug: string;
  skill: Skill;
  level: Level;
  /** The language point being practised. PRIMARY axis; always present. */
  focus: Focus;
  /**
   * The vocabulary context, or `null` when the exercise has none.
   *
   * `null` is an ORDINARY value here, not a data problem: a pure grammar drill
   * has no natural setting, and the column was made nullable precisely so an
   * author is not pushed into inventing one. Callers must render nothing at
   * all for it — never an empty badge.
   *
   * Also `null` when the stored value fell out of the topic taxonomy, which is
   * the same instruction to the caller: show no context.
   */
  topic: Topic | null;
  payload: Payload;
  /**
   * Whether this exercise has an audio stimulus. Derived from the row we
   * already fetched — never an HTTP check on the render path.
   */
  hasAudio: boolean;
}

/**
 * Lazily-created service-role client. Created on first use (not module load) so
 * the app still boots when `SUPABASE_SERVICE_ROLE_KEY` is unset.
 */
let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    // Missing service-role key (or any init error): reads become no-ops.
    return null;
  }
}

/**
 * The row's context, normalized to "a topic we can label, or nothing".
 *
 * A NULL column and a value that left the taxonomy collapse to the same answer
 * on purpose: in both cases there is no label to draw, and the caller's only
 * correct move is to render no badge. Keeping them apart would buy the render
 * layer a distinction it cannot act on.
 */
function readTopic(value: unknown): Topic | null {
  return isTopic(value) ? value : null;
}

/**
 * Fetch one published exercise by its deep link, or `null`.
 *
 * `null` covers every failure equally — unknown taxonomy, no matching row, a
 * Supabase error, a thrown client, an unconfigured key, or a payload that no
 * renderer could draw. The caller does not need to tell them apart; they are
 * all "this URL has no exercise", which is a 404.
 *
 * Invalid `level`/`focus` are rejected BEFORE the query: a segment that is not
 * in the taxonomy can never match a row, so spending a round trip on it only
 * makes the 404 slower.
 */
export async function getExerciseBySlug(
  level: string,
  focus: string,
  slug: string,
): Promise<Exercise | null> {
  if (!isLevel(level) || !isFocus(focus) || slug.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(EXERCISES_TABLE)
      .select(EXERCISE_COLUMNS)
      .eq('level', level)
      .eq('focus', focus)
      .eq('slug', slug)
      // Unpublished drafts must not be reachable by guessing a deep link.
      .eq('published', true)
      .maybeSingle();

    if (error) {
      console.error('[exercises] getExerciseBySlug failed:', error.message);
      return null;
    }
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    const payload = parsePayload(row.payload);
    if (!payload) {
      console.error('[exercises] malformed payload for slug:', slug);
      return null;
    }

    return {
      id: typeof row.id === 'string' ? row.id : '',
      slug,
      skill: row.skill as Skill,
      level,
      focus,
      // Read off the ROW, unlike level and focus: those came from the URL and
      // were just validated, but the context is data this route never asked for.
      topic: readTopic(row.topic),
      payload,
      hasAudio: hasAudio(payload),
    };
  } catch (err) {
    console.error('[exercises] getExerciseBySlug threw:', err);
    return null;
  }
}

/**
 * Fetch the `(level, focus)` pair of every published exercise.
 *
 * ONE flat read backing the whole entry screen. The obvious alternative — a
 * count per CEFR level — is six round trips to paint one row of chips, and it
 * still would not tell us WHICH language points exist under each level.
 * Grouping is pure, cheap and testable (`src/lib/exerciseFacets.ts`), so the
 * database is asked once and the shaping happens in memory.
 *
 * Neither `payload` nor `topic` is selected: the entry screen counts exercises
 * by language point, it never renders one, and pulling every `jsonb` blob to
 * produce a number would be the expensive way to be wrong.
 *
 * FAIL-SAFE: `[]` on any error, so an outage renders the "nothing published"
 * panel instead of 500-ing a link that sits in the header of every page.
 */
export async function getExerciseFacetRows(): Promise<FacetRow[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(EXERCISES_TABLE)
      .select(FACET_COLUMNS)
      // Drafts must never inflate a count the grid cannot honour.
      .eq('published', true);

    if (error) {
      console.error('[exercises] getExerciseFacetRows failed:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.flatMap((raw): FacetRow[] => {
      const row = raw as unknown as Record<string, unknown>;
      if (typeof row?.level !== 'string' || typeof row?.focus !== 'string') {
        return [];
      }
      return [{ level: row.level, focus: row.focus }];
    });
  } catch (err) {
    console.error('[exercises] getExerciseFacetRows threw:', err);
    return [];
  }
}

/**
 * Fetch every published exercise for one `(level, focus)` pair.
 *
 * An EMPTY array is a legitimate answer, not a failure: a valid combination
 * with nothing published yet is a real page that renders an empty state, never
 * a 404. The caller cannot distinguish "empty" from "Supabase is down" — and it
 * must not, because both render the same honest "nothing here" screen.
 *
 * A row whose payload drifted out of shape is DROPPED rather than fatal: one
 * unparseable exercise must not blank out the whole listing around it.
 *
 * Invalid `level`/`focus` are rejected BEFORE the query, mirroring
 * {@link getExerciseBySlug} — a segment outside the taxonomy can never match.
 */
export async function getPublishedExercises(
  level: string,
  focus: string,
): Promise<Exercise[]> {
  if (!isLevel(level) || !isFocus(focus)) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(EXERCISES_TABLE)
      .select(EXERCISE_COLUMNS)
      .eq('level', level)
      .eq('focus', focus)
      .eq('published', true)
      // Deterministic order: without it Postgres may return rows in any order
      // and the grid would reshuffle between visits for no reason.
      .order('slug', { ascending: true });

    if (error) {
      console.error('[exercises] getPublishedExercises failed:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.flatMap((raw): Exercise[] => {
      const row = raw as unknown as Record<string, unknown>;
      const payload = parsePayload(row?.payload);
      if (!payload) {
        console.error('[exercises] malformed payload for slug:', row?.slug);
        return [];
      }
      if (typeof row.slug !== 'string' || row.slug.length === 0) return [];

      return [
        {
          id: typeof row.id === 'string' ? row.id : '',
          slug: row.slug,
          skill: row.skill as Skill,
          level,
          focus,
          // Varies per row even inside one (level, focus) pair — the same
          // language point is deliberately practised across several contexts,
          // and some rows have none at all.
          topic: readTopic(row.topic),
          payload,
          hasAudio: hasAudio(payload),
        },
      ];
    });
  } catch (err) {
    console.error('[exercises] getPublishedExercises threw:', err);
    return [];
  }
}

/**
 * Is `candidate` the very exercise the learner is already looking at?
 *
 * Prefers the PRIMARY KEY. `slug` is unique per `(level, focus)`, not globally
 * (docs/exercise-model.md, "Deep links"), so at level scope two different
 * exercises may legitimately share a slug — `spot-the-error` under
 * `present-perfect` and under `passive-voice` are not the same exercise. Slug
 * alone would therefore drop an innocent card. `(focus, slug)` is the fallback
 * identity when the id did not come back as a usable string; it follows the
 * uniqueness key, so `topic` — which is nullable and not part of it — cannot be
 * used here.
 */
function isSameExercise(candidate: Exercise, current: Exercise): boolean {
  if (candidate.id.length > 0 && current.id.length > 0) {
    return candidate.id === current.id;
  }
  return candidate.focus === current.focus && candidate.slug === current.slug;
}

/**
 * Fetch other published exercises at the SAME LEVEL as `current`.
 *
 * LEVEL IS THE AXIS — unchanged by the move to `focus`. Someone browsing a
 * level is roughly at that level, so level is what makes a suggestion
 * appropriate; narrowing to the current language point would hide most of what
 * they can actually do and would produce an empty block for every focus that
 * holds a single exercise. The same argument that ruled out narrowing by topic.
 *
 * ORDERING IS DETERMINISTIC AND TOTAL. `(level, focus, slug)` is the table's
 * unique key, so at a fixed level `(focus, slug)` admits no ties — the same
 * request always returns the same rows in the same sequence. This ORDER BY had
 * to move from `topic` to `focus` along with the key: ordering by a nullable,
 * non-unique column would no longer be a total order, and NULLs would sort into
 * an arbitrary block. Without a total order Postgres may return rows in any
 * order and the block would reshuffle between two SSR renders of the same URL.
 * The accepted cost is that the same few exercises always surface at a level;
 * rotating them needs a stable seed and real content volume, not `Math.random()`
 * on the render path.
 *
 * THE CURRENT EXERCISE IS EXCLUDED IN MEMORY, not in SQL, so there is one code
 * path that always excludes correctly — including when the row's id is not a
 * usable string, where `neq('id', '')` against a `uuid` column would be a cast
 * error that fail-safes the whole block to empty. The cost is bounded to
 * exactly one extra row, which is why the query asks for `limit + 1`.
 *
 * FAIL-SAFE: `[]` on any error. An empty result is also the ordinary answer for
 * a level that holds nothing else, and the caller renders NOTHING for it — an
 * empty "related" heading is noise, not information.
 */
export async function getRelatedExercises(
  current: Exercise,
  limit: number = RELATED_LIMIT,
): Promise<Exercise[]> {
  if (!isLevel(current.level) || limit <= 0) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(EXERCISES_TABLE)
      .select(EXERCISE_COLUMNS)
      .eq('level', current.level)
      // Drafts must not be reachable through a suggestion either.
      .eq('published', true)
      .order('focus', { ascending: true })
      .order('slug', { ascending: true })
      // `limit + 1`: the current exercise is itself a row at this level and may
      // sit inside the window, so asking for exactly `limit` would render
      // `limit - 1` cards whenever it does.
      .limit(limit + 1);

    if (error) {
      console.error('[exercises] getRelatedExercises failed:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data
      .flatMap((raw): Exercise[] => {
        const row = raw as unknown as Record<string, unknown>;
        // The focus VARIES across these rows, unlike every other read here, so
        // it is validated per row: a focus outside the taxonomy would build a
        // card linking to a URL the route 404s on. `topic` needs no such guard
        // — it is not in the link, and an unknown value simply renders nothing.
        if (!isFocus(row?.focus)) return [];
        if (typeof row.slug !== 'string' || row.slug.length === 0) return [];

        const payload = parsePayload(row.payload);
        if (!payload) {
          console.error('[exercises] malformed payload for slug:', row.slug);
          return [];
        }

        return [
          {
            id: typeof row.id === 'string' ? row.id : '',
            slug: row.slug,
            skill: row.skill as Skill,
            level: current.level,
            focus: row.focus,
            topic: readTopic(row.topic),
            payload,
            hasAudio: hasAudio(payload),
          },
        ];
      })
      .filter((candidate) => !isSameExercise(candidate, current))
      .slice(0, limit);
  } catch (err) {
    console.error('[exercises] getRelatedExercises threw:', err);
    return [];
  }
}

/**
 * Reset the lazily-created service client. Primarily for test isolation: it is
 * a module-level singleton, so a test that configures a key would otherwise
 * leak the live client into a later "unconfigured key" test.
 */
export function clearExercisesClient(): void {
  serviceClient = null;
}
