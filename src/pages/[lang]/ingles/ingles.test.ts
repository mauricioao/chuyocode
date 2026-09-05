/**
 * Route tests for the whole English section — entry screen, listing, detail.
 *
 * STATUS CODES ONLY. AstroContainer cannot render React islands without the
 * @astrojs/react server renderer — the same limitation that forced the
 * `it.skip`s in `src/pages/[lang]/libros/libros.test.ts:47`. The detail page
 * mounts `ExerciseIsland`, so only its 404 paths are assertable and its 200 path
 * is skipped with that reference.
 *
 * The entry and listing pages mount NO island, so their 200 responses are real
 * and assertable. What is still NOT provable here is everything visual: which
 * chip looks active, whether a dimmed chip reads as unavailable, contrast, grid
 * layout. Two bugs in this repo were invisible to vitest, `astro check` AND
 * `astro build` and only a browser caught them, so those properties are verified
 * by hand, not asserted here — a CSS-class assertion would only pin the
 * implementation, never the appearance.
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
const getExerciseFacetRows = vi.fn();
const getPublishedExercises = vi.fn();
const getRelatedExercises = vi.fn();
vi.mock('@lib/exercises', () => ({
  getExerciseBySlug: (...args: unknown[]) => getExerciseBySlug(...args),
  getExerciseFacetRows: (...args: unknown[]) => getExerciseFacetRows(...args),
  getPublishedExercises: (...args: unknown[]) => getPublishedExercises(...args),
  getRelatedExercises: (...args: unknown[]) => getRelatedExercises(...args),
}));

import EntryPage from './index.astro';
import ListingPage from './[level]/[topic]/index.astro';
import DetailPage from './[level]/[topic]/[slug].astro';

type PageComponent = Parameters<AstroContainer['renderToResponse']>[0];

/**
 * Render a page the way the server would. `url` matters: the entry screen reads
 * `?nivel=` off `Astro.url`, so a test that changes the active level changes the
 * request, exactly like a real deep link.
 */
async function renderPage(
  Component: PageComponent,
  params: Record<string, string>,
  locals?: Record<string, unknown>,
  url = 'https://chuyocode.test/',
) {
  const container = await AstroContainer.create();
  return container.renderToResponse(Component, {
    params,
    locals: locals ?? {},
    request: new Request(url),
  });
}

async function render(params: Record<string, string>, locals?: Record<string, unknown>) {
  return renderPage(DetailPage, params, locals);
}

/** A published row as the flat facets query returns it. */
const facetRow = (level: string, topic: string) => ({ level, topic });

/** The shape `getPublishedExercises` hands the listing page. */
const publishedExercise = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  skill: 'reading',
  level: 'B1',
  topic: 'job-interview',
  hasAudio: false,
  payload: {
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [
      { id: 's1', label: `Prompt for ${slug}`, input: 'choice', pool: 'opts', answer: ['b'] },
    ],
  },
});

const valid = { lang: 'es', level: 'B1', topic: 'job-interview', slug: 'greetings' };

describe('ingles/index.astro (section entry)', () => {
  beforeEach(() => {
    getExerciseFacetRows.mockReset();
    getExerciseFacetRows.mockResolvedValue([]);
  });

  it('returns 404 for an unsupported language', async () => {
    const res = await renderPage(EntryPage, { lang: 'fr' });

    expect(res.status).toBe(404);
    // Rejected before the query: an unsupported locale has no page to fill.
    expect(getExerciseFacetRows).not.toHaveBeenCalled();
  });

  it('returns 200 for a supported language', async () => {
    getExerciseFacetRows.mockResolvedValue([
      facetRow('B1', 'job-interview'),
      facetRow('B1', 'code-review'),
    ]);

    const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });

    expect(res.status).toBe(200);
    // Proves the page actually reached its data path rather than short-circuiting.
    expect(getExerciseFacetRows).toHaveBeenCalledTimes(1);
  });

  it('returns 200 in English', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('A2', 'food')]);

    const res = await renderPage(EntryPage, { lang: 'en' }, { lang: 'en' });

    expect(res.status).toBe(200);
    expect(getExerciseFacetRows).toHaveBeenCalledTimes(1);
  });

  // THE reason this route exists: `Header.astro:38` links here from every page
  // in both locales. An outage must degrade to an explanation, never a 404 or a
  // 500 sitting in the site chrome.
  it('returns 200 when the fail-safe query degrades an outage to no rows', async () => {
    getExerciseFacetRows.mockResolvedValue([]);

    const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });

    expect(res.status).toBe(200);
    expect(getExerciseFacetRows).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for a ?nivel= value that is not a CEFR level', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'travel')]);

    const res = await renderPage(
      EntryPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles?nivel=b1-lowercase',
    );

    // A junk level falls back to the default level — never a 404, because the
    // page itself is real and the param is only a preference.
    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid ?nivel= level that has no exercises', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'travel')]);

    const res = await renderPage(
      EntryPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles?nivel=C2',
    );

    // C2 is real but empty. It is honoured, not swapped out, and it renders the
    // "nothing at this level" state at 200.
    expect(res.status).toBe(200);
  });
});

