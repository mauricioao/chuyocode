/**
 * Route tests for the whole English section — the hub (entry screen) plus
 * the three retired curated-exercise routes (`propuestos`, `[level]/[focus]`,
 * `[level]/[focus]/[slug]`), which are now permanent redirects to the
 * community catalog (owner spec 2026-10-07 — see `propuestos/index.astro`'s
 * own header). Curated exercises folded into "Actividades de la comunidad";
 * that window's own markup is tested in `actividades/_index.test.ts`.
 *
 * The hub mounts no PAGE-level island of its own (beyond `DeskPlayerWidget`),
 * so `createContainer()` (which registers the React renderer `Header`'s own
 * `UserMenu` island needs — Login step 1b) renders it fully and its MARKUP
 * is assertable, not merely its status code.
 *
 * What is still NOT provable here is everything visual: contrast, grid
 * layout, which chip looks active. Several bugs in this repo were invisible
 * to vitest, `astro check` AND `astro build`, so those properties are
 * verified by hand — a CSS-class assertion would only pin the
 * implementation, never the appearance.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

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

// The hub's own reads: one count plus the ONE "top hearted" pool it shares
// between `pickDailyActivity` and `topActivityOfWeek`. `getActivityCount`
// and `getPublishedActivities` are real functions the hub (and, for the
// desk-helper hub-only-scope test, the community list window too) imports
// from the SAME module — mocked here so no network happens.
const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
  ACTIVITIES_PAGE_SIZE: 20,
}));

// `ActivityCard` (rendered in the "Para ti hoy" strip) resolves a thumbnail
// URL through this module — every fixture below uses `thumbnailPath: null`
// so it is never actually called, but the import itself must not reach for
// a real Supabase client.
vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}`,
}));

import EntryPage from './index.astro';
import CommunityListPage from './actividades/index.astro';
import PropuestosPage from './propuestos/index.astro';
import ListingPage from './[level]/[focus]/index.astro';
import DetailPage from './[level]/[focus]/[slug].astro';
import { DESK_HELPER_TIPS } from '@/content/deskHelperTips';
import { CHARACTERS } from '@/content/characters';

type PageComponent = Parameters<
  Awaited<ReturnType<typeof createContainer>>['renderToResponse']
>[0];

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
  const container = await createContainer();
  return container.renderToResponse(Component, {
    // `App.Locals.user` is required, never optional, so the default has to be
    // stated: these renders are anonymous visitors. A caller may override it.
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

/** A published activity card row, shaped like `getPublishedActivities` returns it. */
function activityFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'act-1',
    title: 'Mi actividad',
    level: 'B1',
    blockCount: 3,
    publishedAt: '2026-09-29T00:00:00Z',
    thumbnailPath: null,
    heartCount: 10,
    viewTotal: 5,
    viewedByViewer: false,
    ...overrides,
  };
}

