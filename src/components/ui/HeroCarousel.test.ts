import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getContainerRenderer } from '@astrojs/react';

// HeroCarousel runs the server-only image pipeline (buildImage → @sanity/
// image-url built from validated env) and then hands plain slide data to the
// HeroCarouselIsland React island. `vi.mock` is hoisted, so stub `@lib/env`
// before the component loads so loadEnv() has the vars it needs.
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

// Resolved cover as produced by the `cover.asset->{url,"lqip":metadata.lqip}`
// GROQ projection: a CDN url plus Sanity's auto base64 blur placeholder.
const cover = (n: number) => ({
  url: `https://cdn.sanity.io/images/proj/production/cover${n}-1600x900.jpg`,
  metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
});
const logo = (n: number) => ({
  url: `https://cdn.sanity.io/images/proj/production/logo${n}-800x300.png`,
});
const backdrop = (n: number) => ({
  url: `https://cdn.sanity.io/images/proj/production/backdrop${n}-2560x1440.jpg`,
});

const slide = (n: number) => ({
  _id: `doc-${n}`,
  href: `/es/libros/libro-${n}`,
  title: `Libro ${n}`,
  tagline: `Tagline ${n}`,
  ctaLabel: 'Leer más',
  asset: cover(n),
});

// The hero mounts a React island, so the container needs the React renderer
// registered or it throws NoMatchingRenderer.
async function render(props: Record<string, unknown>): Promise<string> {
  const renderers = await loadRenderers([getContainerRenderer()]);
  const container = await AstroContainer.create({ renderers });
  return container.renderToString(HeroCarousel, { props });
}

// The .astro wrapper renders an Astro island placeholder whose serialized props
// carry the flattened slide data. These tests assert the SERVER contract: the
// image pipeline ran, the right data was flattened, and the island is mounted
// eagerly. The interactive behavior (autoplay, swipe, active slide) lives in
// HeroCarouselIsland and is covered by HeroCarouselIsland.test.tsx.

describe('HeroCarousel.astro — server wrapper', () => {
  it('mounts the hero island eagerly (client:load) for 1+ items', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toContain('astro-island');
    expect(html).toContain('client="load"');
    // No placeholder when there is content.
    expect(html).not.toContain('data-hero-placeholder');
  });

  it('flattens each slide title into the island props', async () => {
    const html = await render({ items: [slide(1), slide(2), slide(3)] });
    expect(html).toContain('Libro 1');
    expect(html).toContain('Libro 2');
    expect(html).toContain('Libro 3');
  });

  it('carries the CTA deep-link + tagline per slide in the props', async () => {
    const html = await render({ items: [slide(1)] });
    expect(html).toContain('/es/libros/libro-1');
    expect(html).toContain('Leer m');
    expect(html).toContain('Tagline 1');
  });

  it('resolves a responsive hero srcset server-side (no raw full-res URL)', async () => {
    const html = await render({ items: [slide(1)] });
    // hero variant spans 960..2560; both stay candidates in the serialized props.
    expect(html).toContain('1920w');
    expect(html).toContain('2560w');
    // The truthful full-bleed sizes hint is present.
    expect(html).toContain('100vw');
  });

  it('uses heroBackground for the backdrop when present', async () => {
    const html = await render({
      items: [{ ...slide(1), backgroundAsset: backdrop(1) }],
    });
    expect(html).toContain('backdrop1-2560x1440');
  });

  it('falls back to the cover when the backdrop is absent', async () => {
    const html = await render({ items: [slide(1)] });
    expect(html).toContain('cover1-1600x900');
    expect(html).not.toContain('backdrop1-2560x1440');
  });

  it('flattens an optional content logo into the props when present', async () => {
    const html = await render({ items: [{ ...slide(1), logoAsset: logo(1) }] });
    expect(html).toContain('logo1-800x300');
  });

  it('carries no logo url when the document has no contentLogo', async () => {
    const html = await render({ items: [slide(1)] });
    expect(html).not.toContain('logo1-800x300');
  });
});

describe('HeroCarousel.astro — zero items', () => {
  it('renders a placeholder and NO island when there are no items', async () => {
    const html = await render({ items: [] });
    expect(html).toContain('data-hero-placeholder');
    expect(html).not.toContain('astro-island');
  });
});
