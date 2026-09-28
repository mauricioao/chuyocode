/**
 * Integration tests for `POST /api/actividades/[id]/enviar` — see the
 * endpoint's own header for the full decision table. `@lib/supabase` is
 * mocked with the same shared chainable builder as `_guardar.test.ts`
 * (`.select().eq().eq().neq().maybeSingle()`,
 * `.select().eq().order().limit().maybeSingle()`, `.update(...).eq(...)`
 * awaited directly).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { clientState, maybeSingleMock, writeOutcomes, fromMock, updateMock } = vi.hoisted(() => {
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
  builder.eq = eqMock;
  builder.neq = neqMock;
  builder.order = orderMock;
  builder.limit = limitMock;
  builder.select = selectMock;
  builder.update = updateMock;

  const fromMock = vi.fn(() => builder);
  return { clientState: { available: true }, maybeSingleMock, writeOutcomes, fromMock, updateMock };
});

vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import { POST } from './enviar';

const AUTHOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

const WORKSHEET_WITH_ZONE = {
  id: 'block-1',
  type: 'worksheet',
  image: { path: `activity-uploads/${AUTHOR.id}/33333333-3333-3333-3333-333333333333.webp`, width: 800, height: 600 },
  zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['gato'] }],
};

const WORKSHEET_NO_ZONE = {
  id: 'block-1',
  type: 'worksheet',
  image: { path: `activity-uploads/${AUTHOR.id}/33333333-3333-3333-3333-333333333333.webp`, width: 800, height: 600 },
  zones: [],
};

function ctx(args: { id?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { id = ACTIVITY_ID, user = AUTHOR, body, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/enviar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

/** Queue the two reads every happy-path call makes: the activity row, then the latest revision. */
function queueActivityAndRevision(
  activity: { title?: string; status?: string } | null,
  revision: { id?: string; status?: string; blocks?: unknown } | null,
) {
  maybeSingleMock
    .mockReset()
    .mockResolvedValueOnce(
      activity ? { data: { id: ACTIVITY_ID, title: activity.title, status: activity.status }, error: null } : { data: null, error: null },
    )
    .mockResolvedValueOnce(revision ? { data: revision, error: null } : { data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  writeOutcomes.length = 0;
  maybeSingleMock.mockReset();
  queueActivityAndRevision(
    { title: 'Mi actividad', status: 'draft' },
    { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_WITH_ZONE] },
  );
});

