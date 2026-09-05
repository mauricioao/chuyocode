/**
 * Exercise detail route tests — `/[lang]/ingles/[level]/[topic]/[slug]`.
 *
 * STATUS CODES ONLY. AstroContainer cannot render this page's React islands
 * (ExerciseIsland + the layout's ThemeToggle) without the @astrojs/react server
 * renderer — the same limitation that forced the `it.skip`s in
 * `src/pages/[lang]/libros/libros.test.ts:47`. Every 404 path IS assertable,
 * because the guard returns before any island is reached; the 200 path is
 * skipped with that reference, and its logic lives in tested modules instead.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// env.ts reads import.meta.env — stub it before any module that calls loadEnv().
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'test-proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

const getExerciseBySlug = vi.fn();
vi.mock('@lib/exercises', () => ({
  getExerciseBySlug: (...args: unknown[]) => getExerciseBySlug(...args),
}));

import DetailPage from './[level]/[topic]/[slug].astro';

async function render(params: Record<string, string>, locals?: Record<string, unknown>) {
  const container = await AstroContainer.create();
  return container.renderToResponse(DetailPage, {
    params,
    locals: locals ?? {},
    request: new Request('https://chuyocode.test/'),
  });
}

const valid = { lang: 'es', level: 'B1', topic: 'job-interview', slug: 'greetings' };

describe('ingles/[level]/[topic]/[slug].astro', () => {
  beforeEach(() => {
    getExerciseBySlug.mockReset();
    getExerciseBySlug.mockResolvedValue(null);
  });

  it('returns 404 for an invalid level', async () => {
    const res = await render({ ...valid, level: 'Z9' }, { lang: 'es' });

    expect(res.status).toBe(404);
    // Rejected BEFORE the query: an unknown segment can never match a row.
    expect(getExerciseBySlug).not.toHaveBeenCalled();
  });

  it('returns 404 for an invalid topic', async () => {
    const res = await render({ ...valid, topic: 'space-travel' }, { lang: 'es' });

    expect(res.status).toBe(404);
    expect(getExerciseBySlug).not.toHaveBeenCalled();
  });

  it('returns 404 for an unsupported language', async () => {
    const res = await render({ ...valid, lang: 'fr' });

    expect(res.status).toBe(404);
    expect(getExerciseBySlug).not.toHaveBeenCalled();
  });

  it('returns 404 when the query finds no exercise', async () => {
    getExerciseBySlug.mockResolvedValue(null);

    const res = await render(valid, { lang: 'es' });

    expect(res.status).toBe(404);
    // The taxonomy was valid, so the query DID run before the 404.
    expect(getExerciseBySlug).toHaveBeenCalledWith('B1', 'job-interview', 'greetings');
  });

  it('returns 404 when the data layer fail-safes a Supabase outage to null', async () => {
    getExerciseBySlug.mockResolvedValue(null);

    const res = await render({ ...valid, lang: 'en' }, { lang: 'en' });

    expect(res.status).toBe(404);
  });

  // Skipped for the same reason as src/pages/[lang]/libros/libros.test.ts:47 —
  // AstroContainer cannot render the React islands this page mounts.
  it.skip('renders the exercise island for a published slug', async () => {
    getExerciseBySlug.mockResolvedValue({
      id: 'e1',
      slug: 'greetings',
      skill: 'reading',
      level: 'B1',
      topic: 'job-interview',
      hasAudio: false,
      payload: {
        pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
        slots: [
          { id: 's1', label: 'The cat ___', input: 'choice', pool: 'opts', answer: ['b'] },
        ],
      },
    });

    const res = await render(valid, { lang: 'es' });
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('The cat ___');
  });
});
