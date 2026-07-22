import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ContentRow from './ContentRow.astro';

// PR 3 (home-streaming) — design decision #4.
// ContentRow is a pure Astro component (no client island), so the Container
// API renders it fully. It must expose the title, a CSS scroll-snap track, its
// slotted items, and an optional localized "view all" link.
describe('ContentRow.astro', () => {
  it('renders the title as a heading', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentRow, {
      props: { title: 'Featured books' },
    });
    expect(html).toContain('Featured books');
    expect(html).toMatch(/<h2[^>]*>/);
  });

  it('renders slotted items inside the track', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentRow, {
      props: { title: 'Row' },
      slots: { default: '<div data-testid="card">card content</div>' },
    });
    expect(html).toContain('data-testid="card"');
    expect(html).toContain('card content');
  });

  it('uses CSS scroll-snap on the track (no JS island)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentRow, {
      props: { title: 'Row' },
    });
    expect(html).toContain('snap-x');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('contentrow-track');
    // no client directive / hydration marker for this pure component
    expect(html).not.toContain('astro-island');
  });

  it('omits the "view all" link when no href is given', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentRow, {
      props: { title: 'Row' },
    });
    expect(html).not.toContain('<a');
  });

  it('renders a localized "view all" link when href + lang are given', async () => {
    const container = await AstroContainer.create();
    const es = await container.renderToString(ContentRow, {
      props: { title: 'Libros', href: '/es/libros', lang: 'es' },
    });
    expect(es).toContain('href="/es/libros"');
    expect(es).toContain('Ver todo');

    const en = await container.renderToString(ContentRow, {
      props: { title: 'Books', href: '/en/libros', lang: 'en' },
    });
    expect(en).toContain('href="/en/libros"');
    expect(en).toContain('View all');
  });

  it('omits the link when href is present but lang is missing', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentRow, {
      props: { title: 'Row', href: '/es/libros' },
    });
    // Without a lang there is no localized label, so no link is rendered.
    expect(html).not.toContain('href="/es/libros"');
  });

  // frontend-v3 design decision #9: the track adopts depth tokens (hairline
  // ring + layered shadow) from PR1 instead of a flat border.
  it('applies the ring + elevation depth tokens on the track (no flat border)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentRow, {
      props: { title: 'Row' },
    });
    expect(html).toContain('ring-1');
    expect(html).toContain('ring-white/5');
    expect(html).toContain('shadow-elevation-1');
    // The flat border approach is replaced, not augmented.
    expect(html).not.toContain('border-base-muted');
  });
});
