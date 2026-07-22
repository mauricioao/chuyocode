import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// RankedRow renders MediaCards, whose covers go through buildImage(), which
// lazily builds a `@sanity/image-url` client from validated env vars. vi.mock is
// hoisted, so stub `@lib/env` before the component graph loads.
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

import RankedRow from './RankedRow.astro';

const item = (n: number) => ({
  _id: `doc-${n}`,
  kind: 'book' as const,
  title: `Book ${n}`,
  slug: `book-${n}`,
  href: `/es/libros/book-${n}`,
  asset: {
    url: `https://cdn.sanity.io/images/proj/production/cover${n}-800x1200.jpg`,
    metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
  },
  tagline: `Tagline ${n}`,
  featured: false,
});

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(RankedRow, { props });
}

describe('RankedRow.astro', () => {
  it('renders the section title and track', async () => {
    const html = await render({ title: 'Top books', items: [item(1), item(2)] });
    expect(html).toContain('Top books');
    expect(html).toContain('data-ranked-row');
    expect(html).toContain('data-ranked-track');
  });

  it('renders one numbered item per entry with visible rank numbers', async () => {
    const html = await render({ title: 'Top', items: [item(1), item(2), item(3)] });
    const entries = html.match(/data-ranked-item(?=[\s">])/g) ?? [];
    expect(entries).toHaveLength(3);
    // Big decorative rank numbers 1..3.
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('>3<');
    expect(html).toContain('ranked-number');
  });

  it('renders each item as a ranked-variant MediaCard', async () => {
    const html = await render({ title: 'Top', items: [item(1), item(2)] });
    expect(html).toContain('data-variant="ranked"');
    expect(html).toContain('Book 1');
    expect(html).toContain('href="/es/libros/book-1"');
  });

  it('renders an optional side description', async () => {
    const html = await render({
      title: 'Top',
      items: [item(1)],
      description: 'A curated ranking of standout titles.',
    });
    expect(html).toContain('A curated ranking of standout titles.');
  });

  it('renders nothing when there are no items', async () => {
    const html = await render({ title: 'Empty', items: [] });
    expect(html).not.toContain('data-ranked-row');
    expect(html).not.toContain('data-ranked-track');
  });
});
