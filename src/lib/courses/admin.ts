/**
 * Course authoring — the data layer behind `/[lang]/admin/cursos/**` and
 * `/api/admin/cursos/**`. Every write here assumes the caller has already
 * been through `requireRole(user, 'moderator')`; nothing in this module
 * checks roles itself (same split as `src/lib/activities/moderation.ts`).
 *
 * All reads/writes go through the service-role client — `courses`,
 * `course_modules`, `course_lessons`, and `course_purchases` all have RLS on
 * with zero policies (`0017_courses.sql`), so nothing here is reachable any
 * other way.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { getPublishedActivity } from '../activities/activities';
import {
  COURSES_TABLE,
  COURSE_MODULES_TABLE,
  COURSE_LESSONS_TABLE,
  COURSE_PURCHASES_TABLE,
  type CourseStatus,
  type LessonKind,
} from './access';

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

/** Test isolation only — see `src/lib/access.ts#clearAccessClient`. */
export function clearCoursesAdminClient(): void {
  serviceClient = null;
}

export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LEVELS: readonly string[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const STATUSES: readonly CourseStatus[] = ['draft', 'published', 'archived'];
const LESSON_KINDS: readonly LessonKind[] = ['text', 'video', 'activity'];
const VIDEO_HOSTS: readonly string[] = [
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
];

// --- Courses ------------------------------------------------------------

export interface CourseInput {
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  level?: string | null;
  cover_path?: string | null;
  included_in_premium?: boolean;
  price_cents?: number | null;
  currency?: string;
}

export interface CourseListRow {
  id: string;
  slug: string;
  title: string;
  status: CourseStatus;
  included_in_premium: boolean;
  price_cents: number | null;
}

export interface CourseRecord extends CourseListRow {
  subtitle: string | null;
  description: string | null;
  level: string | null;
  cover_path: string | null;
  currency: string;
  published_at: string | null;
}

/** Shared shape validation for both `createCourse` and `updateCourse`. Only checks fields present in `input`. */
function validateCourseInput(input: Partial<CourseInput>): string | null {
  if (input.slug !== undefined && !SLUG_RE.test(input.slug)) return 'invalid_slug';
  if (input.title !== undefined && (input.title.trim().length === 0 || input.title.length > 120)) {
    return 'invalid_title';
  }
  if (input.subtitle != null && input.subtitle.length > 200) return 'invalid_subtitle';
  if (input.level != null && !LEVELS.includes(input.level)) return 'invalid_level';
  if (input.price_cents != null && input.price_cents < 0) return 'invalid_price';
  return null;
}

/** Every course, every status — the admin list page shows drafts and archived courses too. */
export async function listCourses(): Promise<CourseListRow[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(COURSES_TABLE)
      .select('id, slug, title, status, included_in_premium, price_cents')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];
    return data as unknown as CourseListRow[];
  } catch (err) {
    console.error('[courses/admin] listCourses threw:', err);
    return [];
  }
}

