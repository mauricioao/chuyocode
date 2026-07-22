import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// EditorialRow renders MediaCards, whose covers go through buildImage(), which
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

import EditorialRow from './EditorialRow.astro';

// A normalized MediaItem as produced by getRowsByTheme() → toMediaItem().
const item = (n: number) => ({
  _id: `doc-${n}`,
  kind: n % 2 === 0 ? ('news' as const) : ('book' as const),
  title: `Item ${n}`,
  slug: `item-${n}`,
  href: n % 2 === 0 ? `/es/noticias/item-${n}` : `/es/libros/item-${n}`,
  asset: {
    url: `https://cdn.sanity.io/images/proj/production/cover${n}-800x1200.jpg`,
    metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
  },
  tagline: `Tagline ${n}`,
  featured: false,
});

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(EditorialRow, { props });
}

describe('EditorialRow.astro', () => {
  it('renders the section title', async () => {
    const html = await render({ title: 'Architecture', items: [item(1), item(2)] });
    expect(html).toContain('Architecture');
    expect(html).toContain('data-editorial-row');
  });

  it('renders prev/next arrow buttons wired for scrollBy', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    expect(html).toContain('data-editorial-prev');
    expect(html).toContain('data-editorial-next');
    // The arrow script binds scrollBy on the track.
    expect(html).toContain('<script');
    expect(html).toContain('scrollBy');
    expect(html).toContain('data-astro-rerun');
  });

  it('renders a scroll-snap track of the items', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2), item(3)] });
    expect(html).toContain('data-editorial-track');
    expect(html).toContain('snap-x');
    expect(html).toContain('snap-mandatory');
  });

  it('exposes the edge-fade track hook the mask CSS targets', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    // Astro hoists scoped <style> out of the container-rendered markup, so the
    // edge-fade `mask-image` rule is not inlined here. Assert the stable class
    // hook the scoped rule binds to instead (`.editorial-track` carries the
    // mask-image gradient in the component's <style> block).
    expect(html).toContain('editorial-track');
    expect(html).toContain('data-editorial-track');
  });

  it('renders a MediaCard per item, mixing books and news', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2), item(3)] });
    expect(html).toContain('Item 1');
    expect(html).toContain('Item 2');
    expect(html).toContain('Item 3');
    // Poster variant cards with deep-links for both content kinds.
    expect(html).toContain('data-variant="poster"');
    expect(html).toContain('href="/es/libros/item-1"');
    expect(html).toContain('href="/es/noticias/item-2"');
  });

  it('renders nothing when there are no items', async () => {
    const html = await render({ title: 'Empty', items: [] });
    expect(html).not.toContain('data-editorial-row');
    expect(html).not.toContain('data-editorial-track');
    expect(html).not.toContain('<script');
  });
});
