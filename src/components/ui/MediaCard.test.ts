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
  it('renders a poster with the 3/4 aspect ratio', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('aspect-[3/4]');
    expect(html).toContain('data-variant="poster"');
  });

  it('renders a wide variant with the 16/9 aspect ratio', async () => {
    const html = await render({ ...baseProps, variant: 'wide' });
    expect(html).toContain('aspect-[16/9]');
    expect(html).toContain('data-variant="wide"');
  });

  it('renders a ranked variant with the 3/4 aspect ratio', async () => {
    const html = await render({ ...baseProps, variant: 'ranked' });
    expect(html).toContain('aspect-[3/4]');
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

describe('MediaCard.astro — image-only rest state + overlay reveal', () => {
  it('renders the reveal overlay markup with the reveal class', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    // The fine-pointer overlay exists in markup (revealed via CSS on
    // hover/focus-within — invisible at rest, not absent).
    expect(html).toContain('mediacard-overlay');
    // The single anchor is the focus target and provides group-* context.
    expect(html).toContain('group');
    expect(html).toContain('focus-visible:ring');
  });

  it('places title, author, and synopsis inside the overlay', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('El Libro');
    expect(html).toContain('Autora Ejemplo');
    expect(html).toContain('Una sinopsis editorial de ejemplo.');
    expect(html).toContain('mediacard-synopsis');
  });

  it('omits the synopsis paragraph when no synopsis is provided', async () => {
    const html = await render({
      ...baseProps,
      synopsis: undefined,
      variant: 'poster',
    });
    expect(html).not.toContain('mediacard-synopsis');
  });

  it('exposes the title as the anchor accessible name', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('aria-label="El Libro"');
  });
});

describe('MediaCard.astro — coarse-pointer label', () => {
  it('renders a persistent title-only coarse-pointer label', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('mediacard-coarse-label');
    // The compact label carries the title.
    expect(html).toContain('El Libro');
  });

  it('keeps the coarse label as a distinct element from the full overlay', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    // Both surfaces exist in markup; CSS (scoped <style>, not inlined by the
    // Container API) decides which one is visible per pointer type. The coarse
    // label MUST be its own node so it can persist while the overlay is hidden.
    expect(html).toContain('mediacard-coarse-label');
    expect(html).toContain('mediacard-overlay');
    // The coarse label is title-only: it carries the title but not the author
    // or synopsis (those belong to the fine-pointer overlay only).
    const labelStart = html.indexOf('mediacard-coarse-label');
    const label = html.slice(labelStart);
    expect(label).toContain('El Libro');
    expect(label).not.toContain('Autora Ejemplo');
  });
});

describe('MediaCard.astro — reduced motion', () => {
  // The reduced-motion + coarse-pointer behavior lives in the component's scoped
  // <style> block, which the Astro Container API does NOT inline into the
  // returned string. Assert the transition-bearing hooks the CSS targets exist,
  // so the stylesheet has classes to key off (`mediacard-overlay`,
  // `mediacard-img`). Full media-query behavior is covered by the E2E layer.
  it('renders the transition-bearing hooks the reduced-motion CSS targets', async () => {
    const html = await render({ ...baseProps, variant: 'poster' });
    expect(html).toContain('mediacard-overlay');
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
