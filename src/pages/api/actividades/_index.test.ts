/**
 * Integration tests for `POST /api/actividades` (create). `@lib/activities/activities`
 * is mocked so this isolates the endpoint's own decisions (auth guard,
 * shape/lang/blocks/image-ownership checks, response shape) from the data
 * layer, which has its own tests (`activities.test.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { createActivityMock } = vi.hoisted(() => ({ createActivityMock: vi.fn() }));
vi.mock('@lib/activities/activities', () => ({ createActivity: createActivityMock }));

import { POST } from './index';

const USER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const NEW_ID = '22222222-2222-2222-2222-222222222222';

const OWN_IMAGE_PATH = `activity-uploads/${USER.id}/33333333-3333-3333-3333-333333333333.webp`;
const OTHER_IMAGE_PATH = 'activity-uploads/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333.webp';

function worksheetBlock(path: string) {
  return {
    id: 'block-1',
    type: 'worksheet',
    image: { path, width: 800, height: 600 },
    zones: [],
  };
}

function ctx(args: { user?: User | null; body?: unknown; rawBody?: string }) {
  const { user = USER, body, rawBody } = args;
  const request = new Request('https://chuyo.test/api/actividades', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return { request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createActivityMock.mockResolvedValue(NEW_ID);
});

describe('POST /api/actividades — identity', () => {
  it('401s an anonymous request, and nothing is created', async () => {
    const res = await POST(ctx({ user: null, body: { lang: 'es', blocks: [] } }));
    expect(res.status).toBe(401);
    expect(createActivityMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades — request shape', () => {
  it('400s invalid JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('400s a body missing lang/blocks', async () => {
    const res = await POST(ctx({ body: { foo: 'bar' } }));
    expect(res.status).toBe(400);
  });

  it('400s an unsupported lang', async () => {
    const res = await POST(ctx({ body: { lang: 'fr', blocks: [] } }));
    expect(res.status).toBe(400);
    expect(createActivityMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades — blocks validation', () => {
  it('422s when blocks fail parseBlocks', async () => {
    const res = await POST(ctx({ body: { lang: 'es', blocks: [{ type: 'nonsense' }] } }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('invalid_blocks');
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it('accepts an empty blocks list', async () => {
    const res = await POST(ctx({ body: { lang: 'es', blocks: [] } }));
    expect(res.status).toBe(200);
  });

  // "First block visible" (creator polish round 4, owner feedback #2): the
  // start screen now seeds the chosen type's first block in THIS call —
  // `'draft'` mode tolerates a worksheet with no image yet (the editor's own
  // empty-state block) and a quiz block with no questions yet.
  it('accepts a worksheet block with no image yet (draft-tolerant, the empty-state block)', async () => {
    const res = await POST(
      ctx({ body: { lang: 'es', blocks: [{ id: 'b1', type: 'worksheet', rotation: 0, zones: [] }] } }),
    );
    expect(res.status).toBe(200);
    expect(createActivityMock).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({
        blocks: [expect.objectContaining({ type: 'worksheet', zones: [] })],
      }),
    );
  });

  it('accepts an empty quiz block (no questions yet)', async () => {
    const res = await POST(
      ctx({ body: { lang: 'es', blocks: [{ id: 'b1', type: 'quiz', payload: { pools: {}, slots: [] } }] } }),
    );
    expect(res.status).toBe(200);
    expect(createActivityMock).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({
        blocks: [expect.objectContaining({ type: 'quiz', payload: { pools: {}, slots: [] } })],
      }),
    );
  });
});

describe('POST /api/actividades — image ownership', () => {
  it("422s when a worksheet image is not the caller's own upload", async () => {
    const res = await POST(
      ctx({ body: { lang: 'es', blocks: [worksheetBlock(OTHER_IMAGE_PATH)] } }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('invalid_image_path');
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it("accepts the caller's own upload path", async () => {
    const res = await POST(
      ctx({ body: { lang: 'es', blocks: [worksheetBlock(OWN_IMAGE_PATH)] } }),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades — default title by lang', () => {
  it('assigns the Spanish default title', async () => {
    await POST(ctx({ body: { lang: 'es', blocks: [] } }));
    expect(createActivityMock).toHaveBeenCalledWith(USER.id, {
      title: 'Sin título',
      level: null,
      blocks: [],
    });
  });

  it('assigns the English default title', async () => {
    await POST(ctx({ body: { lang: 'en', blocks: [] } }));
    expect(createActivityMock).toHaveBeenCalledWith(USER.id, {
      title: 'Untitled',
      level: null,
      blocks: [],
    });
  });
});

describe('POST /api/actividades — success/failure', () => {
  it('500s when creation fails', async () => {
    createActivityMock.mockResolvedValue(null);
    const res = await POST(ctx({ body: { lang: 'es', blocks: [] } }));
    expect(res.status).toBe(500);
  });

  it('returns { id } on success', async () => {
    const res = await POST(ctx({ body: { lang: 'es', blocks: [] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: NEW_ID });
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(ctx({ body: { lang: 'es', blocks: [] } }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
