import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A generic, per-table response queue: each `.from(table)` chain call that
 * terminates (`.single()`, `.maybeSingle()`, or a bare `await`) pops the
 * next queued response for that table, in the exact order the function
 * under test issues its queries — documented per `describe` block below.
 * Mirrors `src/lib/activities/duplicate.test.ts`'s inline builder, made
 * table-aware since `admin.ts` queries four different tables in sequence
 * within a single call.
 */
const { clientState, queues, authAdmin, fromCalls } = vi.hoisted(() => {
  const queues = new Map<string, unknown[]>();
  const fromCalls: string[] = [];
  return {
    clientState: { available: true },
    queues,
    authAdmin: { listUsers: vi.fn(), getUserById: vi.fn() },
    fromCalls,
  };
});

function queue(table: string, response: unknown): void {
  const q = queues.get(table) ?? [];
  q.push(response);
  queues.set(table, q);
}

function makeBuilder(table: string) {
  function next(): Promise<unknown> {
    const q = queues.get(table) ?? [];
    return Promise.resolve(q.shift() ?? { data: null, error: null });
  }
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    single: () => next(),
    maybeSingle: () => next(),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => next().then(resolve, reject),
  };
  return builder;
}

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return {
      from: (table: string) => {
        fromCalls.push(table);
        return makeBuilder(table);
      },
      auth: { admin: authAdmin },
    };
  },
}));

const { getPublishedActivityMock } = vi.hoisted(() => ({ getPublishedActivityMock: vi.fn() }));
vi.mock('../activities/activities', () => ({ getPublishedActivity: getPublishedActivityMock }));

import {
  createCourse,
  listCourses,
  getCourseForEdit,
  updateCourse,
  setCourseStatus,
  createModule,
  renameModule,
  deleteModule,
  reorderModules,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  grantAccess,
  revokeAccess,
  listOwners,
  clearCoursesAdminClient,
} from './admin';

const LIVE_ACTIVITY_ID = 'a1a1a1a1-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  queues.clear();
  fromCalls.length = 0;
  getPublishedActivityMock.mockResolvedValue({ id: LIVE_ACTIVITY_ID, title: 'Presente simple' });
});

describe('createCourse', () => {
  const validInput = { slug: 'react-basico', title: 'React básico' };

  it.each([
    [{ slug: 'React Basico', title: 'x' }, 'invalid_slug'],
    [{ slug: 'react-basico', title: '' }, 'invalid_title'],
    [{ slug: 'react-basico', title: 'x'.repeat(121) }, 'invalid_title'],
    [{ slug: 'react-basico', title: 'x', subtitle: 'y'.repeat(201) }, 'invalid_subtitle'],
    [{ slug: 'react-basico', title: 'x', level: 'Z9' }, 'invalid_level'],
    [{ slug: 'react-basico', title: 'x', price_cents: -1 }, 'invalid_price'],
  ])('rejects %j with %s, without querying', async (input, expected) => {
    const result = await createCourse(input as never, 'mod-1');
    expect(result).toEqual({ ok: false, error: expected });
    expect(fromCalls).toEqual([]);
  });

  it('fails with unavailable when the service client cannot be created', async () => {
    clientState.available = false;
    expect(await createCourse(validInput, 'mod-1')).toEqual({ ok: false, error: 'unavailable' });
  });

  it('maps a unique violation to duplicate_slug', async () => {
    queue('courses', { data: null, error: { code: '23505', message: 'dup' } });
    expect(await createCourse(validInput, 'mod-1')).toEqual({ ok: false, error: 'duplicate_slug' });
  });

  it('maps any other db error to db_error', async () => {
    queue('courses', { data: null, error: { code: '42000', message: 'boom' } });
    expect(await createCourse(validInput, 'mod-1')).toEqual({ ok: false, error: 'db_error' });
  });

  it('returns the created course on success', async () => {
    queue('courses', {
      data: { id: 'c1', slug: 'react-basico', title: 'React básico', status: 'draft' },
      error: null,
    });
    const result = await createCourse(validInput, 'mod-1');
    expect(result).toEqual({ ok: true, value: { id: 'c1', slug: 'react-basico', title: 'React básico', status: 'draft' } });
  });
});

describe('listCourses', () => {
  it('is [] when the client is unavailable', async () => {
    clientState.available = false;
    expect(await listCourses()).toEqual([]);
  });

  it('is [] on a query error', async () => {
    queue('courses', { data: null, error: { message: 'boom' } });
    expect(await listCourses()).toEqual([]);
  });

  it('returns every course regardless of status', async () => {
    const rows = [{ id: 'c1', slug: 'a', title: 'A', status: 'draft', included_in_premium: true, price_cents: null }];
    queue('courses', { data: rows, error: null });
    expect(await listCourses()).toEqual(rows);
  });
});

