/**
 * Public reads for the (still hidden) Courses feature: the catalog
 * (`/[lang]/cursos`) and a course's full detail — landing page
 * (`/[lang]/cursos/[slug]`) and lesson player
 * (`/[lang]/cursos/[slug]/[lessonId]`) share the same `getCourseDetailBySlug`,
 * since both need the whole syllabus (modules + lessons); the player is the
 * only caller that ever reads a lesson's `content`.
 *
 * Deliberately separate from `src/lib/courses/admin.ts`: nothing under
 * `/[lang]/cursos/**` ever imports the authoring module, keeping "a
 * moderator can write" and "anyone can read what's published" on two
 * independent code paths.
 *
 * FAIL-SAFE throughout — same posture as `getPublishedActivities`: an
 * outage collapses to an empty catalog / `null` detail, never a 500.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import {
  COURSES_TABLE,
  COURSE_MODULES_TABLE,
  COURSE_LESSONS_TABLE,
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
export function clearCoursesCatalogClient(): void {
  serviceClient = null;
}

export interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: string | null;
  coverPath: string | null;
  includedInPremium: boolean;
  priceCents: number | null;
  currency: string;
  lessonCount: number;
}

/**
 * Every `published` course, newest first, with its total lesson count.
 * Three queries total regardless of catalog size (courses, then every
 * module of those courses, then every lesson of those modules) rather than
 * one query per course — the catalog is small, but N+1 is still the wrong
 * shape to reach for.
 */
export async function listPublishedCourses(): Promise<CatalogCourse[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const { data: courses, error } = await client
      .from(COURSES_TABLE)
      .select('id, slug, title, subtitle, level, cover_path, included_in_premium, price_cents, currency')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error || !Array.isArray(courses) || courses.length === 0) return [];

    const courseRows = courses as unknown as Record<string, unknown>[];
    const courseIds = courseRows.map((c) => c.id as string);

    const { data: modules } = await client
      .from(COURSE_MODULES_TABLE)
      .select('id, course_id')
      .in('course_id', courseIds);

    const moduleRows = (Array.isArray(modules) ? modules : []) as unknown as Record<string, unknown>[];
    const moduleToCourse = new Map(moduleRows.map((m) => [m.id as string, m.course_id as string]));
    const moduleIds = moduleRows.map((m) => m.id as string);

    const lessonCounts = new Map<string, number>();
    if (moduleIds.length > 0) {
      const { data: lessons } = await client.from(COURSE_LESSONS_TABLE).select('module_id').in('module_id', moduleIds);
      const lessonRows = (Array.isArray(lessons) ? lessons : []) as unknown as Record<string, unknown>[];
      for (const lesson of lessonRows) {
        const courseId = moduleToCourse.get(lesson.module_id as string);
        if (courseId) lessonCounts.set(courseId, (lessonCounts.get(courseId) ?? 0) + 1);
      }
    }

    return courseRows.map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      title: c.title as string,
      subtitle: (c.subtitle as string | null) ?? null,
      level: (c.level as string | null) ?? null,
      coverPath: (c.cover_path as string | null) ?? null,
      includedInPremium: c.included_in_premium === true,
      priceCents: (c.price_cents as number | null) ?? null,
      currency: (c.currency as string) ?? 'USD',
      lessonCount: lessonCounts.get(c.id as string) ?? 0,
    }));
  } catch (err) {
    console.error('[courses/catalog] listPublishedCourses threw:', err);
    return [];
  }
}

export interface DetailLesson {
  id: string;
  position: number;
  title: string;
  kind: LessonKind;
  content: Record<string, unknown>;
  duration_min: number | null;
  is_preview: boolean;
}

export interface DetailModule {
  id: string;
  position: number;
  title: string;
  lessons: DetailLesson[];
}

export interface CourseDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  level: string | null;
  coverPath: string | null;
  status: CourseStatus;
  includedInPremium: boolean;
  priceCents: number | null;
  currency: string;
  modules: DetailModule[];
}

/**
 * The full course + syllabus by slug, ANY status — the caller (landing/player
 * page frontmatter) is responsible for 404ing a non-`published` course to a
 * non-moderator via `courseVisible` (`@lib/courses/access`); this loader does
 * not apply that rule itself, same split `getCourseForEdit` draws for the
 * admin side.
 */
export async function getCourseDetailBySlug(slug: string): Promise<CourseDetail | null> {
  if (slug.length === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const { data: course, error: courseError } = await client
      .from(COURSES_TABLE)
      .select(
        'id, slug, title, subtitle, description, level, cover_path, status, included_in_premium, price_cents, currency',
      )
      .eq('slug', slug)
      .maybeSingle();

    if (courseError || !course) return null;
    const courseRow = course as unknown as Record<string, unknown>;
    if (typeof courseRow.id !== 'string') return null;

    const { data: modules, error: modulesError } = await client
      .from(COURSE_MODULES_TABLE)
      .select('id, position, title')
      .eq('course_id', courseRow.id)
      .order('position', { ascending: true });

    if (modulesError || !Array.isArray(modules)) return null;

    const moduleRows = modules as unknown as Record<string, unknown>[];
    const moduleIds = moduleRows.map((m) => m.id as string);

    let lessonsByModule = new Map<string, DetailLesson[]>();
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
      id: courseRow.id,
      slug: courseRow.slug as string,
      title: courseRow.title as string,
      subtitle: (courseRow.subtitle as string | null) ?? null,
      description: (courseRow.description as string | null) ?? null,
      level: (courseRow.level as string | null) ?? null,
      coverPath: (courseRow.cover_path as string | null) ?? null,
      status: courseRow.status as CourseStatus,
      includedInPremium: courseRow.included_in_premium === true,
      priceCents: (courseRow.price_cents as number | null) ?? null,
      currency: (courseRow.currency as string) ?? 'USD',
      modules: moduleRows.map((row) => ({
        id: row.id as string,
        position: row.position as number,
        title: row.title as string,
        lessons: lessonsByModule.get(row.id as string) ?? [],
      })),
    };
  } catch (err) {
    console.error('[courses/catalog] getCourseDetailBySlug threw:', err);
    return null;
  }
}
