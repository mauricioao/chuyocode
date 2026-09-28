/**
 * Integration tests for `POST /api/actividades/[id]/visto` — records a
 * practice-page view for the signed-in caller (PR D, "Activities practice").
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { recordActivityViewMock } = vi.hoisted(() => ({ recordActivityViewMock: vi.fn() }));

vi.mock('@lib/activities/views', () => ({
  recordActivityView: recordActivityViewMock,
}));

import { POST } from './visto';

const AUTHOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

function ctx(args: { id?: string; user?: User | null }) {
  const { id = ACTIVITY_ID, user = AUTHOR } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/visto`, { method: 'POST' });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  recordActivityViewMock.mockReset().mockResolvedValue(3);
});

describe('POST /api/actividades/[id]/visto — identity', () => {
  it('401s an anonymous POST', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(recordActivityViewMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/visto — request shape', () => {
  it('404s a malformed id before calling the RPC', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(recordActivityViewMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/visto — success', () => {
  it('records the view for the caller and this activity', async () => {
    await POST(ctx({}));
    expect(recordActivityViewMock).toHaveBeenCalledWith(AUTHOR.id, ACTIVITY_ID);
  });

  it('returns the new view count', async () => {
    recordActivityViewMock.mockResolvedValueOnce(7);
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewCount: 7 });
  });
});

describe('POST /api/actividades/[id]/visto — failure', () => {
  it('500s when recording the view fails', async () => {
    recordActivityViewMock.mockResolvedValueOnce(null);
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('view_failed');
  });
});

describe('POST /api/actividades/[id]/visto — response shape', () => {
  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
