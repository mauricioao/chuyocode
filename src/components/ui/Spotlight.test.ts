import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// Spotlight builds its cover through buildImage(), which lazily builds a
// `@sanity/image-url` client from validated env vars. vi.mock is hoisted, so
// stub `@lib/env` before the component (and its buildImage import) loads.
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

import Spotlight from './Spotlight.astro';

const item = {
  _id: 'doc-1',
  kind: 'book' as const,
  title: 'Featured Title',
  slug: 'featured-title',
  href: '/es/libros/featured-title',
  asset: {
    url: 'https://cdn.sanity.io/images/proj/production/cover-1600x900.jpg',
    metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
  },
  tagline: 'A short tagline',
  synopsis: 'A long editorial synopsis that frames the featured item in detail.',
  featured: true,
};

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(Spotlight, { props });
}

describe('Spotlight.astro', () => {
  it('renders the wide cover, synopsis, and CTA deep-link', async () => {
    const html = await render({ item, ctaLabel: 'Read more' });
    expect(html).toContain('data-spotlight');
    // Wide cover with a responsive srcset (no raw full-res URL).
    expect(html).toMatch(/srcset="[^"]*\?w=\d+&(?:amp;)?auto=format[^"]*"/);
    expect(html).toContain('1920w');
    // Editorial synopsis.
    expect(html).toContain('A long editorial synopsis');
    // CTA deep-link.
    expect(html).toContain('data-spotlight-cta');
    expect(html).toContain('href="/es/libros/featured-title"');
    expect(html).toContain('Read more');
  });

  it('renders the title and an optional eyebrow heading', async () => {
    const html = await render({ item, heading: 'Spotlight' });
    expect(html).toContain('Featured Title');
    expect(html).toContain('Spotlight');
  });

  it('falls back to the tagline when no synopsis is present', async () => {
    const { synopsis, ...noSynopsis } = item;
    void synopsis;
    const html = await render({ item: noSynopsis });
    expect(html).toContain('A short tagline');
  });

  it('uses a default CTA label when none is provided', async () => {
    const html = await render({ item });
    expect(html).toContain('Read more');
  });

  it('renders nothing when the item is null', async () => {
    const html = await render({ item: null });
    expect(html).not.toContain('data-spotlight');
    expect(html).not.toContain('Featured Title');
  });

  it('renders nothing when the item is undefined', async () => {
    const html = await render({});
    expect(html).not.toContain('data-spotlight');
  });
});
