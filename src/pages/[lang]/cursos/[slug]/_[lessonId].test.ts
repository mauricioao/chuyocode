import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { requireRoleMock, getPlanMock, getCourseDetailBySlugMock, ownsState, getPublishedActivityMock } = vi.hoisted(
  () => ({
    requireRoleMock: vi.fn(),
    getPlanMock: vi.fn(),
    getCourseDetailBySlugMock: vi.fn(),
    ownsState: { owns: false },
    getPublishedActivityMock: vi.fn(),
  }),
);

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/access', () => ({ getPlan: getPlanMock }));
vi.mock('@lib/courses/catalog', () => ({ getCourseDetailBySlug: getCourseDetailBySlugMock }));
vi.mock('@lib/activities/activities', () => ({ getPublishedActivity: getPublishedActivityMock }));
// See `[slug]/_index.test.ts`'s matching comment: `@lib/courses/access`
// itself runs for real (its predicates are unit-tested in `access.test.ts`);
// only its supabase dependency is faked so `ownsCourse` resolves without
// real Supabase env vars.
vi.mock('@lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(ownsState.owns ? { data: { id: 'p1' }, error: null } : { data: null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import LessonPlayerPage from './[lessonId].astro';

const USER = { id: 'u1' };

function courseFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    slug: 'react-basico',
    title: 'React básico',
    subtitle: null,
    description: null,
    level: null,
    coverPath: null,
    status: 'published',
    includedInPremium: true,
    priceCents: 1999,
    currency: 'USD',
    modules: [
      {
        id: 'm1',
        position: 0,
        title: 'Módulo 1',
        lessons: [
          { id: 'l1', position: 0, title: 'Introducción', kind: 'text', content: { markdown: '**hola**' }, duration_min: 5, is_preview: true },
          { id: 'l2', position: 1, title: 'Componentes', kind: 'video', content: { url: 'https://youtu.be/dQw4w9WgXcQ' }, duration_min: 10, is_preview: false },
          { id: 'l3', position: 2, title: 'Práctica', kind: 'activity', content: { activityId: 'a1a1a1a1-0000-4000-8000-000000000001' }, duration_min: null, is_preview: false },
        ],
      },
    ],
    ...overrides,
  };
}