describe('POST /api/actividades/[id]/enviar — identity', () => {
  it('401s an anonymous POST, and nothing is read or written', async () => {
    const res = await POST(ctx({ user: null, body: { acceptedRights: true } }));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('404s a malformed id before any query', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid', body: { acceptedRights: true } }));
    expect(res.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/enviar — ownership (404 for both, never 403)', () => {
  it('404s when no activity row matches (id, author_id)', async () => {
    queueActivityAndRevision(null, null);
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/enviar — request shape', () => {
  it('400s invalid JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('400s a body missing acceptedRights', async () => {
    const res = await POST(ctx({ body: {} }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/actividades/[id]/enviar — rights acceptance', () => {
  it('422s when acceptedRights is not true', async () => {
    const res = await POST(ctx({ body: { acceptedRights: false } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('rights_required');
  });
});

describe('POST /api/actividades/[id]/enviar — validation', () => {
  it('422s an empty (trimmed) title', async () => {
    queueActivityAndRevision({ title: '   ', status: 'draft' }, { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_WITH_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_title');
  });

  it('422s the default placeholder title (es)', async () => {
    queueActivityAndRevision({ title: 'Sin título', status: 'draft' }, { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_WITH_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_title');
  });

  it('422s the default placeholder title (en)', async () => {
    queueActivityAndRevision({ title: 'Untitled', status: 'draft' }, { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_WITH_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_title');
  });

  it('422s zero blocks', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'draft' }, { id: 'rev-1', status: 'draft', blocks: [] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('no_blocks');
  });

  it('422s a worksheet block with no zones, naming the block (creator polish round 3)', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'draft' }, { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_NO_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: 'incomplete', blockId: 'block-1', zoneId: null, reason: 'no_zones' });
  });

  it('422s a zone with no answers, naming the block AND zone (creator polish round 3)', async () => {
    const worksheetZoneNoAnswers = {
      id: 'block-1',
      type: 'worksheet',
      image: { path: `activity-uploads/${AUTHOR.id}/33333333-3333-3333-3333-333333333333.webp`, width: 800, height: 600 },
      zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: [] }],
    };
    queueActivityAndRevision(
      { title: 'Mi actividad', status: 'draft' },
      { id: 'rev-1', status: 'draft', blocks: [worksheetZoneNoAnswers] },
    );
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'incomplete', blockId: 'block-1', zoneId: 'z1', reason: 'no_answers' });
  });

  it('422s a choice zone with fewer than 2 options', async () => {
    const worksheetTooFewOptions = {
      id: 'block-1',
      type: 'worksheet',
      image: { path: `activity-uploads/${AUTHOR.id}/33333333-3333-3333-3333-333333333333.webp`, width: 800, height: 600 },
      zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'choice', answers: ['cat'], options: ['cat'] }],
    };
    queueActivityAndRevision(
      { title: 'Mi actividad', status: 'draft' },
      { id: 'rev-1', status: 'draft', blocks: [worksheetTooFewOptions] },
    );
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'incomplete',
      blockId: 'block-1',
      zoneId: 'z1',
      reason: 'too_few_options',
    });
  });

  it('422s malformed blocks', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'draft' }, { id: 'rev-1', status: 'draft', blocks: [{ type: 'nonsense' }] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_blocks');
  });

  it('422s when the latest revision is not a draft and not already pending (nothing to submit)', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'live' }, { id: 'rev-1', status: 'approved', blocks: [WORKSHEET_WITH_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('no_draft');
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/enviar — idempotency', () => {
  it('200s without writing anything when the latest revision is already pending_review', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'pending_review' }, { id: 'rev-1', status: 'pending_review', blocks: [WORKSHEET_WITH_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/enviar — success, status transitions', () => {
  it('marks the revision pending_review and sets rights_accepted_at, from a draft activity', async () => {
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending_review' }));
    const revisionUpdateCall = updateMock.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).status === 'pending_review',
    );
    expect(typeof (revisionUpdateCall?.[0] as Record<string, unknown>).rights_accepted_at).toBe('string');
  });

  it('moves the activity from draft to pending_review', async () => {
    await POST(ctx({ body: { acceptedRights: true } }));
    const activityUpdateCall = updateMock.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).status === 'pending_review' && 'updated_at' in (call[0] as Record<string, unknown>),
    );
    expect(activityUpdateCall).toBeTruthy();
  });

  it('moves the activity from rejected to pending_review', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'rejected' }, { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_WITH_ZONE] });
    await POST(ctx({ body: { acceptedRights: true } }));
    const activityUpdateCall = updateMock.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).status === 'pending_review' && 'updated_at' in (call[0] as Record<string, unknown>),
    );
    expect(activityUpdateCall).toBeTruthy();
  });

  it('leaves a live activity live (the published revision keeps serving)', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'live' }, { id: 'rev-1', status: 'draft', blocks: [WORKSHEET_WITH_ZONE] });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(200);
    const activityStatusUpdateCall = updateMock.mock.calls.find(
      (call) => 'status' in (call[0] as Record<string, unknown>) && !('blocks' in (call[0] as Record<string, unknown>)) === false,
    );
    // No activities-table update carries a `status` field at all when already live.
    const anyActivityStatusUpdate = updateMock.mock.calls.some((call) => {
      const payload = call[0] as Record<string, unknown>;
      return 'updated_at' in payload && payload.status === 'pending_review';
    });
    expect(anyActivityStatusUpdate).toBe(false);
    void activityStatusUpdateCall;
  });
});

describe('POST /api/actividades/[id]/enviar — failures', () => {
  it('500s when no revision exists at all (data invariant violation)', async () => {
    queueActivityAndRevision({ title: 'Mi actividad', status: 'draft' }, null);
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(500);
  });

  it('500s when the revision update fails', async () => {
    writeOutcomes.push({ error: { message: 'boom' } });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(500);
  });

  it('500s when the activity update fails', async () => {
    writeOutcomes.push({ error: null });
    writeOutcomes.push({ error: { message: 'boom' } });
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/actividades/[id]/enviar — response shape', () => {
  it('returns { ok: true } on success', async () => {
    const res = await POST(ctx({ body: { acceptedRights: true } }));
    expect(await res.json()).toEqual({ ok: true });
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null, body: { acceptedRights: true } }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
