/**
 * Integration tests for POST /api/reacciones/[exerciseId] (slice 9, design.md
 * §4 "API").
 *
 * 🔴 T3 IS THE CENTRAL CASE: an anonymous POST (`locals.user === null`) must
 * be rejected 401 with NO row changed — unlike `/api/me-gusta/[id]`, which is
 * anonymous by design and untouched. Identity comes from `Locals.user`
 * (server-verified by middleware), never re-derived here.
 *
 * `@lib/reactions` is mocked so this isolates the endpoint's own decisions
 * (auth guard, id guard, body validation, response shape) from the upsert
 * data layer, which has its own tests (`reactions.test.ts`). `isValidReaction`
 * is kept real: faking it would make the taxonomy-rejection tests assert the
 * stub instead of the rule.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

// `@lib/likes` (for `isExerciseId`) and `@lib/reactions` both reach
// `@lib/supabase`, which calls `loadEnv()` at MODULE LOAD and throws when the
// Supabase vars are absent — which they are in a unit test. The client
// factory is stubbed so the real modules can be imported at all; nothing here
// ever calls it, because the one function that would (`upsertReaction`) is
// mocked below.
vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    throw new Error('service client is never built in this suite');
  },
}));

vi.mock('@lib/reactions', async (importActual) => {
  const actual = await importActual<typeof import('@lib/reactions')>();
  return { ...actual, upsertReaction: upsertMock };
});

import { POST } from './[exerciseId]';

const EXERCISE_ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const USER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;

/** Build the APIContext stub the handler reads (params + request + locals). */
function ctx(args: {
  exerciseId?: string;
  body?: unknown;
  user?: User | null;
  rawBody?: string;
}) {
  const { exerciseId = EXERCISE_ID, body, user = USER, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/reacciones/${exerciseId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return {
    params: { exerciseId },
    request,
    locals: { user },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/reacciones/[exerciseId] — identity', () => {
  it('T3 — anonymous POST -> 401, no row changed', async () => {
    const res = await POST(ctx({ user: null, body: { kind: 'like' } }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('never reaches Supabase for an anonymous request, even with a malformed body', async () => {
    const res = await POST(ctx({ user: null, rawBody: 'not json' }));
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/reacciones/[exerciseId] — the exercise id', () => {
  it('rejects a non-uuid id before any Supabase call', async () => {
    const res = await POST(ctx({ exerciseId: 'not-a-uuid', body: { kind: 'like' } }));
    expect(res.status).toBe(404);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/reacciones/[exerciseId] — the taxonomy', () => {
  it('rejects a dislike with no reason', async () => {
    const res = await POST(ctx({ body: { kind: 'dislike' } }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects a dislike with a reason outside the taxonomy', async () => {
    const res = await POST(ctx({ body: { kind: 'dislike', reason: 'boring' } }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body', async () => {
    const res = await POST(ctx({ rawBody: 'not json' }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/reacciones/[exerciseId] — success', () => {
  it('upserts the authenticated user\'s reaction and answers { ok } only', async () => {
    upsertMock.mockResolvedValue(true);
    const res = await POST(ctx({ body: { kind: 'like' } }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(USER.id, EXERCISE_ID, { kind: 'like' });
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    // The dislike count must never be exposed (brigade-coordination risk).
    expect(Object.keys(json)).toEqual(['ok']);
  });

  it('passes the reason through for a dislike', async () => {
    upsertMock.mockResolvedValue(true);
    await POST(ctx({ body: { kind: 'dislike', reason: 'typo' } }));
    expect(upsertMock).toHaveBeenCalledWith(USER.id, EXERCISE_ID, {
      kind: 'dislike',
      reason: 'typo',
    });
  });

  it('answers { ok: false }, not a 500, when the upsert fails', async () => {
    upsertMock.mockResolvedValue(false);
    const res = await POST(ctx({ body: { kind: 'like' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('marks the response private/no-store', async () => {
    upsertMock.mockResolvedValue(true);
    const res = await POST(ctx({ body: { kind: 'like' } }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