export async function createCourse(input: CourseInput, createdBy: string): Promise<AdminResult<CourseRecord>> {
  const validationError = validateCourseInput(input);
  if (validationError) return { ok: false, error: validationError };

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { data, error } = await client
      .from(COURSES_TABLE)
      .insert({
        slug: input.slug,
        title: input.title,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        level: input.level ?? null,
        cover_path: input.cover_path ?? null,
        included_in_premium: input.included_in_premium ?? true,
        price_cents: input.price_cents ?? null,
        currency: input.currency ?? 'USD',
        created_by: createdBy,
      })
      .select('id, slug, title, subtitle, description, level, cover_path, status, included_in_premium, price_cents, currency, published_at')
      .single();

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'duplicate_slug' };
      console.error('[courses/admin] createCourse failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: data as unknown as CourseRecord };
  } catch (err) {
    console.error('[courses/admin] createCourse threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export interface ModuleWithLessons {
  id: string;
  position: number;
  title: string;
  lessons: LessonRecord[];
}

export interface LessonRecord {
  id: string;
  position: number;
  title: string;
  kind: LessonKind;
  content: Record<string, unknown>;
  duration_min: number | null;
  is_preview: boolean;
}

export interface CourseForEdit extends CourseRecord {
  modules: ModuleWithLessons[];
}

/** The full authoring view: the course plus every module and lesson, ordered by position. `null` if the id does not exist. */
export async function getCourseForEdit(id: string): Promise<CourseForEdit | null> {
  if (id.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data: course, error: courseError } = await client
      .from(COURSES_TABLE)
      .select('id, slug, title, subtitle, description, level, cover_path, status, included_in_premium, price_cents, currency, published_at')
      .eq('id', id)
      .maybeSingle();

    if (courseError || !course) return null;

    const { data: modules, error: modulesError } = await client
      .from(COURSE_MODULES_TABLE)
      .select('id, position, title')
      .eq('course_id', id)
      .order('position', { ascending: true });

    if (modulesError || !Array.isArray(modules)) return null;

    const moduleIds = modules.map((m) => (m as Record<string, unknown>).id as string);
    let lessonsByModule = new Map<string, LessonRecord[]>();
    if (moduleIds.length > 0) {
      const { data: lessons, error: lessonsError } = await client
        .from(COURSE_LESSONS_TABLE)
        .select('id, module_id, position, title, kind, content, duration_min, is_preview')
        .in('module_id', moduleIds)
        .order('position', { ascending: true });

      if (lessonsError || !Array.isArray(lessons)) return null;

      lessonsByModule = new Map();
      for (const raw of lessons) {
        const row = raw as unknown as Record<string, unknown>;
        const moduleId = row.module_id as string;
        const list = lessonsByModule.get(moduleId) ?? [];
        list.push({
          id: row.id as string,
          position: row.position as number,
          title: row.title as string,
          kind: row.kind as LessonKind,
          content: (row.content as Record<string, unknown>) ?? {},
          duration_min: (row.duration_min as number | null) ?? null,
          is_preview: row.is_preview === true,
        });
        lessonsByModule.set(moduleId, list);
      }
    }

    return {
      ...(course as unknown as CourseRecord),
      modules: modules.map((raw) => {
        const row = raw as unknown as Record<string, unknown>;
        return {
          id: row.id as string,
          position: row.position as number,
          title: row.title as string,
          lessons: lessonsByModule.get(row.id as string) ?? [],
        };
      }),
    };
  } catch (err) {
    console.error('[courses/admin] getCourseForEdit threw:', err);
    return null;
  }
}

export async function updateCourse(
  id: string,
  patch: Partial<CourseInput>,
): Promise<AdminResult<true>> {
  const validationError = validateCourseInput(patch);
  if (validationError) return { ok: false, error: validationError };

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { error } = await client.from(COURSES_TABLE).update(patch).eq('id', id);
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'duplicate_slug' };
      console.error('[courses/admin] updateCourse failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] updateCourse threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

/** Publish/archive/unpublish. Sets `published_at` the first time a course becomes `published`; never overwrites it afterward. */
export async function setCourseStatus(id: string, status: CourseStatus): Promise<AdminResult<true>> {
  if (!STATUSES.includes(status)) return { ok: false, error: 'invalid_status' };

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const patch: Record<string, unknown> = { status };
    if (status === 'published') {
      const { data: existing } = await client.from(COURSES_TABLE).select('published_at').eq('id', id).maybeSingle();
      const row = existing as unknown as Record<string, unknown> | null;
      if (!row || row.published_at == null) {
        patch.published_at = new Date().toISOString();
      }
    }

    const { error } = await client.from(COURSES_TABLE).update(patch).eq('id', id);
    if (error) {
      console.error('[courses/admin] setCourseStatus failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] setCourseStatus threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

// --- Modules --------------------------------------------------------------

export async function createModule(courseId: string, title: string): Promise<AdminResult<{ id: string }>> {
  if (title.trim().length === 0 || title.length > 120) return { ok: false, error: 'invalid_title' };

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { data: existing, error: countError } = await client
      .from(COURSE_MODULES_TABLE)
      .select('position')
      .eq('course_id', courseId)
      .order('position', { ascending: false })
      .limit(1);

    if (countError) return { ok: false, error: 'db_error' };
    const nextPosition = Array.isArray(existing) && existing.length > 0
      ? ((existing[0] as unknown as Record<string, unknown>).position as number) + 1
      : 0;

    const { data, error } = await client
      .from(COURSE_MODULES_TABLE)
      .insert({ course_id: courseId, title, position: nextPosition })
      .select('id')
      .single();

    if (error) {
      console.error('[courses/admin] createModule failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: { id: (data as unknown as Record<string, unknown>).id as string } };
  } catch (err) {
    console.error('[courses/admin] createModule threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export async function renameModule(moduleId: string, title: string): Promise<AdminResult<true>> {
  if (title.trim().length === 0 || title.length > 120) return { ok: false, error: 'invalid_title' };

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { error } = await client.from(COURSE_MODULES_TABLE).update({ title }).eq('id', moduleId);
    if (error) return { ok: false, error: 'db_error' };
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] renameModule threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export async function deleteModule(moduleId: string): Promise<AdminResult<true>> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { error } = await client.from(COURSE_MODULES_TABLE).delete().eq('id', moduleId);
    if (error) return { ok: false, error: 'db_error' };
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] deleteModule threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

/**
 * Two-phase renumbering so no intermediate write ever collides with the
 * `unique(course_id, position)` (or `unique(module_id, position)`)
 * constraint: every row first moves to a high, certainly-unused offset
 * (`10000 + index`), THEN each row is set to its real final position
 * (`0..n-1`) — by the time phase two runs, no remaining phase-one value can
 * equal any phase-two target, so no write ever collides with another row's
 * CURRENT value. Each `.update()` is its own PostgREST request/transaction,
 * so the migration's `deferrable` constraint cannot help across requests;
 * this ordering is what actually makes reordering safe.
 */
async function reorderByTwoPhase(
  client: SupabaseClient,
  table: string,
  parentColumn: string,
  parentId: string,
  orderedIds: readonly string[],
): Promise<AdminResult<true>> {
  try {
    const { data: existing, error: fetchError } = await client
      .from(table)
      .select('id')
      .eq(parentColumn, parentId);

    if (fetchError || !Array.isArray(existing)) return { ok: false, error: 'db_error' };

    const existingIds = new Set(existing.map((r) => (r as unknown as Record<string, unknown>).id as string));
    if (existingIds.size !== orderedIds.length || !orderedIds.every((id) => existingIds.has(id))) {
      return { ok: false, error: 'invalid_order' };
    }

    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await client.from(table).update({ position: 10_000 + i }).eq('id', orderedIds[i]);
      if (error) return { ok: false, error: 'db_error' };
    }
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await client.from(table).update({ position: i }).eq('id', orderedIds[i]);
      if (error) return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: true };
  } catch (err) {
    console.error(`[courses/admin] reorder (${table}) threw:`, err);
    return { ok: false, error: 'db_error' };
  }
}

export async function reorderModules(courseId: string, orderedModuleIds: readonly string[]): Promise<AdminResult<true>> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };
  return reorderByTwoPhase(client, COURSE_MODULES_TABLE, 'course_id', courseId, orderedModuleIds);
}

export async function reorderLessons(moduleId: string, orderedLessonIds: readonly string[]): Promise<AdminResult<true>> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };
  return reorderByTwoPhase(client, COURSE_LESSONS_TABLE, 'module_id', moduleId, orderedLessonIds);
}

