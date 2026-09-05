/**
 * Server-only read path for English exercises.
 *
 * One query for now: fetch a single PUBLISHED exercise by its deep link
 * `(level, topic, slug)` — the tuple the table is uniquely keyed on.
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
  isTopic,
  type Level,
  type Skill,
  type Topic,
} from './exerciseTaxonomy';

/** DB table name — must match the SQL migration. */
export const EXERCISES_TABLE = 'exercises';

/** Columns the detail route needs. Selected explicitly, never `*`. */
const EXERCISE_COLUMNS = 'id, slug, skill, level, topic, payload';

/**
 * Columns the entry screen groups by. Just the two the facets are built from —
 * counting exercises never needs their payloads.
 */
const FACET_COLUMNS = 'level, topic';

/** A published exercise, validated and ready to render. */
export interface Exercise {
  id: string;
  slug: string;
  skill: Skill;
  level: Level;
  topic: Topic;
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
 * Fetch one published exercise by its deep link, or `null`.
 *
 * `null` covers every failure equally — unknown taxonomy, no matching row, a
 * Supabase error, a thrown client, an unconfigured key, or a payload that no
 * renderer could draw. The caller does not need to tell them apart; they are
 * all "this URL has no exercise", which is a 404.
 *
 * Invalid `level`/`topic` are rejected BEFORE the query: a segment that is not
 * in the taxonomy can never match a row, so spending a round trip on it only
 * makes the 404 slower.
 */
export async function getExerciseBySlug(
  level: string,
  topic: string,
  slug: string,
): Promise<Exercise | null> {
  if (!isLevel(level) || !isTopic(topic) || slug.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(EXERCISES_TABLE)
      .select(EXERCISE_COLUMNS)
      .eq('level', level)
      .eq('topic', topic)
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
      topic,
      payload,
      hasAudio: hasAudio(payload),
    };
  } catch (err) {
    console.error('[exercises] getExerciseBySlug threw:', err);
    return null;
  }
}

/**
 * Fetch the `(level, topic)` pair of every published exercise.
 *
 * ONE flat read backing the whole entry screen. The obvious alternative — a
 * count per CEFR level — is six round trips to paint one row of chips, and it
 * still would not tell us WHICH topics exist under each level. Grouping is
 * pure, cheap and testable (`src/lib/exerciseFacets.ts`), so the database is
 * asked once and the shaping happens in memory.
 *
 * The payload column is deliberately NOT selected: the entry screen counts
 * exercises, it never renders one, and pulling every `jsonb` blob to produce a
 * number would be the expensive way to be wrong.
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
      if (typeof row?.level !== 'string' || typeof row?.topic !== 'string') {
        return [];
      }
      return [{ level: row.level, topic: row.topic }];
    });
  } catch (err) {
    console.error('[exercises] getExerciseFacetRows threw:', err);
    return [];
  }
}

/**
 * Fetch every published exercise for one `(level, topic)` pair.
 *
 * An EMPTY array is a legitimate answer, not a failure: a valid combination
 * with nothing published yet is a real page that renders an empty state, never
 * a 404. The caller cannot distinguish "empty" from "Supabase is down" — and it
 * must not, because both render the same honest "nothing here" screen.
 *
 * A row whose payload drifted out of shape is DROPPED rather than fatal: one
 * unparseable exercise must not blank out the whole listing around it.
 *
 * Invalid `level`/`topic` are rejected BEFORE the query, mirroring
 * {@link getExerciseBySlug} — a segment outside the taxonomy can never match.
 */
export async function getPublishedExercises(
  level: string,
  topic: string,
): Promise<Exercise[]> {
  if (!isLevel(level) || !isTopic(topic)) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(EXERCISES_TABLE)
      .select(EXERCISE_COLUMNS)
      .eq('level', level)
      .eq('topic', topic)
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
          topic,
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
 * Reset the lazily-created service client. Primarily for test isolation: it is
 * a module-level singleton, so a test that configures a key would otherwise
 * leak the live client into a later "unconfigured key" test.
 */
export function clearExercisesClient(): void {
  serviceClient = null;
}