describe('ingles/index.astro (hub)', () => {
  // A minimal signed-in-visitor fixture — only the two fields `nameFrom`
  // (`@lib/profile`) actually reads.
  function userFixture(displayName: string): Record<string, unknown> {
    return { id: 'u1', email: 'visitor@example.com', user_metadata: { display_name: displayName } };
  }

  beforeEach(() => {
    getActivityCount.mockReset();
    getPublishedActivities.mockReset();
    getActivityCount.mockResolvedValue(null);
    getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
  });

  it('returns 404 for an unsupported language', async () => {
    const res = await renderPage(EntryPage, { lang: 'fr' });

    expect(res.status).toBe(404);
  });

  it('returns 200 for a supported language', async () => {
    const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });

    expect(res.status).toBe(200);
  });

  it('ships exactly one framework island on its own markup — the "Frase del día" player ("desktop" redesign PART 4; Header’s UserMenu island is a separate element outside <main>)', async () => {
    const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
    const html = await res.text();

    const main = html.slice(html.indexOf('id="content"'), html.indexOf('</main>'));
    expect(main).not.toEqual('');
    // `DeskPlayerWidget` is this page's one deliberate React island (see its
    // own header for why) — every other widget (clock/calendar/weather)
    // stays plain vanilla-JS markup, so there is exactly one island, not zero
    // and not several.
    expect(main.match(/astro-island/g)?.length).toBeGreaterThan(0);
    expect(main).toContain('desk-player');
  });

  describe('greeting', () => {
    it('greets the signed-in visitor by their first name, in Spanish', async () => {
      const res = await renderPage(
        EntryPage,
        { lang: 'es' },
        { lang: 'es', user: userFixture('Ana Pérez') },
      );
      const html = await res.text();

      expect(html).toContain('Hola, Ana.');
      expect(html).toContain('¿Qué practicamos hoy?');
      expect(html).toContain('Abre una carpeta para elegir un ejercicio');
    });

    it('falls back to a bare greeting when there is no session', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es', user: null });
      const html = await res.text();

      expect(html).toContain('Hola.');
      expect(html).not.toContain('Hola, ');
    });

    it('greets in English too', async () => {
      const res = await renderPage(
        EntryPage,
        { lang: 'en' },
        { lang: 'en', user: userFixture('Ana Smith') },
      );
      const html = await res.text();

      expect(html).toContain('Hi, Ana.');
      expect(html).toContain('What shall we practise today?');
    });
  });

  describe('folders', () => {
    it('links the community-activities folder, with its live count, and no longer the removed curated-exercises folder', async () => {
      getActivityCount.mockResolvedValue(34);

      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).toContain('href="/es/ingles/actividades"');
      expect(html).toContain('Actividades de la comunidad');
      expect(html).toContain('34 actividades');
      // "Ejercicios propuestos" folded into the community folder above
      // (owner spec 2026-10-07) — its own route/folder are gone.
      expect(html).not.toContain('href="/es/ingles/propuestos"');
      expect(html).not.toContain('Ejercicios propuestos');
    });

    it('shows the singular noun for a count of exactly one', async () => {
      getActivityCount.mockResolvedValue(1);

      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).toContain('1 actividad');
      expect(html).not.toContain('1 actividades');
    });

    it('degrades to no number (never "0 …") when a count query fails', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).not.toMatch(/\d+\s+actividades?/);
    });

    it('links the "Crear actividad" folder to the creator start screen', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).toContain('href="/es/crear"');
      expect(html).toContain('Crear actividad');
    });

    describe('"Para ti hoy"', () => {
      // The page picks with the real clock (`new Date()`) — pin it so the
      // fixtures below stay deterministic.
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('previews the daily pick — its thumbnail peeking out, and its title as the meta line', async () => {
        getPublishedActivities.mockResolvedValue({
          activities: [
            activityFixture({ id: 'act-1', title: 'Daily one', thumbnailPath: 'covers/a.webp' }),
          ],
          total: 1,
        });

        const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
        const html = await res.text();

        expect(html).toContain('href="/es/ingles/actividades/act-1"');
        expect(html).toContain('Daily one');
        expect(html).toContain('https://public.example/covers/a.webp');
        expect(html).toContain('Para ti hoy');
      });

      it('falls back to a plain folder (no preview) linking to the community feed when there is no daily pick', async () => {
        getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });

        const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
        const html = await res.text();

        expect(html).toContain('Para ti hoy');
        // The folder link falls back to the community feed itself — find the
        // anchor tag that WRAPS this label (its own `<a ...>` start, not an
        // arbitrary slice of preceding markup, which can vary in length with
        // dev-mode source-map attributes).
        const labelIndex = html.indexOf('Para ti hoy');
        const anchorStart = html.lastIndexOf('<a ', labelIndex);
        const folder = html.slice(anchorStart, html.indexOf('</a>', labelIndex));
        expect(folder).toContain('href="/es/ingles/actividades"');
      });
    });
  });

  describe('levels dock', () => {
    it('renders all six levels, each linking to the community catalog with ?nivel= and an accessible "code, label" name', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
        expect(html).toContain(`href="/es/ingles/actividades?nivel=${level}"`);
      }
      expect(html).toContain('aria-label="A1, Principiante"');
      expect(html).toContain('aria-label="A2, Básico"');
      expect(html).toContain('aria-label="B1, Intermedio"');
      expect(html).toContain('aria-label="B2, Intermedio alto"');
      expect(html).toContain('aria-label="C1, Avanzado"');
      expect(html).toContain('aria-label="C2, Dominio"');
    });

    it('fills progressively more bars per level, coloured by CEFR band', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      function tileFor(level: string): string {
        const start = html.indexOf(`aria-label="${level},`);
        return html.slice(start, html.indexOf('</a>', start));
      }

      expect(tileFor('A1').match(/bg-pop-green/g)).toHaveLength(1);
      expect(tileFor('A2').match(/bg-pop-green/g)).toHaveLength(2);
      expect(tileFor('B1').match(/bg-pop-sky/g)).toHaveLength(3);
      expect(tileFor('B2').match(/bg-pop-sky/g)).toHaveLength(4);
      expect(tileFor('C1').match(/bg-pop-violet/g)).toHaveLength(5);
      expect(tileFor('C2').match(/bg-pop-violet/g)).toHaveLength(6);
    });
  });

  describe('desk helper ("desktop" redesign PART 5, PART 7: 100 tips, random pick)', () => {
    beforeEach(() => {
      // Pins the SSR random pick (`pickRandomTipIndex`) to index 0 —
      // PART 7 replaced the old deterministic "today's tip" with a genuinely
      // random one per render, so a test needs the global source stubbed
      // to assert against a known tip.
      vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function pickedTip() {
      return DESK_HELPER_TIPS[0];
    }

    it('renders the landmark and the character image with a decorative (empty) alt', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).toContain('aria-label="Ayuda"');
      const tip = pickedTip();
      expect(html).toContain(`/images/characters/${tip.character}-v2-128.webp`);
      expect(html).toMatch(/<img[^>]+data-desk-helper-img[^>]+alt=""/);
    });

    it('renders the server-picked tip bubble, in Spanish, naming the speaking character, keyed by its id', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      const tip = pickedTip();
      expect(html).toContain(CHARACTERS[tip.character].alt.es);
      expect(html).toContain(tip.es);
      expect(html).toContain('aria-label="Ayuda de');
      expect(html).toContain(`data-tip-id="${tip.id}"`);
      expect(html).toContain('data-lang="es"');
      // Never embeds the full 100-tip list in the page itself (PART 7's own
      // size goal) — only ONE tip's worth of markup ships server-side.
      expect(html).not.toContain('desk-helper-data');
    });

    it('renders the same tip in English, translating only the surrounding chrome', async () => {
      const res = await renderPage(EntryPage, { lang: 'en' }, { lang: 'en' });
      const html = await res.text();

      const tip = pickedTip();
      expect(html).toContain(tip.en);
      expect(html).toContain('Another tip');
      expect(html).toContain('aria-label="Close help"');
      expect(html).toContain('data-lang="en"');
    });

    it('gives "Otro tip" and the close button accessible names', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).toContain('id="desk-helper-next"');
      expect(html).toContain('Otro tip');
      expect(html).toContain('aria-label="Cerrar ayuda"');
    });

    it('starts open on the server render, so a no-JS visitor still sees the tip', async () => {
      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).toMatch(/id="desk-helper-avatar"[^>]+aria-expanded="true"/);
    });

    // Robustness fix (owner report): a direct visit to a window route used to
    // show no helper at all — only the hub's own frontmatter rendered it.
    // `DeskHost.astro` (shared by the hub and every window route's host
    // shell) now renders it everywhere a signed-in visitor sees the desk.
    it('renders on the community activities window host shell too, not hub-only anymore', async () => {
      const res = await renderPage(
        CommunityListPage,
        { lang: 'es' },
        { lang: 'es', user: { id: 'u1', email: 'visitor@example.com', user_metadata: {} } },
      );
      const html = await res.text();

      expect(html).toContain('id="desk-helper"');
    });
  });

  describe('hidden-features guard', () => {
    it('never links to the hidden Courses catalog or the adventure prototype', async () => {
      getActivityCount.mockResolvedValue(34);

      const res = await renderPage(EntryPage, { lang: 'es' }, { lang: 'es' });
      const html = await res.text();

      expect(html).not.toMatch(/(?<!admin)\/cursos(?!\w)/);
      expect(html).not.toContain('/aventura');
    });
  });
});