// --- Lessons ----------------------------------------------------------

export interface LessonInput {
  title: string;
  kind: LessonKind;
  content: Record<string, unknown>;
  duration_min?: number | null;
  is_preview?: boolean;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && VIDEO_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates `content` against its `kind`'s closed shape (file header of
 * `0017_courses.sql`). For `kind: 'activity'`, also confirms the referenced
 * activity is actually LIVE (published) — an admin cannot wire a lesson to a
 * draft/unpublished activity, or one that no longer exists.
 */
async function validateLessonContent(input: Pick<LessonInput, 'kind' | 'content'>): Promise<string | null> {
  if (!LESSON_KINDS.includes(input.kind)) return 'invalid_kind';

  if (input.kind === 'text') {
    const markdown = input.content?.markdown;
    if (typeof markdown !== 'string' || markdown.trim().length === 0) return 'invalid_content';
    return null;
  }

  if (input.kind === 'video') {
    if (!isHttpsUrl(input.content?.url)) return 'invalid_content';
    return null;
  }

  // kind === 'activity'
  const activityId = input.content?.activityId;
  if (typeof activityId !== 'string' || !UUID_RE.test(activityId)) return 'invalid_content';
  const activity = await getPublishedActivity(activityId);
  if (!activity) return 'activity_not_live';
  return null;
}

