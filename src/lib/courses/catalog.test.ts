import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Same per-table response queue as `admin.test.ts` — see that file's header
 * for why this shape exists.
 */
const { clientState, queues, fromCalls } = vi.hoisted(() => {
  const queues = new Map<string, unknown[]>();
  const fromCalls: string[] = [];
  return { clientState: { available: true }, queues, fromCalls };
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
    eq: () => builder,
    in: () => builder,
    order: () => builder,
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
    };
  },
}));

import { listPublishedCourses, getCourseDetailBySlug, clearCoursesCatalogClient } from './catalog';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  queues.clear();
  fromCalls.length = 0;
  clearCoursesCatalogClient();
});

describe('listPublishedCourses', () => {
  it('is [] when the client is unavailable', async () => {
    clientState.available = false;
    expect(await listPublishedCourses()).toEqual([]);
  });

  it('is [] on a query error', async () => {
    queue('courses', { data: null, error: { message: 'boom' } });
    expect(await listPublishedCourses()).toEqual([]);
  });

  it('is [] when there are no published courses', async () => {
    queue('courses', { data: [], error: null });
    expect(await listPublishedCourses()).toEqual([]);
  });

  it('maps courses without querying modules when there are none to count', async () => {
    queue('courses', {
      data: [
        {
          id: 'c1',
          slug: 'react-basico',
          title: 'React básico',
          subtitle: 'De cero a productivo',
          level: 'A2',
          cover_path: null,
          included_in_premium: true,
          price_cents: null,
          currency: 'USD',
        },
      ],
      error: null,
    });
    queue('course_modules', { data: [], error: null });

    const result = await listPublishedCourses();
    expect(result).toEqual([
      {
        id: 'c1',
        slug: 'react-basico',
        title: 'React básico',
        subtitle: 'De cero a productivo',
        level: 'A2',
        coverPath: null,
        includedInPremium: true,
        priceCents: null,
        currency: 'USD',
        lessonCount: 0,
      },
    ]);
  });

  it('counts lessons across modules for each course', async () => {
    queue('courses', {
      data: [
        { id: 'c1', slug: 'a', title: 'A', subtitle: null, level: null, cover_path: null, included_in_premium: true, price_cents: null, currency: 'USD' },
        { id: 'c2', slug: 'b', title: 'B', subtitle: null, level: null, cover_path: null, included_in_premium: false, price_cents: 1999, currency: 'USD' },
      ],
      error: null,
    });
    queue('course_modules', {
      data: [
        { id: 'm1', course_id: 'c1' },
        { id: 'm2', course_id: 'c2' },
      ],
      error: null,
    });
    queue('course_lessons', {
      data: [{ module_id: 'm1' }, { module_id: 'm1' }, { module_id: 'm2' }],
      error: null,
    });

    const result = await listPublishedCourses();
    expect(result.find((c) => c.id === 'c1')?.lessonCount).toBe(2);
    expect(result.find((c) => c.id === 'c2')?.lessonCount).toBe(1);
  });
});

describe('getCourseDetailBySlug', () => {
  it('returns null for an empty slug without querying', async () => {
    expect(await getCourseDetailBySlug('')).toBeNull();
    expect(fromCalls).toEqual([]);
  });

  it('returns null when no course matches', async () => {
    queue('courses', { data: null, error: null });
    expect(await getCourseDetailBySlug('missing')).toBeNull();
  });

  it('returns null when the client is unavailable', async () => {
    clientState.available = false;
    expect(await getCourseDetailBySlug('x')).toBeNull();
  });

  it('returns any status — visibility is the caller’s job', async () => {
    queue('courses', {
      data: {
        id: 'c1',
        slug: 'react-basico',
        title: 'React básico',
        subtitle: null,
        description: null,
        level: null,
        cover_path: null,
        status: 'draft',
        included_in_premium: true,
        price_cents: null,
        currency: 'USD',
      },
      error: null,
    });
    queue('course_modules', { data: [], error: null });

    const result = await getCourseDetailBySlug('react-basico');
    expect(result?.status).toBe('draft');
  });

  it('nests lessons under their module, including content', async () => {
    queue('courses', {
      data: {
        id: 'c1',
        slug: 'react-basico',
        title: 'React básico',
        subtitle: null,
        description: null,
        level: null,
        cover_path: null,
        status: 'published',
        included_in_premium: true,
        price_cents: null,
        currency: 'USD',
      },
      error: null,
    });
    queue('course_modules', { data: [{ id: 'm1', position: 0, title: 'Módulo 1' }], error: null });
    queue('course_lessons', {
      data: [
        {
          id: 'l1',
          module_id: 'm1',
          position: 0,
          title: 'Lección 1',
          kind: 'text',
          content: { markdown: 'hola' },
          duration_min: 5,
          is_preview: true,
        },
      ],
      error: null,
    });

    const result = await getCourseDetailBySlug('react-basico');
    expect(result?.modules).toEqual([
      {
        id: 'm1',
        position: 0,
        title: 'Módulo 1',
        lessons: [
          { id: 'l1', position: 0, title: 'Lección 1', kind: 'text', content: { markdown: 'hola' }, duration_min: 5, is_preview: true },
        ],
      },
    ]);
  });

  it('returns null when the lessons query fails', async () => {
    queue('courses', {
      data: { id: 'c1', slug: 'x', title: 'X', subtitle: null, description: null, level: null, cover_path: null, status: 'published', included_in_premium: true, price_cents: null, currency: 'USD' },
      error: null,
    });
    queue('course_modules', { data: [{ id: 'm1', position: 0, title: 'M' }], error: null });
    queue('course_lessons', { data: null, error: { message: 'boom' } });
    expect(await getCourseDetailBySlug('x')).toBeNull();
  });
});