/**
 * These three routes used to serve the curated-exercises picker/listing/
 * detail screens. Owner spec 2026-10-07 ("ya no tendremos ejercicios
 * propuestos separados de actividades de la comunidad") folded that whole
 * section into the community catalog; each one is now a permanent (301)
 * redirect there, carrying over `?nivel=` when the old `level` segment/
 * param is a real CEFR level. See each page's own header for why `focus`/
 * `slug` have nothing to carry over.
 */
describe('ingles/propuestos/index.astro (redirect)', () => {
  it('returns 404 for an unsupported language', async () => {
    const res = await renderPage(PropuestosPage, { lang: 'fr' });
    expect(res.status).toBe(404);
  });

  it('redirects permanently to the community catalog, unfiltered, when there is no nivel', async () => {
    const res = await renderPage(PropuestosPage, { lang: 'es' }, { lang: 'es' });

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/es/ingles/actividades');
  });

  it('carries over a valid nivel', async () => {
    const res = await renderPage(
      PropuestosPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles/propuestos?nivel=B1',
    );

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/es/ingles/actividades?nivel=B1');
  });

  it('drops an invalid nivel rather than carrying over garbage', async () => {
    const res = await renderPage(
      PropuestosPage,
      { lang: 'es' },
      { lang: 'es' },
      'https://chuyocode.test/es/ingles/propuestos?nivel=zz',
    );

    expect(res.headers.get('location')).toBe('/es/ingles/actividades');
  });

  it('redirects under English too, with its own lang prefix', async () => {
    const res = await renderPage(
      PropuestosPage,
      { lang: 'en' },
      { lang: 'en' },
      'https://chuyocode.test/en/ingles/propuestos?nivel=A2',
    );

    expect(res.headers.get('location')).toBe('/en/ingles/actividades?nivel=A2');
  });
});

