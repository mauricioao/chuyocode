/**
 * Integration tests for POST /api/ejercicios/[id]/guardar (slice 17,
 * design.md §8 "Publish flow" — the 7-step save/publish gate).
 *
 * 🔴 T3 AND T4 ARE THE CENTRAL CASES. T3: an anonymous POST (`locals.user ===
 * null`) is rejected 401 with NO row read or written — checked before any
 * other guard, exactly like `/api/reacciones/[exerciseId]`. T4: an
 * authenticated caller whose id does not match `row.author_id` is rejected
 * 403 with NO write attempted — the row is read (to make the ownership
 * decision at all) but never updated.
 *
 * `@lib/supabase` is mocked with a small builder covering exactly the two
 * shapes this endpoint uses: `.select(...).eq('id', id).maybeSingle()` and
 * `.update(...).eq('id', id).eq('author_id', id)`, the latter awaited
 * directly (Supabase's `PostgrestBuilder implements PromiseLike`, same
 * citation as `exercises.test.ts`). `updateMock` is asserted as "called" or
 * "not called" to prove a row did or did not change.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { clientState, fromMock, selectMock, maybeSingleMock, updateMock, updateOutcomes } =
  vi.hoisted(() => {
    const maybeSingleMock = vi.fn();
    const eqSelectMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    const selectMock = vi.fn(() => ({ eq: eqSelectMock }));

    // Queue of `{ error }` outcomes for successive `.update(...).eq(...).eq(...)`
    // awaits — one entry per attempt (first save try, then the one collision
    // retry). Defaults to a clean success when the queue runs empty.
    const updateOutcomes: Array<{ error: { code?: string; message: string } | null }> = [];
    const eqUpdate2Mock = vi.fn(() => Promise.resolve(updateOutcomes.shift() ?? { error: null }));
    const eqUpdate1Mock = vi.fn(() => ({ eq: eqUpdate2Mock }));
    const updateMock = vi.fn(() => ({ eq: eqUpdate1Mock }));

    const fromMock = vi.fn(() => ({ select: selectMock, update: updateMock }));
    return {
      clientState: { available: true },
      fromMock,
      selectMock,
      eqSelectMock,
      maybeSingleMock,
      updateMock,
      eqUpdate1Mock,
      eqUpdate2Mock,
      updateOutcomes,
    };
  });

vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import { POST } from './guardar';

const AUTHOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const OTHER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const EXERCISE_ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

const VALID_PAYLOAD = {
  pools: {},
  slots: [{ id: 'slot-1', label: 'The cat ___ on the mat', input: 'text', answer: ['sat'] }],
  blocks: [{ kind: 'row', id: 'row-1', slotId: 'slot-1' }],
};

interface Row {
  id: string;
  slug: string;
  skill: string;
  level: string;
  focus: string;
  topic: string | null;
  status: string;
  payload: unknown;
  author_id: string | null;
  published_at: string | null;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: EXERCISE_ID,
    slug: 'ordering-coffee',
    skill: 'writing',
    level: 'A1',
    focus: 'present-simple',
    topic: null,
    status: 'draft',
    payload: VALID_PAYLOAD,
    author_id: AUTHOR.id,
    published_at: null,
    ...overrides,
  };
}

function ctx(args: {
  id?: string;
  body?: unknown;
  user?: User | null;
  rawBody?: string;
}) {
  const { id = EXERCISE_ID, body, user = AUTHOR, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/ejercicios/${id}/guardar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

function saveInput(overrides: Partial<{ payload: unknown; blocks: unknown[]; publish: boolean; acceptedTerms: boolean }> = {}) {
  return {
    payload: VALID_PAYLOAD,
    blocks: VALID_PAYLOAD.blocks,
    publish: false,
    acceptedTerms: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  updateOutcomes.length = 0;
  maybeSingleMock.mockResolvedValue({ data: row(), error: null });
});

describe('POST /api/ejercicios/[id]/guardar — identity (T3/T4)', () => {
  it('T3 — anonymous POST -> 401, no row read or changed', async () => {
    const res = await POST(ctx({ user: null, body: saveInput() }));
    expect(res.status).toBe(401);
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('T4 — authenticated non-owner POST -> 403, no row changed', async () => {
    const res = await POST(ctx({ user: OTHER, body: saveInput() }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('unknown exercise id -> 404, no row changed', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(ctx({ body: saveInput() }));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('a malformed id -> 404 before any query', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid', body: saveInput() }));
    expect(res.status).toBe(404);
    expect(selectMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ejercicios/[id]/guardar — body and validation gates', () => {
  it('unparseable payload -> 422 payload_unparseable, no row changed', async () => {
    const res = await POST(ctx({ body: saveInput({ payload: { pools: {}, slots: [] } }) }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, code: 'payload_unparseable' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('mustValidate is true on publish even from draft, and surfaces issues at 422', async () => {
    // `opts` exists but is empty -> `pool_empty`, a real `validateExercise`
    // error the parser itself does not catch (unlike an empty `answer`).
    const badPayload = {
      pools: { opts: [] },
      slots: [{ id: 'slot-1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['x'] }],
      blocks: [{ kind: 'row', id: 'row-1', slotId: 'slot-1' }],
    };
    const res = await POST(ctx({ body: saveInput({ payload: badPayload, publish: true, acceptedTerms: true }) }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(Array.isArray(json.issues)).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('mustValidate is true on a non-draft save even without publishing', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: row({ status: 'needs_work', slug: 'Not A Slug', published_at: '2024-01-01T00:00:00.000Z' }),
      error: null,
    });

    const res = await POST(ctx({ body: saveInput({ publish: false }) }));
    // The row's own stored slug is invalid, so validateExercise must have run
    // even though publish is false — proving mustValidate reacted to status.
    expect(res.status).toBe(422);
  });

  it('draft save with no publish never validates: an invalid slug on the row is not blocking', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: row({ slug: 'Not A Slug' }), error: null });
    const res = await POST(ctx({ body: saveInput({ publish: false }) }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('first publish without acceptedTerms -> 422 terms_required, no row changed', async () => {
    const res = await POST(ctx({ body: saveInput({ publish: true, acceptedTerms: false }) }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, code: 'terms_required' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('first publish with acceptedTerms saves and transitions to live', async () => {
    const res = await POST(ctx({ body: saveInput({ publish: true, acceptedTerms: true }) }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [updateArg] = updateMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(updateArg.status).toBe('live');
    expect(typeof updateArg.published_at).toBe('string');
  });

  it('a republish (already published before) never re-asks for terms', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: row({ status: 'needs_work', published_at: '2024-01-01T00:00:00.000Z' }),
      error: null,
    });
    const res = await POST(ctx({ body: saveInput({ publish: true, acceptedTerms: false }) }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/ejercicios/[id]/guardar — lifecycle transition guard', () => {
  it('rejects an author-initiated publish from `auditing` -> 409, no row changed', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: row({ status: 'auditing', published_at: '2024-01-01T00:00:00.000Z' }),
      error: null,
    });
    const res = await POST(ctx({ body: saveInput({ publish: true }) }));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects any save on a `removed` row -> 409, no row changed', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: row({ status: 'removed' }), error: null });
    const res = await POST(ctx({ body: saveInput() }));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ejercicios/[id]/guardar — slug collision retry', () => {
  it('retries once with a suffix on a 23505 and succeeds', async () => {
    updateOutcomes.push({ error: { code: '23505', message: 'duplicate key' } });
    updateOutcomes.push({ error: null });

    const res = await POST(ctx({ body: saveInput({ publish: true, acceptedTerms: true }) }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(2);

    const [firstArg] = updateMock.mock.calls[0] as unknown as [Record<string, unknown>];
    const [secondArg] = updateMock.mock.calls[1] as unknown as [Record<string, unknown>];
    expect(firstArg.slug).toBe('ordering-coffee');
    expect(secondArg.slug).toMatch(/^ordering-coffee-[0-9a-z]{4}$/);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.slug).toBe(secondArg.slug);
  });

  it('a second collision -> 422 slug_collision_unresolved', async () => {
    updateOutcomes.push({ error: { code: '23505', message: 'duplicate key' } });
    updateOutcomes.push({ error: { code: '23505', message: 'duplicate key again' } });

    const res = await POST(ctx({ body: saveInput({ publish: true, acceptedTerms: true }) }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, code: 'slug_collision_unresolved' });
    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/ejercicios/[id]/guardar — response shape', () => {
  it('returns the resolved (lang-less) url on success', async () => {
    const res = await POST(ctx({ body: saveInput({ publish: true, acceptedTerms: true }) }));
    const json = await res.json();
    expect(json.url).toBe('/ingles/A1/present-simple/ordering-coffee');
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null, body: saveInput() }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
