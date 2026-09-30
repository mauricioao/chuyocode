import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, updateLessonMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  updateLessonMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ updateLesson: updateLessonMock }));

import { POST } from './actualizar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';
const MODULE_ID = '44444444-4444-4444-4444-444444444444';
const LESSON_ID = '55555555-5555-5555-5555-555555555555';

function ctx(args: {
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  user?: User | null;
  body?: unknown;
  rawBody?: string;
}) {
  const {
    courseId = COURSE_ID,
    moduleId = MODULE_ID,
    lessonId = LESSON_ID,
    user = CALLER,
    body = { title: 'Nuevo título' },
    rawBody,
  } = args;
  const request = new Request(
    `https://chuyo.test/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones/${lessonId}/actualizar`,
    { method: 'POST', body: rawBody ?? JSON.stringify(body) },
  );
  return { params: { courseId, moduleId, lessonId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  updateLessonMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST .../lecciones/[lessonId]/actualizar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed lessonId', async () => {
    expect((await POST(ctx({ lessonId: 'x' }))).status).toBe(404);
    expect(updateLessonMock).not.toHaveBeenCalled();
  });
});

describe('POST .../lecciones/[lessonId]/actualizar — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('forwards kind alone through to updateLesson, which rejects the unpaired patch (422)', async () => {
    updateLessonMock.mockResolvedValue({ ok: false, error: 'invalid_content' });
    const res = await POST(ctx({ body: { kind: 'video' } }));
    expect(res.status).toBe(422);
    expect(updateLessonMock).toHaveBeenCalledWith(LESSON_ID, { kind: 'video' });
  });

  it('400s on an unrecognized kind', async () => {
    expect((await POST(ctx({ body: { kind: 'audio', content: {} } }))).status).toBe(400);
  });

  it('accepts a title-only patch', async () => {
    const res = await POST(ctx({ body: { title: 'Otro título' } }));
    expect(res.status).toBe(200);
    expect(updateLessonMock).toHaveBeenCalledWith(LESSON_ID, { title: 'Otro título' });
  });

  it('accepts kind + content together', async () => {
    await POST(ctx({ body: { kind: 'video', content: { url: 'https://youtu.be/x' } } }));
    expect(updateLessonMock).toHaveBeenCalledWith(LESSON_ID, {
      kind: 'video',
      content: { url: 'https://youtu.be/x' },
    });
  });

  it('accepts an is_preview-only patch', async () => {
    await POST(ctx({ body: { is_preview: true } }));
    expect(updateLessonMock).toHaveBeenCalledWith(LESSON_ID, { is_preview: true });
  });
});

describe('POST .../lecciones/[lessonId]/actualizar — outcomes', () => {
  it('200s with { ok: true }', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it.each(['invalid_title', 'invalid_duration', 'invalid_kind', 'invalid_content', 'activity_not_live'])(
    '422s on validation error %s',
    async (error) => {
      updateLessonMock.mockResolvedValue({ ok: false, error });
      expect((await POST(ctx({}))).status).toBe(422);
    },
  );

  it('500s on a db error', async () => {
    updateLessonMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
