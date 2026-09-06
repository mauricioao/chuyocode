/**
 * Route tests for the whole English section — entry screen, listing, detail.
 *
 * The entry and listing pages mount NO island, so `AstroContainer` renders them
 * fully and their MARKUP is assertable, not merely their status code. That
 * matters here: this change moves the primary axis from `topic` to `focus`, and
 * a status code cannot tell you whether the grid is listing language points or
 * still listing settings. The detail page mounts `ExerciseIsland`, so only its
 * 404 paths are assertable (`src/pages/[lang]/libros/libros.test.ts:47`).
 *
 * What is still NOT provable here is everything visual: which chip looks active,
 * whether a dimmed chip reads as unavailable, contrast, grid layout. Several
 * bugs in this repo were invisible to vitest, `astro check` AND `astro build`,
 * so those properties are verified by hand — a CSS-class assertion would only
 * pin the implementation, never the appearance.
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
import ListingPage from './[level]/[focus]/index.astro';
import DetailPage from './[level]/[focus]/[slug].astro';

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
const facetRow = (level: string, focus: string) => ({ level, focus });

/**
 * The shape `getPublishedExercises` hands the listing page. `topic` defaults to
 * a real context; pass `null` for the pure-grammar-drill case.
 */
const publishedExercise = (slug: string, topic: string | null = 'job-interview') => ({
  id: `id-${slug}`,
  slug,
  skill: 'reading',
  level: 'B1',
  focus: 'phrasal-verbs',
  topic,
  hasAudio: false,
  payload: {
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [
      { id: 's1', label: `Prompt for ${slug}`, input: 'choice', pool: 'opts', answer: ['b'] },
    ],
  },
});

