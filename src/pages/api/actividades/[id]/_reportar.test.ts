/**
 * Integration tests for `POST /api/actividades/[id]/reportar`.
 * `@lib/activities/moderation` is mocked — `recordReport`'s own behavior
 * (self-report refusal, idempotency, the threshold RPC) is covered by
 * `moderation.test.ts`; this file only checks the HTTP translation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { recordReportMock } = vi.hoisted(() => ({ recordReportMock: vi.fn() }));
vi.mock('@lib/activities/moderation', () => ({ recordReport: recordReportMock }));

import { POST } from './reportar';

const CALLER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

function ctx(args: { id?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { id = ACTIVITY_ID, user = CALLER, body = { reason: 'inappropriate' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/reportar`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  recordReportMock.mockResolvedValue({ ok: true, hidden: false });
});

describe('POST /api/actividades/[id]/reportar — identity', () => {
  it('401s an anonymous caller', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(recordReportMock).not.toHaveBeenCalled();
  });

  it('404s a malformed id', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid' }));
    expect(res.status).toBe(404);
  });

  it('400s on unparsable JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/actividades/[id]/reportar — outcomes', () => {
  it('passes reason and details through to recordReport', async () => {
    await POST(ctx({ body: { reason: 'copyright', details: 'not theirs' } }));
    expect(recordReportMock).toHaveBeenCalledWith(ACTIVITY_ID, CALLER.id, 'copyright', 'not theirs');
  });

  it('200s with { ok: true, hidden } on success', async () => {
    recordReportMock.mockResolvedValue({ ok: true, hidden: true });
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hidden: true });
  });

  it('404s when the activity is not live / does not exist', async () => {
    recordReportMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it("403s when the caller is the activity's own author", async () => {
    recordReportMock.mockResolvedValue({ ok: false, error: 'self_report' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(403);
  });

  it.each(['invalid_reason', 'invalid_details'])('422s on validation error %s', async (error) => {
    recordReportMock.mockResolvedValue({ ok: false, error });
    const res = await POST(ctx({}));
    expect(res.status).toBe(422);
  });

  it('500s on report_failed', async () => {
    recordReportMock.mockResolvedValue({ ok: false, error: 'report_failed' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
  });
});
