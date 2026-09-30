import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, getPublishedActivitiesMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  getPublishedActivitiesMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/activities/activities', () => ({ getPublishedActivities: getPublishedActivitiesMock }));

import { GET } from './buscar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;

function ctx(args: { user?: User | null; q?: string | null }) {
  const { user = CALLER, q = 'presente' } = args;
  const url = new URL('https://chuyo.test/api/admin/cursos/actividades/buscar');
  if (q !== null) url.searchParams.set('q', q);
  return { url, locals: { user } } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  getPublishedActivitiesMock.mockResolvedValue({
    activities: [{ id: 'a1', title: 'Presente simple', level: 'A1' }],
    total: 1,
  });
});

describe('GET /api/admin/cursos/actividades/buscar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await GET(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await GET(ctx({}))).status).toBe(404);
  });
});

describe('GET /api/admin/cursos/actividades/buscar — query', () => {
  it('400s when q is missing', async () => {
    expect((await GET(ctx({ q: null }))).status).toBe(400);
  });

  it('400s when q is blank', async () => {
    expect((await GET(ctx({ q: '   ' }))).status).toBe(400);
  });
});

describe('GET /api/admin/cursos/actividades/buscar — outcomes', () => {
  it('200s with matching live activities', async () => {
    const res = await GET(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activities: [{ id: 'a1', title: 'Presente simple', level: 'A1' }] });
    expect(getPublishedActivitiesMock).toHaveBeenCalledWith({ level: null, page: 1, q: 'presente', viewerId: null });
  });

  it('is never publicly cacheable', async () => {
    const res = await GET(ctx({}));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