async function render(url: string, params: Record<string, string>, locals: Record<string, unknown> = {}) {
  const container = await createContainer();
  return container.renderToResponse(LessonPlayerPage, {
    locals: { user: USER, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
  getPlanMock.mockResolvedValue('free');
  ownsState.owns = false;
  getCourseDetailBySlugMock.mockResolvedValue(courseFixture());
  getPublishedActivityMock.mockResolvedValue({
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    title: 'Presente simple',
    blocks: [],
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — existence', () => {
  it('404s when the course does not exist', async () => {
    getCourseDetailBySlugMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    expect(res.status).toBe(404);
  });

  it('404s a draft course for a non-moderator', async () => {
    getCourseDetailBySlugMock.mockResolvedValue(courseFixture({ status: 'draft' }));
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    expect(res.status).toBe(404);
  });

  it('404s when the lessonId does not belong to the course', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/missing', { lang: 'es', slug: 'react-basico', lessonId: 'missing' });
    expect(res.status).toBe(404);
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — text lesson', () => {
  it('renders sanitized markdown for a viewable (preview) text lesson', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="lesson-text"');
    expect(html).toContain('<strong>hola</strong>');
  });

  it('wraps the rendered markdown in the lesson-prose container (H9: @tailwindcss/typography is not installed, so bare "prose" classes rendered as plain text)', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    const html = await res.text();
    const textTag = html.match(/<div[^>]*data-testid="lesson-text"[^>]*>/)?.[0];
    expect(textTag).toBeDefined();
    expect(textTag).toMatch(/class="[^"]*\blesson-prose\b/);
  });

  it('strips a raw script tag even if it made it into stored markdown', async () => {
    getCourseDetailBySlugMock.mockResolvedValue(
      courseFixture({
        modules: [
          {
            id: 'm1',
            position: 0,
            title: 'M1',
            lessons: [
              { id: 'l1', position: 0, title: 'X', kind: 'text', content: { markdown: 'hola <script>alert(1)</script>' }, duration_min: null, is_preview: true },
            ],
          },
        ],
      }),
    );
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    const html = await res.text();
    expect(html).not.toContain('<script>alert');
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — locked lesson', () => {
  it('shows the lock screen with the same CTA buttons for a non-viewable lesson', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l2', { lang: 'es', slug: 'react-basico', lessonId: 'l2' });
    const html = await res.text();
    expect(html).toContain('data-testid="lesson-locked"');
    expect(html).toContain('data-testid="cta-premium"');
    expect(html).toContain('data-testid="cta-buy-lifetime"');
    expect(html).not.toContain('data-testid="lesson-video"');
  });

  it('never fetches the activity for a locked activity lesson', async () => {
    await render('https://chuyocode.test/es/cursos/react-basico/l3', { lang: 'es', slug: 'react-basico', lessonId: 'l3' });
    expect(getPublishedActivityMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — video lesson', () => {
  it('embeds a privacy-friendly youtube-nocookie iframe when viewable', async () => {
    getPlanMock.mockResolvedValue('premium');
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l2', { lang: 'es', slug: 'react-basico', lessonId: 'l2' });
    const html = await res.text();
    expect(html).toContain('data-testid="lesson-video"');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('shows the unavailable fallback for an unparsable stored url', async () => {
    getPlanMock.mockResolvedValue('premium');
    getCourseDetailBySlugMock.mockResolvedValue(
      courseFixture({
        modules: [
          {
            id: 'm1',
            position: 0,
            title: 'M1',
            lessons: [{ id: 'l2', position: 0, title: 'V', kind: 'video', content: { url: 'https://evil.example.com/x' }, duration_min: null, is_preview: false }],
          },
        ],
      }),
    );
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l2', { lang: 'es', slug: 'react-basico', lessonId: 'l2' });
    const html = await res.text();
    expect(html).toContain('data-testid="lesson-video-unavailable"');
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — activity lesson', () => {
  it('renders the practice island for a viewable activity lesson', async () => {
    getPlanMock.mockResolvedValue('premium');
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l3', { lang: 'es', slug: 'react-basico', lessonId: 'l3' });
    const html = await res.text();
    expect(getPublishedActivityMock).toHaveBeenCalledWith('a1a1a1a1-0000-4000-8000-000000000001');
    expect(html).toContain('component-url="@components/islands/activities/ActivityPracticeIsland"');
  });

  it('mounts the practice island inside a height-bounded frame (it sizes itself to its parent, so an unbounded parent collapses it)', async () => {
    getPlanMock.mockResolvedValue('premium');
    getPublishedActivityMock.mockResolvedValue({ id: 'a1a1a1a1-0000-4000-8000-000000000001', title: 'Presente simple', blocks: [], authorId: 'u2' });
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l3', { lang: 'es', slug: 'react-basico', lessonId: 'l3' });
    const html = await res.text();
    // jsdom/node cannot compute layout, so assert the rendered contract: the
    // island sits inside a frame with an explicit height (the island's own
    // scroll area is `[container-type:size]` + `flex-1 min-h-0`, which
    // collapses to ~90px under a content-sized parent — seen in the
    // 2026-10-17 walkthrough).
    const frameTag = html.match(/<div[^>]*data-testid="lesson-activity"[^>]*>/)?.[0];
    expect(frameTag).toBeDefined();
    const frameClass = frameTag!.match(/class="([^"]*)"/)?.[1] ?? '';
    expect(frameClass).toMatch(/(^|\s)h-\[/);
    expect(frameClass).toMatch(/(^|\s)min-h-/);
    const frameStart = html.indexOf(frameTag!);
    const islandAt = html.indexOf('component-url="@components/islands/activities/ActivityPracticeIsland"');
    expect(islandAt).toBeGreaterThan(frameStart);
  });

  it('renders the practice island for a ChuyoCode-owned activity (NULL authorId, 0020 account deletion transfer)', async () => {
    getPlanMock.mockResolvedValue('premium');
    getPublishedActivityMock.mockResolvedValue({
      id: 'a1a1a1a1-0000-4000-8000-000000000001',
      title: 'Presente simple',
      blocks: [],
      authorId: null,
    });
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l3', { lang: 'es', slug: 'react-basico', lessonId: 'l3' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('component-url="@components/islands/activities/ActivityPracticeIsland"');
  });

  it('shows the unavailable fallback when the activity is no longer live', async () => {
    getPlanMock.mockResolvedValue('premium');
    getPublishedActivityMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l3', { lang: 'es', slug: 'react-basico', lessonId: 'l3' });
    const html = await res.text();
    expect(html).toContain('data-testid="lesson-activity-unavailable"');
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — sidebar lock (H10)', () => {
  it('marks a non-viewable lesson with the same lock icon the landing syllabus uses, and leaves a viewable one unmarked', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    const html = await res.text();
    // Scope to the sidebar only — the bottom prev/next nav also links to
    // l2/l3 and must not be mistaken for the sidebar's own entries.
    const sidebar = html.match(/data-testid="lesson-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? '';
    expect(sidebar).not.toBe('');
    // l1 is a preview lesson (viewable) — no lock in either sidebar list.
    const l1Links = [...sidebar.matchAll(/<a[^>]*href="\/es\/cursos\/react-basico\/l1"[^>]*>[\s\S]*?<\/a>/g)];
    expect(l1Links.length).toBeGreaterThan(0);
    for (const match of l1Links) {
      expect(match[0]).not.toContain('🔒');
    }
    // l2/l3 are not preview and the default fixture visitor is free/not
    // owning/not moderator: locked, same as the landing syllabus (`🔒`,
    // `aria-hidden="true"`, see `[slug]/index.astro`).
    for (const lessonId of ['l2', 'l3']) {
      const links = [...sidebar.matchAll(new RegExp(`<a[^>]*href="/es/cursos/react-basico/${lessonId}"[^>]*>[\\s\\S]*?<\\/a>`, 'g'))];
      expect(links.length).toBeGreaterThan(0);
      for (const match of links) {
        expect(match[0]).toMatch(/<span aria-hidden="true"[^>]*>🔒<\/span>/);
      }
    }
  });
});

describe('GET /[lang]/cursos/[slug]/[lessonId] — navigation', () => {
  it('has no prev link on the first lesson and a next link to the second', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    const html = await res.text();
    expect(html).not.toContain('data-testid="lesson-prev"');
    expect(html).toContain('href="/es/cursos/react-basico/l2"');
  });

  it('has no next link on the last lesson and a prev link to the middle one', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l3', { lang: 'es', slug: 'react-basico', lessonId: 'l3' });
    const html = await res.text();
    expect(html).not.toContain('data-testid="lesson-next"');
    expect(html).toContain('href="/es/cursos/react-basico/l2"');
  });

  it('lists every lesson in the sidebar', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico/l1', { lang: 'es', slug: 'react-basico', lessonId: 'l1' });
    const html = await res.text();
    expect(html).toContain('Introducción');
    expect(html).toContain('Componentes');
    expect(html).toContain('Práctica');
  });
});
