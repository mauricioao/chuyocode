import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// MediaCard renders its cover through buildImage(), which lazily builds a
// `@sanity/image-url` client from validated env vars. `vi.mock` is hoisted, so
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

import MediaCard from './MediaCard.astro';

// A resolved cover as produced by the `cover.asset->{url, "lqip": metadata.lqip}`
// GROQ projection: a CDN url plus Sanity's auto base64 blur placeholder.
const COVER_URL =
  'https://cdn.sanity.io/images/proj/production/abc123-800x1200.jpg';
const LQIP = 'data:image/jpeg;base64,QUJD';

const baseProps = {
  _id: 'doc-123',
  href: '/es/libros/el-libro',
  title: 'El Libro',
  author: 'Autora Ejemplo',
  synopsis: 'Una sinopsis editorial de ejemplo.',
  asset: { url: COVER_URL, metadata: { lqip: LQIP } },
};

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(MediaCard, { props });
}

describe('MediaCard.astro — variants', () => {
  it('renders a poster with the 2/3 aspect ratio', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('aspect-[2/3]');
    expect(html).toContain('data-variant="poster"');
  });

  it('renders a wide variant with the 16/9 aspect ratio', async () => {
    const html = await render({ ...baseProps, variant: 'wide' });
    expect(html).toContain('aspect-[16/9]');
    expect(html).toContain('data-variant="wide"');
  });

  it('renders a ranked variant with the 2/3 aspect ratio', async () => {
    const html = await render({ ...baseProps, variant: 'ranked' });
    expect(html).toContain('aspect-[2/3]');
    expect(html).toContain('data-variant="ranked"');
  });

  it('emits the variant-specific sizes hint on the img', async () => {
    const poster = await render({ ...baseProps, variant: 'poster' });
    expect(poster).toContain('sizes="(min-width: 640px) 18rem, 12rem"');

    const wide = await render({ ...baseProps, variant: 'wide' });
    expect(wide).toContain('sizes="(min-width: 1024px) 38rem, 100vw"');

    const ranked = await render({ ...baseProps, variant: 'ranked' });
    expect(ranked).toContain('sizes="11rem"');
  });

  it('emits a responsive srcset (no raw full-res URL) via buildImage', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toMatch(/srcset="[^"]*\?w=\d+&(?:amp;)?auto=format[^"]*"/);
    expect(html).toContain('768w');
  });
});

describe('MediaCard.astro — always-visible caption', () => {
  it('renders an always-visible caption block (not a hover overlay)', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    // The caption is a permanent block below the image, not an overlay.
    expect(html).toContain('mediacard-caption');
    // The old hover-reveal + coarse-pointer mechanisms are gone.
    expect(html).not.toContain('mediacard-overlay');
    expect(html).not.toContain('mediacard-coarse-label');
    // The single anchor is the focus target and provides group-* context.
    expect(html).toContain('group');
    expect(html).toContain('focus-visible:ring');
  });

  it('renders the title and author inside the caption, never opacity-gated', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('El Libro');
    expect(html).toContain('Autora Ejemplo');
    // Title + author live in the always-visible caption block.
    const captionStart = html.indexOf('mediacard-caption');
    const caption = html.slice(captionStart);
    expect(caption).toContain('El Libro');
    expect(caption).toContain('Autora Ejemplo');
  });

  it('omits the author paragraph when no author is provided', async () => {
    const html = await render({
      ...baseProps,
      author: undefined,
      variant: 'poster',
    });
    expect(html).not.toContain('Autora Ejemplo');
  });

  it('does not render the synopsis in the visible markup', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    // synopsis is retained as a prop for call-site compatibility but no longer
    // rendered (the overlay that showed it was removed).
    expect(html).not.toContain('Una sinopsis editorial de ejemplo.');
  });

  it('exposes the title as the anchor accessible name', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('aria-label="El Libro"');
  });
});

describe('MediaCard.astro — type tag', () => {
  it('renders a "Libro" tag when kind="book"', async () => {
    const html = await render({ ...baseProps, variant: 'poster', kind: 'book' });
    expect(html).toContain('Libro');
    // High-contrast: solid accent background + black text.
    expect(html).toContain('bg-accent');
    expect(html).toContain('text-black');
  });

  it('renders a "Noticia" tag when kind="news"', async () => {
    const html = await render({ ...baseProps, variant: 'poster', kind: 'news' });
    expect(html).toContain('Noticia');
  });

  it('renders NO tag when kind is undefined', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    // The tag chip is the only element carrying the high-contrast classes, so
    // their absence proves no tag was emitted (baseProps.title contains the word
    // "Libro", so we key off the chip styling rather than the label text).
    expect(html).not.toContain('text-black');
    expect(html).not.toContain('Noticia');
  });
});

describe('MediaCard.astro — reduced motion', () => {
  // The reduced-motion behavior lives in the component's scoped <style> block,
  // which the Astro Container API does NOT inline into the returned string.
  // Assert the transition-bearing hook the CSS targets exists (`mediacard-img`),
  // so the stylesheet has a class to key off. Full media-query behavior is
  // covered by the E2E layer.
  it('renders the transition-bearing hook the reduced-motion CSS targets', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('mediacard-img');
  });
});

describe('MediaCard.astro — lqip blur-up', () => {
  it('paints the lqip as a background-image when provided', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain(`background-image:url(${LQIP})`);
  });

  it('renders gracefully without an lqip (no background-image)', async () => {
    const html = await render({
      ...baseProps,
      asset: { url: COVER_URL },
      variant: 'poster',
    });
    expect(html).not.toContain('background-image:url(');
    // The responsive image still renders.
    expect(html).toContain('srcset=');
  });
});

describe('MediaCard.astro — view transitions', () => {
  it('assigns a View Transition scope to the cover img when an _id is given', async () => {
    // Astro compiles `transition:name` into a `data-astro-transition-scope`
    // token rather than emitting the literal name; identical names across
    // pages resolve to matching scopes, producing the card→detail morph.
    const html = await render({ ...baseProps, variant: 'poster' });
    // The scope is applied on the cover img element specifically.
    expect(html).toMatch(/<img[^>]*data-astro-transition-scope/);
  });
});