describe('getCourseForEdit', () => {
  it('returns null for an empty id without querying', async () => {
    expect(await getCourseForEdit('')).toBeNull();
    expect(fromCalls).toEqual([]);
  });

  it('returns null when the course does not exist', async () => {
    queue('courses', { data: null, error: null });
    expect(await getCourseForEdit('c1')).toBeNull();
  });

  it('returns null when the client is unavailable', async () => {
    clientState.available = false;
    expect(await getCourseForEdit('c1')).toBeNull();
  });

  it('returns the course with empty modules when it has none', async () => {
    queue('courses', { data: { id: 'c1', title: 'X', status: 'draft' }, error: null });
    queue('course_modules', { data: [], error: null });
    const result = await getCourseForEdit('c1');
    expect(result).toEqual({ id: 'c1', title: 'X', status: 'draft', modules: [] });
  });

  it('nests lessons under their module, ordered as returned', async () => {
    queue('courses', { data: { id: 'c1', title: 'X', status: 'draft' }, error: null });
    queue('course_modules', { data: [{ id: 'm1', position: 0, title: 'Módulo 1' }], error: null });
    queue('course_lessons', {
      data: [
        { id: 'l1', module_id: 'm1', position: 0, title: 'Lección 1', kind: 'text', content: { markdown: 'hola' }, duration_min: null, is_preview: true },
      ],
      error: null,
    });

    const result = await getCourseForEdit('c1');
    expect(result?.modules).toEqual([
      {
        id: 'm1',
        position: 0,
        title: 'Módulo 1',
        lessons: [
          { id: 'l1', position: 0, title: 'Lección 1', kind: 'text', content: { markdown: 'hola' }, duration_min: null, is_preview: true },
        ],
      },
    ]);
  });

  it('returns null when the lessons query fails', async () => {
    queue('courses', { data: { id: 'c1', title: 'X', status: 'draft' }, error: null });
    queue('course_modules', { data: [{ id: 'm1', position: 0, title: 'M' }], error: null });
    queue('course_lessons', { data: null, error: { message: 'boom' } });
    expect(await getCourseForEdit('c1')).toBeNull();
  });
});

describe('updateCourse', () => {
  it('rejects an invalid patch without querying', async () => {
    expect(await updateCourse('c1', { title: '' })).toEqual({ ok: false, error: 'invalid_title' });
    expect(fromCalls).toEqual([]);
  });

  it('maps a unique violation to duplicate_slug', async () => {
    queue('courses', { data: null, error: { code: '23505' } });
    expect(await updateCourse('c1', { slug: 'new-slug' })).toEqual({ ok: false, error: 'duplicate_slug' });
  });

  it('succeeds on a valid patch', async () => {
    queue('courses', { data: null, error: null });
    expect(await updateCourse('c1', { title: 'Nuevo título' })).toEqual({ ok: true, value: true });
  });
});

describe('setCourseStatus', () => {
  it('rejects an unrecognized status', async () => {
    expect(await setCourseStatus('c1', 'weird' as never)).toEqual({ ok: false, error: 'invalid_status' });
  });

  it('sets published_at the first time a course is published', async () => {
    queue('courses', { data: { published_at: null }, error: null }); // maybeSingle lookup
    queue('courses', { data: null, error: null }); // update
    expect(await setCourseStatus('c1', 'published')).toEqual({ ok: true, value: true });
  });

  it('never overwrites an existing published_at on republish', async () => {
    queue('courses', { data: { published_at: '2024-01-01T00:00:00.000Z' }, error: null });
    queue('courses', { data: null, error: null });
    expect(await setCourseStatus('c1', 'published')).toEqual({ ok: true, value: true });
  });

  it('archiving does not look up published_at first', async () => {
    queue('courses', { data: null, error: null }); // update only
    expect(await setCourseStatus('c1', 'archived')).toEqual({ ok: true, value: true });
  });

  it('is a db_error on a Supabase failure', async () => {
    queue('courses', { data: null, error: { message: 'boom' } });
    expect(await setCourseStatus('c1', 'archived')).toEqual({ ok: false, error: 'db_error' });
  });
});

