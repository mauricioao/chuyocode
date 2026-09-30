import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, createLessonMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  createLessonMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ createLesson: createLessonMock }));

import { POST } from './index';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';
const MODULE_ID = '44444444-4444-4444-4444-444444444444';

function ctx(args: { courseId?: string; moduleId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const {
    courseId = COURSE_ID,
    moduleId = MODULE_ID,
    user = CALLER,
    body = { title: 'Lección 1', kind: 'text', content: { markdown: 'hola' } },
    rawBody,
  } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId, moduleId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  createLessonMock.mockResolvedValue({ ok: true, value: { id: 'l1' } });
});

describe('POST .../lecciones — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed moduleId', async () => {
    expect((await POST(ctx({ moduleId: 'x' }))).status).toBe(404);
    expect(createLessonMock).not.toHaveBeenCalled();
  });
});

describe('POST .../lecciones — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s on an unrecognized kind', async () => {
    expect((await POST(ctx({ body: { title: 'X', kind: 'audio', content: {} } }))).status).toBe(400);
  });

  it('400s when content is missing', async () => {
    expect((await POST(ctx({ body: { title: 'X', kind: 'text' } }))).status).toBe(400);
  });

  it('400s when duration_min is not a number', async () => {
    expect(
      (await POST(ctx({ body: { title: 'X', kind: 'text', content: {}, duration_min: 'five' } }))).status,
    ).toBe(400);
  });

  it('400s when is_preview is not a boolean', async () => {
    expect(
      (await POST(ctx({ body: { title: 'X', kind: 'text', content: {}, is_preview: 'yes' } }))).status,
    ).toBe(400);
  });

  it('forwards a well-formed video lesson', async () => {
    await POST(
      ctx({ body: { title: 'Video', kind: 'video', content: { url: 'https://youtu.be/x' }, is_preview: true } }),
    );
    expect(createLessonMock).toHaveBeenCalledWith(MODULE_ID, {
      title: 'Video',
      kind: 'video',
      content: { url: 'https://youtu.be/x' },
      duration_min: null,
      is_preview: true,
    });
  });
});

describe('POST .../lecciones — outcomes', () => {
  it('201s with the new id', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'l1' });
  });

  it.each(['invalid_title', 'invalid_duration', 'invalid_kind', 'invalid_content', 'activity_not_live'])(
    '422s on validation error %s',
    async (error) => {
      createLessonMock.mockResolvedValue({ ok: false, error });
      expect((await POST(ctx({}))).status).toBe(422);
    },
  );

  it('500s on a db error', async () => {
    createLessonMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
