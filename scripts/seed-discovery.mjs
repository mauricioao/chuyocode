/**
 * Seed script for frontend-v3 discovery home (sanity dataset is empty).
 * Creates a neutral, mixed set of books + news with cover images uploaded to
 * Sanity (downloaded from picsum.photos), several flagged featured:true with a
 * spread of themeTag values so every home section lights up.
 *
 * Also seeds `heroBackground` (1920x1080, a DIFFERENT picsum seed than the
 * cover) so the HeroCarousel backdrop and its cover fallback are both
 * demonstrable.
 *
 * NOT seeded: `contentLogo`. It must be a transparent PNG title treatment and
 * picsum only serves opaque JPEGs, so there is no way to fake it here. Upload
 * it manually per document in Sanity Studio ("Logo del contenido") to see the
 * hero logo render above the title.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-discovery.mjs
 * Requires SANITY_WRITE_TOKEN in .env (Editor token, never committed).
 */
import { createClient } from '@sanity/client';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_WRITE_TOKEN;

if (!token) {
  console.error('Missing SANITY_WRITE_TOKEN in .env (Editor token).');
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  useCdn: false,
  token,
});

// Download a deterministic picsum image and upload it as a Sanity image asset.
async function uploadImageAsset(seed, width, height, label) {
  const url = `https://picsum.photos/seed/${seed}/${width}/${height}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const asset = await client.assets.upload('image', buf, {
    filename: `${seed}-${label}.jpg`,
    contentType: 'image/jpeg',
  });
  return { _type: 'image', asset: { _type: 'reference', _ref: asset._id } };
}

// `themes` is a multi-select array now. Some docs carry a RESERVED theme
// (mas-vistos / recomendados) IN ADDITION to a topic theme, to exercise the
// multi-theme fan-out and light up the reserved home rows.
const books = [
  { slug: 'diseno-que-ensena', es: 'Diseño que enseña', en: 'Design That Teaches', authorEs: 'Chuyo', authorEn: 'Chuyo', themes: ['mas-vistos', 'frontend'], featured: true, taglineEs: 'Interfaces claras, sin ruido.', taglineEn: 'Clear interfaces, no noise.', seed: 'design-book', w: 600, h: 800 },
  { slug: 'habitos-que-suman', es: 'Hábitos que suman', en: 'Habits That Add Up', authorEs: 'Chuyo', authorEn: 'Chuyo', themes: ['recomendados', 'career'], featured: true, taglineEs: 'Pequeños pasos, grandes cambios.', taglineEn: 'Small steps, big change.', seed: 'habits-book', w: 600, h: 800 },
  { slug: 'negocios-sin-humo', es: 'Negocios sin humo', en: 'Business, No Fluff', authorEs: 'Chuyo', authorEn: 'Chuyo', themes: ['mas-vistos', 'recomendados', 'backend'], featured: true, taglineEs: 'Lo esencial para emprender.', taglineEn: 'The essentials to start.', seed: 'business-book', w: 600, h: 800 },
  { slug: 'escribir-mejor', es: 'Escribir mejor', en: 'Write Better', authorEs: 'Chuyo', authorEn: 'Chuyo', themes: ['career'], featured: false, taglineEs: 'Claridad en cada frase.', taglineEn: 'Clarity in every line.', seed: 'writing-book', w: 600, h: 800 },
  { slug: 'pensar-en-sistemas', es: 'Pensar en sistemas', en: 'Thinking in Systems', authorEs: 'Chuyo', authorEn: 'Chuyo', themes: ['recomendados', 'architecture'], featured: false, taglineEs: 'El todo por encima de las partes.', taglineEn: 'The whole above the parts.', seed: 'systems-book', w: 600, h: 800 },
  { slug: 'aprender-a-aprender', es: 'Aprender a aprender', en: 'Learn to Learn', authorEs: 'Chuyo', authorEn: 'Chuyo', themes: ['mas-vistos', 'testing'], featured: false, taglineEs: 'Método antes que memoria.', taglineEn: 'Method over memory.', seed: 'learn-book', w: 600, h: 800 },
];

const news = [
  { slug: 'bienvenidos-chuyocode', es: 'Bienvenidos a ChuyoCode', en: 'Welcome to ChuyoCode', excerptEs: 'Un nuevo espacio para aprender haciendo.', excerptEn: 'A new space to learn by doing.', themes: ['career'], featured: false, seed: 'welcome-news', w: 1280, h: 720 },
  { slug: 'guia-rapida-portafolio', es: 'Guía rápida para tu portafolio', en: 'Quick Guide to Your Portfolio', excerptEs: 'Qué mostrar y qué dejar afuera.', excerptEn: 'What to show and what to leave out.', themes: ['mas-vistos', 'frontend'], featured: false, seed: 'portfolio-news', w: 1280, h: 720 },
  { slug: 'productividad-sin-burnout', es: 'Productividad sin burnout', en: 'Productivity Without Burnout', excerptEs: 'Trabajar mejor, no más horas.', excerptEn: 'Work better, not longer.', themes: ['career'], featured: false, seed: 'productivity-news', w: 1280, h: 720 },
  { slug: 'ideas-que-se-comparten', es: 'Ideas que se comparten', en: 'Ideas Worth Sharing', excerptEs: 'Por qué enseñar te hace mejor.', excerptEn: 'Why teaching makes you better.', themes: ['testing'], featured: false, seed: 'share-news', w: 1280, h: 720 },
];

function slugDoc(slug) {
  return { _type: 'slug', current: slug };
}

const now = new Date().toISOString();

for (const b of books) {
  const cover = await uploadImageAsset(b.seed, b.w, b.h, 'cover');
  // Distinct seed so the hero backdrop is visibly NOT the portrait cover.
  const heroBackground = await uploadImageAsset(`${b.seed}-hero`, 1920, 1080, 'hero');
  const doc = {
    _type: 'book',
    title: { es: b.es, en: b.en },
    slug: slugDoc(b.slug),
    author: { es: b.authorEs, en: b.authorEn },
    description: {
      es: `${b.es} — guía práctica para aprender haciendo, paso a paso.`,
      en: `${b.en} — a practical guide to learning by doing, step by step.`,
    },
    cover,
    heroBackground,
    featured: b.featured,
    tagline: { es: b.taglineEs, en: b.taglineEn },
    themes: b.themes,
  };
  const created = await client.create(doc);
  console.log(`book  ${created.slug?.current}  featured=${b.featured} themes=${b.themes.join(',')} (${created._id})`);
}

let i = 0;
for (const n of news) {
  const image = await uploadImageAsset(n.seed, n.w, n.h, 'image');
  // Distinct seed so the hero backdrop is visibly NOT the article thumbnail.
  const heroBackground = await uploadImageAsset(`${n.seed}-hero`, 1920, 1080, 'hero');
  const publishedAt = new Date(Date.now() - i * 86400000).toISOString(); // staggered
  const body = [
    { _type: 'block', _key: `b${i}a`, style: 'normal', children: [{ _type: 'span', _key: `s${i}a`, text: n.excerptEs }] },
    { _type: 'block', _key: `b${i}b`, style: 'normal', children: [{ _type: 'span', _key: `s${i}b`, text: 'Contenido de ejemplo para poblar la home y revisar el rediseño en vivo.' }] },
  ];
  const bodyEn = [
    { _type: 'block', _key: `b${i}ea`, style: 'normal', children: [{ _type: 'span', _key: `s${i}ea`, text: n.excerptEn }] },
    { _type: 'block', _key: `b${i}eb`, style: 'normal', children: [{ _type: 'span', _key: `s${i}eb`, text: 'Sample content to populate the home and review the redesign live.' }] },
  ];
  const doc = {
    _type: 'news',
    title: { es: n.es, en: n.en },
    slug: slugDoc(n.slug),
    excerpt: { es: n.excerptEs, en: n.excerptEn },
    body: { es: body, en: bodyEn },
    publishedAt,
    image,
    heroBackground,
    featured: n.featured,
    tagline: { es: n.excerptEs, en: n.excerptEn },
    themes: n.themes,
  };
  const created = await client.create(doc);
  console.log(`news  ${created.slug?.current}  themes=${n.themes.join(',')} (${created._id})`);
  i++;
}

console.log('\nSeed complete. Books featured in hero: design/habits/business. Run `pnpm dev` and open /es/.');