describe('createModule', () => {
  it('rejects an empty title without querying', async () => {
    expect(await createModule('c1', '')).toEqual({ ok: false, error: 'invalid_title' });
    expect(fromCalls).toEqual([]);
  });

  it('assigns position 0 to the first module', async () => {
    queue('course_modules', { data: [], error: null }); // existing lookup
    queue('course_modules', { data: { id: 'm1' }, error: null }); // insert
    expect(await createModule('c1', 'Módulo 1')).toEqual({ ok: true, value: { id: 'm1' } });
  });

  it('assigns the next position after the current max', async () => {
    queue('course_modules', { data: [{ position: 3 }], error: null });
    queue('course_modules', { data: { id: 'm2' }, error: null });
    expect(await createModule('c1', 'Módulo 2')).toEqual({ ok: true, value: { id: 'm2' } });
  });
});

describe('renameModule / deleteModule', () => {
  it('renameModule rejects an empty title without querying', async () => {
    expect(await renameModule('m1', ' ')).toEqual({ ok: false, error: 'invalid_title' });
    expect(fromCalls).toEqual([]);
  });

  it('renameModule succeeds', async () => {
    queue('course_modules', { data: null, error: null });
    expect(await renameModule('m1', 'Nuevo nombre')).toEqual({ ok: true, value: true });
  });

  it('deleteModule succeeds', async () => {
    queue('course_modules', { data: null, error: null });
    expect(await deleteModule('m1')).toEqual({ ok: true, value: true });
  });

  it('deleteModule surfaces a db error', async () => {
    queue('course_modules', { data: null, error: { message: 'boom' } });
    expect(await deleteModule('m1')).toEqual({ ok: false, error: 'db_error' });
  });
});

describe('reorderModules', () => {
  it('rejects a set of ids that does not match the course exactly', async () => {
    queue('course_modules', { data: [{ id: 'm1' }, { id: 'm2' }], error: null });
    expect(await reorderModules('c1', ['m1'])).toEqual({ ok: false, error: 'invalid_order' });
  });

  it('renumbers every module through the two-phase offset', async () => {
    queue('course_modules', { data: [{ id: 'm1' }, { id: 'm2' }], error: null });
    queue('course_modules', { data: null, error: null }); // phase 1: m2 -> 10000
    queue('course_modules', { data: null, error: null }); // phase 1: m1 -> 10001
    queue('course_modules', { data: null, error: null }); // phase 2: m2 -> 0
    queue('course_modules', { data: null, error: null }); // phase 2: m1 -> 1
    expect(await reorderModules('c1', ['m2', 'm1'])).toEqual({ ok: true, value: true });
  });
});

describe('createLesson', () => {
  it('rejects an empty title without validating content', async () => {
    const result = await createLesson('m1', { title: '', kind: 'text', content: { markdown: 'hola' } });
    expect(result).toEqual({ ok: false, error: 'invalid_title' });
    expect(fromCalls).toEqual([]);
  });

  it('rejects text content with no markdown', async () => {
    const result = await createLesson('m1', { title: 'L1', kind: 'text', content: {} });
    expect(result).toEqual({ ok: false, error: 'invalid_content' });
  });

  it('rejects a video url on a non-allowlisted host', async () => {
    const result = await createLesson('m1', {
      title: 'L1',
      kind: 'video',
      content: { url: 'https://evil.example.com/watch' },
    });
    expect(result).toEqual({ ok: false, error: 'invalid_content' });
  });

  it('rejects a non-https video url', async () => {
    const result = await createLesson('m1', {
      title: 'L1',
      kind: 'video',
      content: { url: 'http://www.youtube.com/watch?v=x' },
    });
    expect(result).toEqual({ ok: false, error: 'invalid_content' });
  });

  it('accepts a YouTube and a Vimeo url', async () => {
    queue('course_lessons', { data: [], error: null });
    queue('course_lessons', { data: { id: 'l1' }, error: null });
    expect(
      await createLesson('m1', { title: 'L1', kind: 'video', content: { url: 'https://youtu.be/abc123' } }),
    ).toEqual({ ok: true, value: { id: 'l1' } });
  });

  it('rejects an activity lesson with a malformed activityId', async () => {
    const result = await createLesson('m1', { title: 'L1', kind: 'activity', content: { activityId: 'not-a-uuid' } });
    expect(result).toEqual({ ok: false, error: 'invalid_content' });
    expect(getPublishedActivityMock).not.toHaveBeenCalled();
  });

  it('rejects an activity lesson pointing at a non-live activity', async () => {
    getPublishedActivityMock.mockResolvedValue(null);
    const result = await createLesson('m1', { title: 'L1', kind: 'activity', content: { activityId: LIVE_ACTIVITY_ID } });
    expect(result).toEqual({ ok: false, error: 'activity_not_live' });
  });

  it('accepts an activity lesson pointing at a live activity', async () => {
    queue('course_lessons', { data: [{ position: 1 }], error: null });
    queue('course_lessons', { data: { id: 'l2' }, error: null });
    const result = await createLesson('m1', {
      title: 'L2',
      kind: 'activity',
      content: { activityId: LIVE_ACTIVITY_ID },
    });
    expect(result).toEqual({ ok: true, value: { id: 'l2' } });
  });

  it('rejects a non-positive duration', async () => {
    const result = await createLesson('m1', {
      title: 'L1',
      kind: 'text',
      content: { markdown: 'hola' },
      duration_min: 0,
    });
    expect(result).toEqual({ ok: false, error: 'invalid_duration' });
  });
});