const valid = { lang: 'es', level: 'B1', focus: 'phrasal-verbs', slug: 'greetings' };

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
      facetRow('B1', 'phrasal-verbs'),
      facetRow('B1', 'present-perfect'),
    ]);

    const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });

    expect(res.status).toBe(200);
    // Proves the page actually reached its data path rather than short-circuiting.
    expect(getExerciseFacetRows).toHaveBeenCalledTimes(1);
  });

  // THE point of this change. The grid under a level used to list SETTINGS
  // ("Travel", "Food"); it now lists LANGUAGE POINTS, which is what someone
  // arriving here is actually choosing between.
  it('lists the LANGUAGE POINTS published at the active level', async () => {
    getExerciseFacetRows.mockResolvedValue([
      facetRow('B1', 'phrasal-verbs'),
      facetRow('B1', 'present-perfect'),
    ]);

    const res = await renderPage(
      EntryPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles?nivel=B1',
    );
    const html = await res.text();

    expect(html).toContain('Present perfect');
    expect(html).toContain('Phrasal verbs');
    expect(html).toContain('Puntos gramaticales');
  });

  it('links each card to the (level, focus) pair, not to a topic', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('A2', 'quantifiers')]);

    const res = await renderPage(
      EntryPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles?nivel=A2',
    );
    const html = await res.text();

    expect(html).toContain('href="/es/ingles/A2/quantifiers"');
  });

  it('keeps the language-point labels English under /es', async () => {
    // `focus` is exercise DATA, not chrome: it names the grammar the learner
    // came here to acquire, so translating it removes the one term they need
    // to recognize in English (docs/exercise-model.md, "Authoring rules").
    getExerciseFacetRows.mockResolvedValue([facetRow('A1', 'present-simple')]);

    const res = await renderPage(
      EntryPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles?nivel=A1',
    );
    const html = await res.text();

    expect(html).toContain('Present simple');
    expect(html).not.toContain('Presente simple');
  });

  it('returns 200 in English', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('A2', 'quantifiers')]);

    const res = await renderPage(EntryPage, { lang: 'en' }, { lang: 'en' });
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Language points');
    expect(getExerciseFacetRows).toHaveBeenCalledTimes(1);
  });

  it('drops a focus that left the taxonomy instead of offering a dead card', async () => {
    // Includes the sentinel the migration parks unclassified rows under.
    getExerciseFacetRows.mockResolvedValue([
      facetRow('B1', 'phrasal-verbs'),
      facetRow('B1', 'unassigned'),
      facetRow('B1', 'subjunctive-mood'),
    ]);

    const res = await renderPage(
      EntryPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles?nivel=B1',
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Phrasal verbs');
    expect(html).not.toContain('unassigned');
    expect(html).not.toContain('subjunctive-mood');
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

  it('headlines the screen with the section, not with its audience', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('A1', 'present-simple')]);

    const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
    const html = await res.text();

    expect(html).toContain('Ejercicios de inglés');
    expect(html).toContain('Elige un nivel y tema para practicar en el día a día');
    // The old copy must be gone from the RENDERED page, not merely unused: the
    // headline doubles as the `<title>`, so a stale value survives in <head>
    // long after the <h1> looks right.
    expect(html).not.toContain('Inglés para programadores');
    expect(html).not.toContain('pensados para el día a día de un desarrollador');
  });

  it('headlines the screen in English too', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('A1', 'present-simple')]);

    const res = await renderPage(EntryPage, { lang: 'en' }, { lang: 'en' });
    const html = await res.text();

    expect(html).toContain('English exercises');
    expect(html).not.toContain('English for developers');
  });

  // The magnifier filter over the language-point grid. It filters the cards
  // ALREADY rendered for the active level — it never queries the server and it
  // does not touch `?nivel=`, so the deep link keeps meaning exactly what it
  // meant before.
  describe('language-point filter', () => {
    it('gives the filter input an accessible name', async () => {
      getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'phrasal-verbs')]);

      const res = await renderPage(
        EntryPage,
        { lang: 'es' },
        { lang: 'es' },
        'https://chuyocode.test/es/ingles?nivel=B1',
      );
      const html = await res.text();

      // An icon-only magnifier with a bare <input> is a control a screen reader
      // announces as "edit text" and nothing else. The label is the whole
      // affordance for anyone not looking at the lens.
      expect(html).toContain('aria-label="Buscar puntos gramaticales"');
    });

    it('gives every card a haystack holding BOTH the label and the slug', async () => {
      getExerciseFacetRows.mockResolvedValue([
        facetRow('B1', 'phrasal-verbs'),
        facetRow('B1', 'past-perfect'),
      ]);

      const res = await renderPage(
        EntryPage,
        { lang: 'es' },
        { lang: 'es' },
        'https://chuyocode.test/es/ingles?nivel=B1',
      );
      const html = await res.text();

      // The label alone is not enough: typing "past" must reach `past-simple`
      // AND `past-perfect`, and the slug is the only string in which the shared
      // stem is written the same way in both.
      expect(html).toContain('data-search="Phrasal verbs phrasal-verbs"');
      expect(html).toContain('data-search="Past perfect past-perfect"');
      expect(html).toContain('data-focus-item');
    });

    it('ships the empty-results element the filter reveals, hidden', async () => {
      getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'phrasal-verbs')]);

      const res = await renderPage(
        EntryPage,
        { lang: 'es' },
        { lang: 'es' },
        'https://chuyocode.test/es/ingles?nivel=B1',
      );
      const html = await res.text();

      // The id is the contract between the page and `SearchFilter`'s script; a
      // typo here degrades to "the grid empties and nothing explains why".
      expect(html).toMatch(/id="focuses-no-results"[^>]*hidden/);
      expect(html).toContain('No hay puntos gramaticales que coincidan con la búsqueda.');
      // Localized, not hardcoded — same key, other locale.
      const enRes = await renderPage(
        EntryPage,
        { lang: 'en' },
        { lang: 'en' },
        'https://chuyocode.test/en/ingles?nivel=B1',
      );
      expect(await enRes.text()).toContain('No language points match that search.');
    });

    it('renders no filter when there is nothing at this level to filter', async () => {
      // A search box over zero cards is a control whose every keystroke is a
      // no-op. The level HAS to stay honoured (it is a real, empty level), so
      // the filter is what goes away, not the empty state.
      getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'phrasal-verbs')]);

      const res = await renderPage(
        EntryPage,
        { lang: 'es' },
        { lang: 'es' },
        'https://chuyocode.test/es/ingles?nivel=C2',
      );
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).not.toContain('chu-search');
      expect(html).not.toContain('id="focuses-no-results"');
      expect(html).toContain('Todavía no hay ejercicios para este nivel.');
    });

    it('keeps the filter free of any island or framework runtime', async () => {
      // `SearchFilter` is deliberately vanilla. A `client:` directive here would
      // trade a 40-line script for a hydrated component on a page whose entire
      // design premise is that it ships no JavaScript framework.
      getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'phrasal-verbs')]);

      const res = await renderPage(
        EntryPage,
        { lang: 'es' },
        { lang: 'es' },
        'https://chuyocode.test/es/ingles?nivel=B1',
      );
      const html = await res.text();

      expect(html).not.toContain('astro-island');
    });
  });

  it('returns 200 for a ?nivel= value that is not a CEFR level', async () => {
    getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'past-simple')]);

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
    getExerciseFacetRows.mockResolvedValue([facetRow('B1', 'past-simple')]);

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