export async function createLesson(moduleId: string, input: LessonInput): Promise<AdminResult<{ id: string }>> {
  if (input.title.trim().length === 0 || input.title.length > 120) return { ok: false, error: 'invalid_title' };
  if (input.duration_min != null && input.duration_min <= 0) return { ok: false, error: 'invalid_duration' };

  const contentError = await validateLessonContent(input);
  if (contentError) return { ok: false, error: contentError };

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { data: existing, error: countError } = await client
      .from(COURSE_LESSONS_TABLE)
      .select('position')
      .eq('module_id', moduleId)
      .order('position', { ascending: false })
      .limit(1);

    if (countError) return { ok: false, error: 'db_error' };
    const nextPosition = Array.isArray(existing) && existing.length > 0
      ? ((existing[0] as unknown as Record<string, unknown>).position as number) + 1
      : 0;

    const { data, error } = await client
      .from(COURSE_LESSONS_TABLE)
      .insert({
        module_id: moduleId,
        title: input.title,
        kind: input.kind,
        content: input.content,
        duration_min: input.duration_min ?? null,
        is_preview: input.is_preview ?? false,
        position: nextPosition,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[courses/admin] createLesson failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: { id: (data as unknown as Record<string, unknown>).id as string } };
  } catch (err) {
    console.error('[courses/admin] createLesson threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export async function updateLesson(lessonId: string, patch: Partial<LessonInput>): Promise<AdminResult<true>> {
  if (patch.title !== undefined && (patch.title.trim().length === 0 || patch.title.length > 120)) {
    return { ok: false, error: 'invalid_title' };
  }
  if (patch.duration_min != null && patch.duration_min <= 0) return { ok: false, error: 'invalid_duration' };

  if (patch.kind !== undefined || patch.content !== undefined) {
    if (patch.kind === undefined || patch.content === undefined) {
      // kind and content must change together — validating one without the
      // other cannot tell whether the resulting row still matches its kind.
      return { ok: false, error: 'invalid_content' };
    }
    const contentError = await validateLessonContent({ kind: patch.kind, content: patch.content });
    if (contentError) return { ok: false, error: contentError };
  }

  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { error } = await client.from(COURSE_LESSONS_TABLE).update(patch).eq('id', lessonId);
    if (error) {
      console.error('[courses/admin] updateLesson failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] updateLesson threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export async function deleteLesson(lessonId: string): Promise<AdminResult<true>> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { error } = await client.from(COURSE_LESSONS_TABLE).delete().eq('id', lessonId);
    if (error) return { ok: false, error: 'db_error' };
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] deleteLesson threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

// --- Grants ("Otorgar acceso") ------------------------------------------

export interface Owner {
  userId: string;
  email: string | null;
  source: 'purchase' | 'grant' | 'promo';
  createdAt: string;
}

/**
 * Finds a user by email via the admin API, scanning up to 1000 users
 * (10 pages of 100) — `auth.admin.listUsers` has no server-side email
 * filter in this Supabase SDK version. Fine at this site's current scale;
 * revisit if the user base outgrows it.
 */
async function findUserByEmail(client: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (target.length === 0) return null;

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return null;
    const users = (data as unknown as { users: User[] } | null)?.users ?? [];
    const found = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (found) return found;
    if (users.length < 100) break;
  }
  return null;
}

/** Grants lifetime access by email — creates a `course_purchases` row with `source: 'grant'`. */
export async function grantAccess(
  courseId: string,
  email: string,
  grantedBy: string,
): Promise<AdminResult<true>> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const user = await findUserByEmail(client, email);
    if (!user) return { ok: false, error: 'user_not_found' };

    const { error } = await client.from(COURSE_PURCHASES_TABLE).insert({
      user_id: user.id,
      course_id: courseId,
      source: 'grant',
      granted_by: grantedBy,
    });

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'already_owned' };
      console.error('[courses/admin] grantAccess failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] grantAccess threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export async function revokeAccess(courseId: string, userId: string): Promise<AdminResult<true>> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  try {
    const { error } = await client
      .from(COURSE_PURCHASES_TABLE)
      .delete()
      .eq('course_id', courseId)
      .eq('user_id', userId);

    if (error) return { ok: false, error: 'db_error' };
    return { ok: true, value: true };
  } catch (err) {
    console.error('[courses/admin] revokeAccess threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

export async function listOwners(courseId: string): Promise<Owner[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from(COURSE_PURCHASES_TABLE)
      .select('user_id, source, created_at')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];

    const rows = data as unknown as Record<string, unknown>[];
    const emails = new Map<string, string | null>();
    await Promise.all(
      Array.from(new Set(rows.map((r) => r.user_id as string))).map(async (userId) => {
        try {
          const { data: userData, error: userError } = await client.auth.admin.getUserById(userId);
          const found = (userData as unknown as { user: User | null } | null)?.user ?? null;
          emails.set(userId, !userError && found ? (found.email ?? null) : null);
        } catch {
          emails.set(userId, null);
        }
      }),
    );

    return rows.map((row) => ({
      userId: row.user_id as string,
      email: emails.get(row.user_id as string) ?? null,
      source: row.source as Owner['source'],
      createdAt: row.created_at as string,
    }));
  } catch (err) {
    console.error('[courses/admin] listOwners threw:', err);
    return [];
  }
}