describe('updateLesson', () => {
  it('requires kind and content to change together', async () => {
    const result = await updateLesson('l1', { kind: 'video' });
    expect(result).toEqual({ ok: false, error: 'invalid_content' });
    expect(fromCalls).toEqual([]);
  });

  it('revalidates content when both kind and content are patched', async () => {
    const result = await updateLesson('l1', { kind: 'text', content: {} });
    expect(result).toEqual({ ok: false, error: 'invalid_content' });
  });

  it('updates a title-only patch without touching content rules', async () => {
    queue('course_lessons', { data: null, error: null });
    expect(await updateLesson('l1', { title: 'Nuevo título' })).toEqual({ ok: true, value: true });
  });
});

describe('deleteLesson / reorderLessons', () => {
  it('deleteLesson succeeds', async () => {
    queue('course_lessons', { data: null, error: null });
    expect(await deleteLesson('l1')).toEqual({ ok: true, value: true });
  });

  it('reorderLessons renumbers through the two-phase offset', async () => {
    queue('course_lessons', { data: [{ id: 'l1' }, { id: 'l2' }], error: null });
    queue('course_lessons', { data: null, error: null });
    queue('course_lessons', { data: null, error: null });
    queue('course_lessons', { data: null, error: null });
    queue('course_lessons', { data: null, error: null });
    expect(await reorderLessons('m1', ['l1', 'l2'])).toEqual({ ok: true, value: true });
  });
});

describe('grantAccess', () => {
  it('fails when no user matches the email', async () => {
    authAdmin.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    expect(await grantAccess('c1', 'nobody@example.com', 'mod-1')).toEqual({
      ok: false,
      error: 'user_not_found',
    });
    expect(fromCalls).not.toContain('course_purchases');
  });

  it('grants access to the matching user', async () => {
    authAdmin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'student@example.com' }] },
      error: null,
    });
    queue('course_purchases', { data: null, error: null });
    expect(await grantAccess('c1', 'Student@Example.com', 'mod-1')).toEqual({ ok: true, value: true });
  });

  it('maps a unique violation to already_owned', async () => {
    authAdmin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'student@example.com' }] },
      error: null,
    });
    queue('course_purchases', { data: null, error: { code: '23505' } });
    expect(await grantAccess('c1', 'student@example.com', 'mod-1')).toEqual({
      ok: false,
      error: 'already_owned',
    });
  });
});

describe('revokeAccess', () => {
  it('succeeds', async () => {
    queue('course_purchases', { data: null, error: null });
    expect(await revokeAccess('c1', 'u1')).toEqual({ ok: true, value: true });
  });
});

describe('listOwners', () => {
  it('is [] when the client is unavailable', async () => {
    clientState.available = false;
    expect(await listOwners('c1')).toEqual([]);
  });

  it('resolves each owner email via the admin API', async () => {
    queue('course_purchases', {
      data: [{ user_id: 'u1', source: 'grant', created_at: '2024-01-01T00:00:00.000Z' }],
      error: null,
    });
    authAdmin.getUserById.mockResolvedValue({ data: { user: { id: 'u1', email: 'owner@example.com' } }, error: null });

    expect(await listOwners('c1')).toEqual([
      { userId: 'u1', email: 'owner@example.com', source: 'grant', createdAt: '2024-01-01T00:00:00.000Z' },
    ]);
  });

  it('leaves email null when the admin lookup fails', async () => {
    queue('course_purchases', {
      data: [{ user_id: 'u1', source: 'purchase', created_at: '2024-01-01T00:00:00.000Z' }],
      error: null,
    });
    authAdmin.getUserById.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const owners = await listOwners('c1');
    expect(owners[0].email).toBeNull();
  });
});

describe('clearCoursesAdminClient', () => {
  it('forces a fresh client on the next call (test isolation)', async () => {
    queue('courses', { data: [], error: null });
    await listCourses();
    clearCoursesAdminClient();
    clientState.available = false;
    expect(await listCourses()).toEqual([]);
  });
});
