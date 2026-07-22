import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// HeroCarousel builds each slide cover through buildImage(), which lazily builds
// a `@sanity/image-url` client from validated env vars. `vi.mock` is hoisted, so
// stub `@lib/env` before the component (and its buildImage import) loads, giving
// loadEnv() the required vars without a real environment.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import HeroCarousel from './HeroCarousel.astro';

// Resolved covers as produced by the `cover.asset->{url, "lqip": metadata.lqip}`
// GROQ projection: a CDN url plus Sanity's auto base64 blur placeholder.
const cover = (n: number) => ({
  url: `https://cdn.sanity.io/images/proj/production/cover${n}-1600x900.jpg`,
  metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
});

const slide = (n: number) => ({
  _id: `doc-${n}`,
  href: `/es/libros/libro-${n}`,
  title: `Libro ${n}`,
  tagline: `Tagline ${n}`,
  ctaLabel: 'Leer más',
  asset: cover(n),
});

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(HeroCarousel, { props });
}

describe('HeroCarousel.astro — multiple slides', () => {
  it('renders one slide article per item', async () => {
    const html = await render({ items: [slide(1), slide(2), slide(3)] });
    // Match the boolean attribute at its boundary so `data-hero-slide` does not
    // over-count against any longer attribute name.
    const matches = html.match(/data-hero-slide(?=[\s">])/g) ?? [];
    expect(matches).toHaveLength(3);
    expect(html).toContain('Libro 1');
    expect(html).toContain('Libro 2');
    expect(html).toContain('Libro 3');
  });

  it('renders one indicator dot per slide', async () => {
    const html = await render({ items: [slide(1), slide(2), slide(3)] });
    // `data-hero-dots` (the container) shares the `data-hero-dot` prefix, so
    // match the per-dot boolean attribute at its boundary only.
    const dots = html.match(/data-hero-dot(?=[\s">])/g) ?? [];
    expect(dots).toHaveLength(3);
    expect(html).toContain('data-hero-dots');
    expect(html).toContain('role="tablist"');
  });

  it('marks the first slide and first dot active by default', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    // First slide is visible; others start hidden.
    expect(html).toContain('is-active');
    expect(html).toMatch(/data-hero-slide[^>]*data-index="0"/);
  });

  it('renders a CTA deep-link per slide with its custom label', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toContain('href="/es/libros/libro-1"');
    expect(html).toContain('href="/es/libros/libro-2"');
    expect(html).toContain('Leer más');
    expect(html).toContain('data-hero-cta');
  });

  it('falls back to a default CTA label when none is provided', async () => {
    const html = await render({
      items: [{ ...slide(1), ctaLabel: undefined }, slide(2)],
    });
    expect(html).toContain('>View<');
  });

  it('renders the tagline in the info panel when present', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toContain('Tagline 1');
  });

  it('emits a responsive wide srcset (no raw full-res URL) per slide', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toMatch(/srcset="[^"]*\?w=\d+&(?:amp;)?auto=format[^"]*"/);
    // wide variant tops out at 1920w.
    expect(html).toContain('1920w');
  });
});

describe('HeroCarousel.astro — autoplay script + interval', () => {
  it('renders an inline autoplay script when there are 2+ slides', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toContain('<script');
    // Pause/resume + reduced-motion logic hooks are present in the script.
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('visibilitychange');
    expect(html).toContain('setInterval');
  });

  it('uses the default 6000ms interval when none is provided', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toContain('data-interval="6000"');
  });

  it('honors a configurable interval prop', async () => {
    const html = await render({
      items: [slide(1), slide(2)],
      interval: 8000,
    });
    expect(html).toContain('data-interval="8000"');
  });
});

describe('HeroCarousel.astro — zero items', () => {
  it('renders NO carousel DOM and a fallback placeholder instead', async () => {
    const html = await render({ items: [] });
    expect(html).not.toContain('data-hero-carousel');
    expect(html).not.toContain('data-hero-slide');
    expect(html).not.toContain('data-hero-dot');
    // A neutral placeholder holds the slot.
    expect(html).toContain('data-hero-placeholder');
  });

  it('ships no autoplay script when there are zero slides', async () => {
    const html = await render({ items: [] });
    expect(html).not.toContain('setInterval');
  });
});

describe('HeroCarousel.astro — single item', () => {
  it('renders the single slide WITHOUT indicator dots', async () => {
    const html = await render({ items: [slide(1)] });
    const slides = html.match(/data-hero-slide(?=[\s">])/g) ?? [];
    expect(slides).toHaveLength(1);
    expect(html).not.toContain('data-hero-dots');
    expect(html).not.toContain('data-hero-dot');
  });

  it('ships NO autoplay script and NO data-interval for a single slide', async () => {
    const html = await render({ items: [slide(1)] });
    expect(html).not.toContain('data-interval');
    expect(html).not.toContain('setInterval');
  });

  it('still renders the slide content and its CTA deep-link', async () => {
    const html = await render({ items: [slide(1)] });
    expect(html).toContain('Libro 1');
    expect(html).toContain('href="/es/libros/libro-1"');
  });
});
