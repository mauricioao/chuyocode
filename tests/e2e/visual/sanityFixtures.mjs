// Hand-written, synthetic Sanity dataset for the visual snapshot suite
// (tests/e2e/visual.spec.ts). Served by ./sanityFixtureServer.mjs, which
// evaluates the app's REAL GROQ queries against these documents with groq-js,
// so the home and news pages render through their normal code path.
//
// Nothing here is recorded from the live API: every title, date and image is
// made up. Edit freely, then regenerate the baselines
// (`pnpm test:visual --update-snapshots`) — see tests/e2e/README.md.

/**
 * Image asset documents. `swatch` drives the SVG the fixture server paints for
 * the asset (a two-stop gradient plus a caption), so each cover is
 * recognisable in a screenshot without shipping binary files.
 */
const ASSETS = [
  ['book-grammar', 800, 1200, ['#1d4ed8', '#60a5fa'], 'Grammar Basics'],
  ['book-stories', 800, 1200, ['#9d174d', '#f472b6'], 'Short Stories'],
  ['book-verbs', 800, 1200, ['#065f46', '#34d399'], 'Irregular Verbs'],
  ['book-phonics', 800, 1200, ['#92400e', '#fbbf24'], 'Phonics Fun'],
  ['book-reading', 800, 1200, ['#5b21b6', '#a78bfa'], 'Reading Club'],
  ['book-writing', 800, 1200, ['#134e4a', '#2dd4bf'], 'Writing Lab'],
  ['hero-grammar', 1920, 1080, ['#0f172a', '#2563eb'], 'Grammar Basics'],
  ['hero-stories', 1920, 1080, ['#3b0764', '#db2777'], 'Short Stories'],
  ['news-fair', 1200, 800, ['#7c2d12', '#fb923c'], 'Book Fair'],
  ['news-workshop', 1200, 800, ['#14532d', '#4ade80'], 'Workshop'],
  ['news-club', 1200, 800, ['#1e3a8a', '#38bdf8'], 'Reading Club'],
  ['news-awards', 1200, 800, ['#713f12', '#facc15'], 'Awards'],
  ['hero-fair', 1920, 1080, ['#431407', '#ea580c'], 'Book Fair'],
];

/** `image-<id>-<w>x<h>-png`: the asset id shape @sanity/image-url parses. */
export function assetId(key, width, height) {
  return `image-vf${key.replace(/-/g, '')}-${width}x${height}-png`;
}

const assetIdByKey = new Map(ASSETS.map(([key, w, h]) => [key, assetId(key, w, h)]));

/** An image field referencing a fixture asset. */
function image(key) {
  const ref = assetIdByKey.get(key);
  if (!ref) throw new Error(`Unknown fixture asset: ${key}`);
  return { _type: 'image', asset: { _type: 'reference', _ref: ref } };
}

/** A `{ es, en }` localized string. */
function loc(es, en) {
  return { es, en };
}

const BOOKS = [
  {
    _id: 'visual-book-grammar',
    _createdAt: '2026-01-06T10:00:00Z',
    title: loc('Gramática esencial', 'Essential Grammar'),
    slug: 'gramatica-esencial',
    author: 'Ana Torres',
    cover: 'book-grammar',
    heroBackground: 'hero-grammar',
    description: loc(
      'Una guía clara y práctica para dominar las estructuras básicas del inglés, con ejemplos cotidianos.',
      'A clear, practical guide to the core structures of English, with everyday examples.',
    ),
    tagline: loc('Empieza por lo esencial', 'Start with the essentials'),
    featured: true,
    themes: ['recomendados', 'gramatica'],
  },
  {
    _id: 'visual-book-stories',
    _createdAt: '2026-01-05T10:00:00Z',
    title: loc('Cuentos para leer en inglés', 'Stories to Read in English'),
    slug: 'cuentos-en-ingles',
    author: 'Luis Paredes',
    cover: 'book-stories',
    heroBackground: 'hero-stories',
    description: loc(
      'Doce cuentos cortos graduados por nivel para practicar la lectura sin diccionario.',
      'Twelve short stories graded by level to practise reading without a dictionary.',
    ),
    tagline: loc('Lectura graduada', 'Graded reading'),
    featured: true,
    themes: ['recomendados'],
  },
  {
    _id: 'visual-book-verbs',
    _createdAt: '2026-01-04T10:00:00Z',
    title: loc('Verbos irregulares', 'Irregular Verbs'),
    slug: 'verbos-irregulares',
    author: 'Marta Ríos',
    cover: 'book-verbs',
    description: loc('Tablas y ejercicios para memorizar los verbos irregulares.', 'Tables and drills for irregular verbs.'),
    themes: ['recomendados', 'gramatica'],
  },
  {
    _id: 'visual-book-phonics',
    _createdAt: '2026-01-03T10:00:00Z',
    title: loc('Fonética divertida', 'Fun Phonics'),
    slug: 'fonetica-divertida',
    author: 'Carla Vega',
    cover: 'book-phonics',
    description: loc('Sonidos del inglés con juegos y rimas.', 'English sounds through games and rhymes.'),
    themes: ['recomendados'],
  },
  {
    _id: 'visual-book-reading',
    _createdAt: '2026-01-02T10:00:00Z',
    title: loc('Club de lectura', 'Reading Club'),
    slug: 'club-de-lectura',
    author: 'Jorge Salas',
    cover: 'book-reading',
    description: loc('Lecturas guiadas para grupos pequeños.', 'Guided readings for small groups.'),
    themes: ['lectura'],
  },
  {
    _id: 'visual-book-writing',
    _createdAt: '2026-01-01T10:00:00Z',
    title: loc('Taller de escritura', 'Writing Lab'),
    slug: 'taller-de-escritura',
    author: 'Rosa Mendoza',
    cover: 'book-writing',
    description: loc('Del párrafo al ensayo, paso a paso.', 'From paragraph to essay, step by step.'),
    themes: ['lectura'],
  },
];

