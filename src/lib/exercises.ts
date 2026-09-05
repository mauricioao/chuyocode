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
 * Reset the lazily-created service client. Primarily for test isolation: it is
 * a module-level singleton, so a test that configures a key would otherwise
 * leak the live client into a later "unconfigured key" test.
 */
export function clearExercisesClient(): void {
  serviceClient = null;
}