describe('ingles/[level]/[topic]/index.astro (listing)', () => {
  const pair = { lang: 'es', level: 'B1', topic: 'job-interview' };

  beforeEach(() => {
    getPublishedExercises.mockReset();
    getPublishedExercises.mockResolvedValue([]);
  });

  it('returns 404 for a level outside the taxonomy', async () => {
    const res = await renderPage(ListingPage, { ...pair, level: 'Z9' }, { lang: 'es' });

    expect(res.status).toBe(404);
    // Guarded BEFORE the query: a segment outside the closed vocabulary can
    // never match a row, so a round trip would only make the 404 slower.
    expect(getPublishedExercises).not.toHaveBeenCalled();
  });

  it('returns 404 for a topic outside the taxonomy', async () => {
    const res = await renderPage(
      ListingPage,
      { ...pair, topic: 'space-travel' },
      { lang: 'es' },
    );

    expect(res.status).toBe(404);
    expect(getPublishedExercises).not.toHaveBeenCalled();
  });

  it('returns 404 for an unsupported language', async () => {
    const res = await renderPage(ListingPage, { ...pair, lang: 'fr' });

    expect(res.status).toBe(404);
    expect(getPublishedExercises).not.toHaveBeenCalled();
  });

  it('returns 200 and queries the pair when both segments are valid', async () => {
    getPublishedExercises.mockResolvedValue([
      publishedExercise('greetings'),
      publishedExercise('small-talk'),
    ]);

    const res = await renderPage(ListingPage, pair, { lang: 'es' });

    expect(res.status).toBe(200);
    expect(getPublishedExercises).toHaveBeenCalledWith('B1', 'job-interview');
  });

  // The distinction this whole route hinges on: a combination that EXISTS but
  // holds nothing is a real page with an empty state. Only a combination that
  // cannot exist is a 404. A Supabase outage fail-safes to the same `[]` and
  // therefore lands here too, never on an error page.
  it('returns 200, not 404, for a valid pair with no published exercises', async () => {
    getPublishedExercises.mockResolvedValue([]);

    const res = await renderPage(ListingPage, { ...pair, topic: 'food' }, { lang: 'es' });

    expect(res.status).toBe(200);
    expect(getPublishedExercises).toHaveBeenCalledWith('B1', 'food');
  });

  it('returns 200 in English', async () => {
    getPublishedExercises.mockResolvedValue([publishedExercise('greetings')]);

    const res = await renderPage(ListingPage, { ...pair, lang: 'en' }, { lang: 'en' });

    expect(res.status).toBe(200);
  });
});

describe('ingles/[level]/[topic]/[slug].astro', () => {
  beforeEach(() => {
    getExerciseBySlug.mockReset();
    getExerciseBySlug.mockResolvedValue(null);
    getRelatedExercises.mockReset();
    getRelatedExercises.mockResolvedValue([]);
  });

  // Every 404 path short-circuits before the exercise exists, so there is no
  // level to relate anything to. A related query fired anyway would be a round
  // trip spent on a page nobody will see.
  it('never looks for related exercises on a 404 path', async () => {
    await render({ ...valid, level: 'Z9' }, { lang: 'es' });
    await render({ ...valid, topic: 'space-travel' }, { lang: 'es' });
    await render({ ...valid, lang: 'fr' });
    await render(valid, { lang: 'es' }); // valid taxonomy, no published row

    expect(getRelatedExercises).not.toHaveBeenCalled();
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
  //
  // CONSEQUENCE WORTH STATING: the related-exercises block lives on this same
  // 200 path, so NOTHING here proves it renders. Its data layer is covered in
  // src/lib/exercises.test.ts and its copy in src/lib/i18n.test.ts, but the
  // markup itself is verified by hand in a browser.
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