const NEWS = [
  {
    _id: 'visual-news-fair',
    publishedAt: '2026-03-14T15:00:00Z',
    title: loc('Feria del libro escolar 2026', 'School Book Fair 2026'),
    slug: 'feria-del-libro-2026',
    excerpt: loc(
      'Más de cuarenta títulos nuevos para todas las edades llegan a la feria de este año.',
      'More than forty new titles for every age arrive at this year’s fair.',
    ),
    body: loc('La feria abre sus puertas el próximo mes.', 'The fair opens its doors next month.'),
    image: 'news-fair',
    heroBackground: 'hero-fair',
    tagline: loc('Evento', 'Event'),
    featured: true,
    themes: ['lectura'],
  },
  {
    _id: 'visual-news-workshop',
    publishedAt: '2026-03-02T15:00:00Z',
    title: loc('Taller gratuito de pronunciación', 'Free Pronunciation Workshop'),
    slug: 'taller-de-pronunciacion',
    excerpt: loc(
      'Un taller práctico de dos horas para mejorar la pronunciación con ejercicios guiados.',
      'A two-hour hands-on workshop to improve pronunciation with guided drills.',
    ),
    body: loc('Inscripciones abiertas.', 'Registration is open.'),
    image: 'news-workshop',
  },
  {
    _id: 'visual-news-club',
    publishedAt: '2026-02-20T15:00:00Z',
    title: loc('Nace el club de lectura en inglés', 'The English Reading Club Is Born'),
    slug: 'club-de-lectura-en-ingles',
    excerpt: loc(
      'Cada viernes leeremos juntos un cuento corto y conversaremos sobre él.',
      'Every Friday we will read a short story together and talk about it.',
    ),
    body: loc('Te esperamos.', 'See you there.'),
    image: 'news-club',
  },
  {
    _id: 'visual-news-awards',
    publishedAt: '2026-02-01T15:00:00Z',
    title: loc('Premios a los mejores cuentos de alumnos', 'Awards for the Best Student Stories'),
    slug: 'premios-cuentos-alumnos',
    excerpt: loc(
      'Conoce a los ganadores del concurso de cuentos de este verano.',
      'Meet the winners of this summer’s short-story contest.',
    ),
    body: loc('Felicitaciones a todos los participantes.', 'Congratulations to every participant.'),
    image: 'news-awards',
  },
];

/**
 * Build the full dataset. `origin` is the fixture server's own origin, used
 * for each asset's `url` (the app rebuilds image URLs from the asset id with
 * the same origin via `SANITY_FIXTURE_API_HOST`, so both always agree).
 */
export function buildDataset(origin, projectId, dataset) {
  const assets = ASSETS.map(([key, width, height, swatch, caption]) => {
    const _id = assetId(key, width, height);
    const file = `${_id.replace(/^image-/, '').replace(/-png$/, '')}.png`;
    return {
      _id,
      _type: 'sanity.imageAsset',
      url: `${origin}/images/${projectId}/${dataset}/${file}`,
      metadata: { dimensions: { width, height } },
      fixtureSwatch: swatch,
      fixtureCaption: caption,
    };
  });

  const books = BOOKS.map((b) => ({
    _id: b._id,
    _type: 'book',
    _createdAt: b._createdAt,
    title: b.title,
    slug: { _type: 'slug', current: b.slug },
    author: b.author,
    cover: image(b.cover),
    ...(b.heroBackground ? { heroBackground: image(b.heroBackground) } : {}),
    description: b.description,
    ...(b.tagline ? { tagline: b.tagline } : {}),
    ...(b.featured ? { featured: true } : {}),
    themes: b.themes,
  }));

  const news = NEWS.map((n) => ({
    _id: n._id,
    _type: 'news',
    _createdAt: n.publishedAt,
    publishedAt: n.publishedAt,
    title: n.title,
    slug: { _type: 'slug', current: n.slug },
    excerpt: n.excerpt,
    body: n.body,
    image: image(n.image),
    ...(n.heroBackground ? { heroBackground: image(n.heroBackground) } : {}),
    ...(n.tagline ? { tagline: n.tagline } : {}),
    ...(n.featured ? { featured: true } : {}),
    ...(n.themes ? { themes: n.themes } : {}),
  }));

  return [...assets, ...books, ...news];
}

/** Titles the visual spec asserts on, to prove the page rendered fixture data. */
export const FIXTURE_MARKERS = {
  homeBookTitle: BOOKS[0].title.es,
  firstNewsTitle: NEWS[0].title.es,
};