describe('ingles/[level]/[focus]/index.astro (listing)', () => {
  const pair = { lang: 'es', level: 'B1', focus: 'phrasal-verbs' };

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

  it('returns 404 for a focus outside the taxonomy', async () => {
    const res = await renderPage(
      ListingPage,
      { ...pair, focus: 'subjunctive-mood' },
      { lang: 'es' },
    );

    expect(res.status).toBe(404);
    expect(getPublishedExercises).not.toHaveBeenCalled();
  });

  it('returns 404 for the migration sentinel', async () => {
    const res = await renderPage(
      ListingPage,
      { ...pair, focus: 'unassigned' },
      { lang: 'es' },
    );

    expect(res.status).toBe(404);
    expect(getPublishedExercises).not.toHaveBeenCalled();
  });

  it('returns 404 for an OLD topic slug in the focus position', async () => {
    // Links shared before the axis moved must fail loudly. `travel` is still a
    // real topic, so nothing but the position tells these two vocabularies
    // apart — which is exactly why the guard is `isFocus` and not "is a slug".
    const res = await renderPage(
      ListingPage,
      { ...pair, focus: 'travel' },
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
    expect(getPublishedExercises).toHaveBeenCalledWith('B1', 'phrasal-verbs');
  });

  it('headlines the page with the LANGUAGE POINT, in English', async () => {
    getPublishedExercises.mockResolvedValue([publishedExercise('greetings')]);

    const res = await renderPage(ListingPage, pair, { lang: 'es' });
    const html = await res.text();

    expect(html).toContain('Phrasal verbs');
  });

  it('links each card into the (level, focus) deep link', async () => {
    getPublishedExercises.mockResolvedValue([publishedExercise('greetings')]);

    const res = await renderPage(ListingPage, pair, { lang: 'es' });
    const html = await res.text();

    expect(html).toContain('href="/es/ingles/B1/phrasal-verbs/greetings"');
  });

  it('shows the secondary CONTEXT as a badge when the exercise has one', async () => {
    getPublishedExercises.mockResolvedValue([
      publishedExercise('greetings', 'code-review'),
    ]);

    const res = await renderPage(ListingPage, pair, { lang: 'es' });
    const html = await res.text();

    // English in every locale, like every other taxonomy label.
    expect(html).toContain('Code review');
  });

  it('renders NO context badge for an exercise whose topic is null', async () => {
    // A pure grammar drill has no natural setting. The failure this guards is
    // silent: an unconditional badge would render a bordered pill with nothing
    // in it, which looks deliberate rather than broken — the exact bug this
    // component already shipped once for an unknown skill.
    getPublishedExercises.mockResolvedValue([publishedExercise('drill', null)]);

    const res = await renderPage(ListingPage, pair, { lang: 'es' });
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toContain('Job interview');
    expect(html).not.toContain('undefined');
    // No empty bordered pill anywhere on the page.
    expect(html).not.toMatch(/<span[^>]*inline-flex[^>]*>\s*<\/span>/);
  });

  it('lists two exercises with the same focus but different contexts', async () => {
    // The whole reason `topic` was kept rather than dropped: one language point
    // practised in several settings, and one with no setting at all.
    getPublishedExercises.mockResolvedValue([
      publishedExercise('at-the-airport', 'travel'),
      publishedExercise('review-comments', 'code-review'),
      publishedExercise('plain-drill', null),
    ]);

    const res = await renderPage(ListingPage, pair, { lang: 'es' });
    const html = await res.text();

    expect(html).toContain('Travel');
    expect(html).toContain('Code review');
    expect(html).not.toMatch(/<span[^>]*inline-flex[^>]*>\s*<\/span>/);
  });

  // The distinction this whole route hinges on: a combination that EXISTS but
  // holds nothing is a real page with an empty state. Only a combination that
  // cannot exist is a 404. A Supabase outage fail-safes to the same `[]` and
  // therefore lands here too, never on an error page.
  it('returns 200, not 404, for a valid pair with no published exercises', async () => {
    getPublishedExercises.mockResolvedValue([]);

    const res = await renderPage(
      ListingPage,
      { ...pair, focus: 'second-conditional' },
      { lang: 'es' },
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(getPublishedExercises).toHaveBeenCalledWith('B1', 'second-conditional');
    // The empty state, and a way out of it — an empty screen with no exit is a
    // dead end.
    expect(html).toContain('Todavía no hay ejercicios');
    expect(html).toContain('href="/es/ingles?nivel=B1"');
  });

  it('returns 200 in English', async () => {
    getPublishedExercises.mockResolvedValue([publishedExercise('greetings')]);

    const res = await renderPage(ListingPage, { ...pair, lang: 'en' }, { lang: 'en' });

    expect(res.status).toBe(200);
  });
});

describe('ingles/[level]/[focus]/[slug].astro', () => {
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
    await render({ ...valid, focus: 'subjunctive-mood' }, { lang: 'es' });
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

  it('returns 404 for an invalid focus', async () => {
    const res = await render({ ...valid, focus: 'subjunctive-mood' }, { lang: 'es' });

    expect(res.status).toBe(404);
    expect(getExerciseBySlug).not.toHaveBeenCalled();
  });

  it('returns 404 for an OLD topic slug in the focus position', async () => {
    const res = await render({ ...valid, focus: 'job-interview' }, { lang: 'es' });

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
    // The taxonomy was valid, so the query DID run before the 404, keyed on the
    // language point rather than on a setting.
    expect(getExerciseBySlug).toHaveBeenCalledWith('B1', 'phrasal-verbs', 'greetings');
  });

  it('returns 404 when the data layer fail-safes a Supabase outage to null', async () => {
    getExerciseBySlug.mockResolvedValue(null);

    const res = await render({ ...valid, lang: 'en' }, { lang: 'en' });

    expect(res.status).toBe(404);
  });

  // Skipped for the same reason as src/pages/[lang]/libros/libros.test.ts:47 —
  // AstroContainer cannot render the React islands this page mounts.
  //
  // CONSEQUENCE WORTH STATING: the related-exercises block and the header badge
  // row both live on this same 200 path, so NOTHING here proves that the focus
  // badge renders, that the topic badge is omitted when null, or that the
  // related cards receive their props. The card itself is covered in
  // `src/components/ui/ExerciseCard.test.ts` and the data layer in
  // `src/lib/exercises.test.ts`; this page's own markup is verified by hand.
  it.skip('renders the exercise island for a published slug', async () => {
    getExerciseBySlug.mockResolvedValue({
      id: 'e1',
      slug: 'greetings',
      skill: 'reading',
      level: 'B1',
      focus: 'phrasal-verbs',
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
