/**
 * Access model for the hidden Courses feature (`supabase/migrations/0017_courses.sql`).
 *
 * Two access rules stack on top of the section-level gate `src/lib/access.ts`
 * already enforces (`/[lang]/cursos/**` requires login):
 *
 *   1. A PREMIUM subscription (`src/lib/access.ts#getPlan`) unlocks every
 *      course with `included_in_premium = true`.
 *   2. A `course_purchases` row (any `source`: purchase/grant/promo) grants
 *      LIFETIME access to that one course, independent of plan.
 *
 * Kept as pure, zero-I/O predicates (`courseVisible`, `courseAccess`,
 * `canViewLesson`) plus two thin data loaders, exactly like `src/lib/access.ts`
 * splits `requiresLogin`/`hasAccess` from `getPlan` — the predicates are
 * unit-testable without a database, and the loaders are the only place a
 * schema change touches.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import type { Plan } from '../access';

export const COURSES_TABLE = 'courses';
export const COURSE_MODULES_TABLE = 'course_modules';
export const COURSE_LESSONS_TABLE = 'course_lessons';
export const COURSE_PURCHASES_TABLE = 'course_purchases';

export type CourseStatus = 'draft' | 'published' | 'archived';
export type LessonKind = 'text' | 'video' | 'activity';

/** The columns the pure predicates below actually read — never the whole row. */
export interface CourseAccessFields {
  status: CourseStatus;
  included_in_premium: boolean;
}

export interface LessonAccessFields {
  is_preview: boolean;
}

/** What the landing page's CTA area shows: locked-to-preview, unlocked-by-plan, or owned outright. */
export type CourseAccessLevel = 'preview-only' | 'premium' | 'owned';

/**
 * Should this course's pages render at all, or 404?
 *
 * `draft`/`archived` courses 404 for ordinary visitors — only `published`
 * courses are ever reachable by URL. Moderators bypass this entirely: they
 * need to open a draft to author it before it is published (same posture as
 * every other `/[lang]/admin/**` surface, mirrored here for the public
 * preview a moderator needs while authoring).
 */
export function courseVisible(
  course: Pick<CourseAccessFields, 'status'>,
  isModerator: boolean,
): boolean {
  return isModerator || course.status === 'published';
}

/**
 * Which access level applies to this course for this visitor.
 *
 * Ownership (a `course_purchases` row) always wins, then an active premium
 * plan on a course marked `included_in_premium`, else the visitor only ever
 * sees preview-flagged lessons. Moderators are treated as owning every
 * course so authoring previews render the full syllabus unlocked.
 */
export function courseAccess(params: {
  course: Pick<CourseAccessFields, 'included_in_premium'>;
  plan: Plan;
  owns: boolean;
  isModerator?: boolean;
}): CourseAccessLevel {
  const { course, plan, owns, isModerator } = params;
  if (isModerator || owns) return 'owned';
  if (plan === 'premium' && course.included_in_premium) return 'premium';
  return 'preview-only';
}

/**
 * May this particular lesson's content be viewed (vs. showing the lock
 * screen)? `lesson.is_preview` always wins regardless of plan/ownership —
 * that is the whole point of a preview lesson. Moderators bypass every rule.
 */
export function canViewLesson(params: {
  lesson: Pick<LessonAccessFields, 'is_preview'>;
  course: Pick<CourseAccessFields, 'included_in_premium'>;
  plan: Plan;
  owns: boolean;
  isModerator?: boolean;
}): boolean {
  const { lesson, course, plan, owns, isModerator } = params;
  if (isModerator) return true;
  return lesson.is_preview || (plan === 'premium' && course.included_in_premium) || owns;
}

// --- Data loaders -----------------------------------------------------

/**
 * Lazily-created service-role client — same pattern as `src/lib/access.ts`
 * and `src/lib/roles.ts`: created on first use, not at module load, so the
 * app still boots with `SUPABASE_SERVICE_ROLE_KEY` unset (every loader below
 * then fails to its safe default instead of throwing).
 */
let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

/** Reset the lazily-created service client — test isolation only (see `src/lib/access.ts#clearAccessClient`). */
export function clearCoursesAccessClient(): void {
  serviceClient = null;
}

export interface CourseSummary extends CourseAccessFields {
  id: string;
  slug: string;
  title: string;
}

/**
 * Fetch one course by its URL slug — just the columns the access/landing
 * layer needs. FAILS OPEN to `null` (no client, no row, or a Supabase
 * error): the same posture `getPublishedActivity` takes, because the worst
 * case is a 404 for a course that does, in fact, exist.
 */
export async function getCourseBySlug(slug: string): Promise<CourseSummary | null> {
  if (slug.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(COURSES_TABLE)
      .select('id, slug, title, status, included_in_premium')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('[courses/access] getCourseBySlug failed:', error.message);
      return null;
    }
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    if (typeof row.id !== 'string' || row.id.length === 0) return null;
    if (typeof row.title !== 'string') return null;
    if (row.status !== 'draft' && row.status !== 'published' && row.status !== 'archived') {
      return null;
    }

    return {
      id: row.id,
      slug,
      title: row.title,
      status: row.status,
      included_in_premium: row.included_in_premium === true,
    };
  } catch (err) {
    console.error('[courses/access] getCourseBySlug threw:', err);
    return null;
  }
}

/**
 * Does `user` hold a lifetime entitlement (any `source`) for `courseId`?
 *
 * FAILS CLOSED to `false` — the inverse of {@link getCourseBySlug} — for the
 * same reason `src/lib/roles.ts#hasRole` fails closed: the worst case of
 * failing open here is granting paid content to someone who never paid for
 * it, while failing closed only ever costs a real owner a cache-miss retry.
 */
export async function ownsCourse(
  user: Pick<User, 'id'> | null,
  courseId: string,
): Promise<boolean> {
  if (!user || courseId.length === 0) return false;

  const client = getClient();
  if (!client) return false;

  try {
    const { data, error } = await client
      .from(COURSE_PURCHASES_TABLE)
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle();

    if (error) {
      console.error('[courses/access] ownsCourse failed:', error.message);
      return false;
    }
    return data !== null;
  } catch (err) {
    console.error('[courses/access] ownsCourse threw:', err);
    return false;
  }
}
