import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * Two independent `.eq().eq().maybeSingle()` / `.eq().maybeSingle()` chains
 * are exercised here (`getCourseBySlug`, `ownsCourse`) — mirrors
 * `src/lib/access.test.ts`'s `getPlan` mock, generalized to a query result
 * that resolves whatever `queryResult` holds when the chain is awaited.
 */
const { clientState, queryResult, fromMock } = vi.hoisted(() => {
  const queryResult: { value: unknown; throws: Error | null } = {
    value: { data: null, error: null },
    throws: null,
  };
  const builder: Record<string, unknown> = {
    maybeSingle: () => {
      if (queryResult.throws) return Promise.reject(queryResult.throws);
      return Promise.resolve(queryResult.value);
    },
  };
  const eqMock = vi.fn(() => builder);
  builder.eq = eqMock;
  const selectMock = vi.fn(() => builder);
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    clientState: { available: true },
    queryResult,
    fromMock,
  };
});

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import {
  courseVisible,
  courseAccess,
  canViewLesson,
  getCourseBySlug,
  ownsCourse,
  clearCoursesAccessClient,
} from './access';

function user(id = 'u1'): User {
  return { id } as User;
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  queryResult.value = { data: null, error: null };
  queryResult.throws = null;
  clearCoursesAccessClient();
});

describe('courseVisible', () => {
  it.each([
    ['draft', false, false],
    ['archived', false, false],
    ['published', false, true],
    ['draft', true, true],
    ['archived', true, true],
    ['published', true, true],
  ] as const)('status=%s isModerator=%s -> %s', (status, isModerator, expected) => {
    expect(courseVisible({ status }, isModerator)).toBe(expected);
  });
});

describe('courseAccess', () => {
  it('is owned when the visitor owns the course, regardless of plan', () => {
    expect(
      courseAccess({ course: { included_in_premium: false }, plan: 'free', owns: true }),
    ).toBe('owned');
    expect(
      courseAccess({ course: { included_in_premium: true }, plan: 'premium', owns: true }),
    ).toBe('owned');
  });

  it('is owned for a moderator regardless of plan or ownership', () => {
    expect(
      courseAccess({
        course: { included_in_premium: false },
        plan: 'free',
        owns: false,
        isModerator: true,
      }),
    ).toBe('owned');
  });

  it('is premium when plan is premium and the course is included in premium', () => {
    expect(
      courseAccess({ course: { included_in_premium: true }, plan: 'premium', owns: false }),
    ).toBe('premium');
  });

  it('is preview-only when premium but the course is not included in premium', () => {
    expect(
      courseAccess({ course: { included_in_premium: false }, plan: 'premium', owns: false }),
    ).toBe('preview-only');
  });

  it('is preview-only on a free plan without ownership', () => {
    expect(
      courseAccess({ course: { included_in_premium: true }, plan: 'free', owns: false }),
    ).toBe('preview-only');
  });
});

describe('canViewLesson', () => {
  const base = { course: { included_in_premium: true }, plan: 'free' as const, owns: false };

  it('a preview lesson is always viewable', () => {
    expect(canViewLesson({ ...base, lesson: { is_preview: true } })).toBe(true);
  });

  it('a non-preview lesson is denied on a free plan without ownership', () => {
    expect(canViewLesson({ ...base, lesson: { is_preview: false } })).toBe(false);
  });

  it('a non-preview lesson is viewable on premium plan when the course is included', () => {
    expect(
      canViewLesson({ ...base, plan: 'premium', lesson: { is_preview: false } }),
    ).toBe(true);
  });

  it('a non-preview lesson is denied on premium plan when the course is NOT included', () => {
    expect(
      canViewLesson({
        ...base,
        plan: 'premium',
        course: { included_in_premium: false },
        lesson: { is_preview: false },
      }),
    ).toBe(false);
  });

  it('a non-preview lesson is viewable when owned, regardless of plan', () => {
    expect(
      canViewLesson({
        ...base,
        owns: true,
        course: { included_in_premium: false },
        lesson: { is_preview: false },
      }),
    ).toBe(true);
  });

  it('a moderator can view anything, including a non-preview lesson on a free plan', () => {
    expect(
      canViewLesson({ ...base, lesson: { is_preview: false }, isModerator: true }),
    ).toBe(true);
  });
});

describe('getCourseBySlug', () => {
  it('returns null for an empty slug without querying', async () => {
    expect(await getCourseBySlug('')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when no course matches', async () => {
    queryResult.value = { data: null, error: null };
    expect(await getCourseBySlug('missing')).toBeNull();
  });

  it('returns null when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await getCourseBySlug('react-basico')).toBeNull();
  });

  it('returns null on a Supabase error', async () => {
    queryResult.value = { data: null, error: { message: 'boom' } };
    expect(await getCourseBySlug('react-basico')).toBeNull();
  });

  it('returns null when the thrown client throws', async () => {
    queryResult.throws = new Error('network down');
    expect(await getCourseBySlug('react-basico')).toBeNull();
  });

  it('maps a matching row to a CourseSummary', async () => {
    queryResult.value = {
      data: {
        id: 'c1',
        title: 'React básico',
        status: 'published',
        included_in_premium: true,
      },
      error: null,
    };
    expect(await getCourseBySlug('react-basico')).toEqual({
      id: 'c1',
      slug: 'react-basico',
      title: 'React básico',
      status: 'published',
      included_in_premium: true,
    });
  });

  it('returns null for a row with an unrecognized status', async () => {
    queryResult.value = {
      data: { id: 'c1', title: 'X', status: 'weird', included_in_premium: true },
      error: null,
    };
    expect(await getCourseBySlug('x')).toBeNull();
  });
});

describe('ownsCourse', () => {
  it('is false for an anonymous visitor without querying', async () => {
    expect(await ownsCourse(null, 'c1')).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('is false for an empty courseId without querying', async () => {
    expect(await ownsCourse(user(), '')).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('is false when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await ownsCourse(user(), 'c1')).toBe(false);
  });

  it('is false when no purchase row exists', async () => {
    queryResult.value = { data: null, error: null };
    expect(await ownsCourse(user(), 'c1')).toBe(false);
  });

  it('is false on a Supabase error (fails closed)', async () => {
    queryResult.value = { data: null, error: { message: 'boom' } };
    expect(await ownsCourse(user(), 'c1')).toBe(false);
  });

  it('is false when the client throws (fails closed)', async () => {
    queryResult.throws = new Error('network down');
    expect(await ownsCourse(user(), 'c1')).toBe(false);
  });

  it('is true when a purchase row exists', async () => {
    queryResult.value = { data: { id: 'p1' }, error: null };
    expect(await ownsCourse(user(), 'c1')).toBe(true);
  });
});
