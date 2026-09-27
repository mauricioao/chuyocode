/**
 * Integration tests for `POST /api/actividades/[id]/guardar`. `@lib/supabase`
 * is mocked with a small shared builder covering every chain shape this
 * endpoint uses (`.select().eq().eq().neq().maybeSingle()`,
 * `.select().eq().order().limit().maybeSingle()`,
 * `.update(...).eq(...)`/`.insert(...)` awaited directly — Supabase's
 * `PostgrestBuilder implements PromiseLike`, same citation as
 * `exercises.test.ts`/`ejercicios/[id]/_guardar.test.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { clientState, maybeSingleMock, writeOutcomes, fromMock, updateMock, insertMock } =
  vi.hoisted(() => {
    const maybeSingleMock = vi.fn();
    const writeOutcomes: Array<{ error: { message: string } | null }> = [];

    const builder: Record<string, unknown> = {
      maybeSingle: maybeSingleMock,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(writeOutcomes.shift() ?? { error: null }).then(onFulfilled, onRejected),
    };
    const eqMock = vi.fn(() => builder);
    const neqMock = vi.fn(() => builder);
    const orderMock = vi.fn(() => builder);
    const limitMock = vi.fn(() => builder);
    const selectMock = vi.fn(() => builder);
    const updateMock = vi.fn((_payload: Record<string, unknown>) => builder);
    const insertMock = vi.fn((_payload: Record<string, unknown>) => builder);
    builder.eq = eqMock;
    builder.neq = neqMock;
    builder.order = orderMock;
    builder.limit = limitMock;
    builder.select = selectMock;
    builder.update = updateMock;
    builder.insert = insertMock;

    const fromMock = vi.fn(() => builder);
    return {
      clientState: { available: true },
      maybeSingleMock,
      writeOutcomes,
      fromMock,
      updateMock,
      insertMock,
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
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ACTIVITY_ID = '55555555-5555-5555-5555-555555555555';

const OWN_UPLOAD_PATH = `activity-uploads/${AUTHOR.id}/33333333-3333-3333-3333-333333333333.webp`;
const OTHER_UPLOAD_PATH =
  'activity-uploads/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333.webp';
const THIS_ACTIVITY_IMAGE_PATH = `activity-images/${ACTIVITY_ID}/33333333-3333-3333-3333-333333333333.webp`;
const OTHER_ACTIVITY_IMAGE_PATH = `activity-images/${OTHER_ACTIVITY_ID}/33333333-3333-3333-3333-333333333333.webp`;

function worksheetBlock(path: string) {
  return {
    id: 'block-1',
    type: 'worksheet',
    image: { path, width: 800, height: 600 },
    zones: [],
  };
}

function ctx(args: { id?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { id = ACTIVITY_ID, user = AUTHOR, body, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/guardar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

function saveInput(overrides: Partial<{ title: unknown; level: unknown; blocks: unknown }> = {}) {
  return {
    title: 'Mi actividad',
    level: null,
    blocks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  writeOutcomes.length = 0;
  maybeSingleMock.mockReset();
  // Default: activity fetch finds the row, then no prior revision (so the
  // save takes the "insert a first draft" branch unless a test overrides it).
  maybeSingleMock
    .mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null })
    .mockResolvedValue({ data: null, error: null });
});

describe('POST /api/actividades/[id]/guardar — identity', () => {
  it('401s an anonymous POST, and nothing is read or written', async () => {
    const res = await POST(ctx({ user: null, body: saveInput() }));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('404s a malformed id before any query', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid', body: saveInput() }));
    expect(res.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/guardar — ownership (404 for both, never 403)', () => {
  it('404s when no activity row matches (id, author_id) — same shape for missing and not-owned', async () => {
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(ctx({ body: saveInput() }));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('excludes a removed activity from its own author save surface', async () => {
    await POST(ctx({ body: saveInput() }));
    expect(fromMock).toHaveBeenCalledWith('activities');
  });
});

describe('POST /api/actividades/[id]/guardar — request shape', () => {
  it('400s invalid JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('400s a body missing title/level/blocks', async () => {
    const res = await POST(ctx({ body: { foo: 'bar' } }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/actividades/[id]/guardar — title', () => {
  it('422s an empty (trimmed) title', async () => {
    const res = await POST(ctx({ body: saveInput({ title: '   ' }) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_title');
  });

  it('422s a title over 120 chars', async () => {
    const res = await POST(ctx({ body: saveInput({ title: 'x'.repeat(121) }) }));
    expect(res.status).toBe(422);
  });

  it('accepts a title exactly at 120 chars', async () => {
    const res = await POST(ctx({ body: saveInput({ title: 'x'.repeat(120) }) }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/[id]/guardar — level', () => {
  it('422s an out-of-taxonomy level', async () => {
    const res = await POST(ctx({ body: saveInput({ level: 'Z9' }) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_level');
  });

  it('accepts null', async () => {
    const res = await POST(ctx({ body: saveInput({ level: null }) }));
    expect(res.status).toBe(200);
  });

  it('accepts a valid CEFR level', async () => {
    const res = await POST(ctx({ body: saveInput({ level: 'B1' }) }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/[id]/guardar — blocks validation', () => {
  it('422s when blocks fail parseBlocks', async () => {
    const res = await POST(ctx({ body: saveInput({ blocks: [{ type: 'nonsense' }] }) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_blocks');
  });
});

describe('POST /api/actividades/[id]/guardar — image ownership', () => {
  it("422s a worksheet image that is neither the caller's own upload nor this activity's own images path", async () => {
    const res = await POST(
      ctx({ body: saveInput({ blocks: [worksheetBlock(OTHER_UPLOAD_PATH)] }) }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_image_path');
  });

  it("422s an activity-images path that belongs to a DIFFERENT activity", async () => {
    const res = await POST(
      ctx({ body: saveInput({ blocks: [worksheetBlock(OTHER_ACTIVITY_IMAGE_PATH)] }) }),
    );
    expect(res.status).toBe(422);
  });

  it("accepts the caller's own upload path", async () => {
    const res = await POST(ctx({ body: saveInput({ blocks: [worksheetBlock(OWN_UPLOAD_PATH)] }) }));
    expect(res.status).toBe(200);
  });

  it("accepts THIS activity's own activity-images path", async () => {
    const res = await POST(
      ctx({ body: saveInput({ blocks: [worksheetBlock(THIS_ACTIVITY_IMAGE_PATH)] }) }),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/[id]/guardar — draft revision update vs. insert', () => {
  it('updates the latest revision in place when it is still a draft', async () => {
    maybeSingleMock
      .mockReset()
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: 'rev-1', status: 'draft' }, error: null });

    const res = await POST(ctx({ body: saveInput() }));

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ blocks: [] });
    expect(insertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: ACTIVITY_ID }),
    );
  });

  it('inserts a fresh draft revision when the latest one is not a draft', async () => {
    maybeSingleMock
      .mockReset()
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: 'rev-1', status: 'pending_review' }, error: null });

    const res = await POST(ctx({ body: saveInput() }));

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith({
      activity_id: ACTIVITY_ID,
      blocks: [],
      created_by: AUTHOR.id,
      status: 'draft',
    });
  });

  it('inserts a fresh draft revision when no revision exists at all', async () => {
    maybeSingleMock
      .mockReset()
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await POST(ctx({ body: saveInput() }));

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/guardar — activity metadata update', () => {
  it('updates title/level/updated_at on success', async () => {
    await POST(ctx({ body: saveInput({ title: '  Mi actividad  ', level: 'A2' }) }));

    const activityUpdateCall = updateMock.mock.calls.find(
      (call) => typeof (call[0] as Record<string, unknown>)?.title === 'string',
    );
    expect(activityUpdateCall?.[0]).toMatchObject({ title: 'Mi actividad', level: 'A2' });
    expect(typeof (activityUpdateCall?.[0] as Record<string, unknown>).updated_at).toBe('string');
  });
});

describe('POST /api/actividades/[id]/guardar — failures', () => {
  it('500s when the revision write fails, and the activity is never updated', async () => {
    writeOutcomes.push({ error: { message: 'boom' } });
    const res = await POST(ctx({ body: saveInput() }));
    expect(res.status).toBe(500);
  });

  it('500s when the activity update fails', async () => {
    writeOutcomes.push({ error: null }); // revision write succeeds
    writeOutcomes.push({ error: { message: 'boom' } }); // activity update fails
    const res = await POST(ctx({ body: saveInput() }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/actividades/[id]/guardar — response shape', () => {
  it('returns { ok: true } on success', async () => {
    const res = await POST(ctx({ body: saveInput() }));
    expect(await res.json()).toEqual({ ok: true });
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null, body: saveInput() }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