describe('ingles/[level]/[focus]/index.astro (redirect)', () => {
  it('returns 404 for an unsupported language', async () => {
    const res = await renderPage(ListingPage, { lang: 'fr', level: 'B1', focus: 'phrasal-verbs' });
    expect(res.status).toBe(404);
  });

  it('redirects to the community catalog with the level, dropping the focus segment', async () => {
    const res = await renderPage(
      ListingPage,
      { lang: 'es', level: 'B1', focus: 'phrasal-verbs' },
      { lang: 'es' },
    );

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/es/ingles/actividades?nivel=B1');
  });

  it('redirects to the unfiltered catalog for a level outside the taxonomy', async () => {
    const res = await renderPage(
      ListingPage,
      { lang: 'es', level: 'zz', focus: 'phrasal-verbs' },
      { lang: 'es' },
    );

    expect(res.headers.get('location')).toBe('/es/ingles/actividades');
  });
});

describe('ingles/[level]/[focus]/[slug].astro (redirect)', () => {
  it('returns 404 for an unsupported language', async () => {
    const res = await renderPage(DetailPage, {
      lang: 'fr',
      level: 'B1',
      focus: 'phrasal-verbs',
      slug: 'greetings',
    });
    expect(res.status).toBe(404);
  });

  it('redirects to the community catalog with the level, dropping focus and slug', async () => {
    const res = await renderPage(
      DetailPage,
      { lang: 'es', level: 'A1', focus: 'present-simple', slug: 'greetings' },
      { lang: 'es' },
    );

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/es/ingles/actividades?nivel=A1');
  });

  it('redirects to the unfiltered catalog for a level outside the taxonomy', async () => {
    const res = await renderPage(
      DetailPage,
      { lang: 'es', level: 'zz', focus: 'present-simple', slug: 'greetings' },
      { lang: 'es' },
    );

    expect(res.headers.get('location')).toBe('/es/ingles/actividades');
  });
});
