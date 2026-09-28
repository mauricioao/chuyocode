/**
 * Integration tests for `POST /api/actividades/[id]/corazon`.
 * `@lib/activities/hearts` is mocked — `toggleActivityHeart`'s own behavior
 * is covered by `hearts.test.ts`; this file only checks the HTTP
 * translation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { toggleActivityHeartMock } = vi.hoisted(() => ({ toggleActivityHeartMock: vi.fn() }));
vi.mock('@lib/activities/hearts', () => ({ toggleActivityHeart: toggleActivityHeartMock }));

import { POST } from './corazon';

const CALLER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

function ctx(args: { id?: string; user?: User | null }) {
  const { id = ACTIVITY_ID, user = CALLER } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/corazon`, { method: 'POST' });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  toggleActivityHeartMock.mockResolvedValue({ ok: true, hearted: true, heartCount: 4 });
});

describe('POST /api/actividades/[id]/corazon — identity', () => {
  it('401s an anonymous caller', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(toggleActivityHeartMock).not.toHaveBeenCalled();
  });

  it('404s a malformed id', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(toggleActivityHeartMock).not.toHaveBeenCalled();
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/actividades/[id]/corazon — outcomes', () => {
  it('calls toggleActivityHeart with the activity id and caller id', async () => {
    await POST(ctx({}));
    expect(toggleActivityHeartMock).toHaveBeenCalledWith(ACTIVITY_ID, CALLER.id);
  });

  it('200s with { hearted, heartCount } on success', async () => {
    toggleActivityHeartMock.mockResolvedValue({ ok: true, hearted: false, heartCount: 3 });
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hearted: false, heartCount: 3 });
  });

  it('404s when the activity is not live / does not exist', async () => {
    toggleActivityHeartMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it("403s when the caller is the activity's own author", async () => {
    toggleActivityHeartMock.mockResolvedValue({ ok: false, error: 'self_heart' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(403);
  });

  it('500s on toggle_failed', async () => {
    toggleActivityHeartMock.mockResolvedValue({ ok: false, error: 'toggle_failed' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('toggle_failed');
  });
});
