import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Emoji from './Emoji.astro';

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(Emoji, { props });
}

describe('Emoji.astro', () => {
  it('renders AVIF and WebP sources with 1x/2x/4x density descriptors from the three shipped widths', async () => {
    const html = await render({ name: 'party-popper' });
    expect(html).toContain('/images/emoji/party-popper-v1-64.avif 1x');
    expect(html).toContain('/images/emoji/party-popper-v1-128.avif 2x');
    expect(html).toContain('/images/emoji/party-popper-v1-256.avif 4x');
    expect(html).toContain('/images/emoji/party-popper-v1-64.webp 1x');
    expect(html).toContain('/images/emoji/party-popper-v1-128.webp 2x');
    expect(html).toContain('/images/emoji/party-popper-v1-256.webp 4x');
  });

  it('falls back to the smallest WebP on the <img> itself', async () => {
    const html = await render({ name: 'trophy' });
    expect(html).toMatch(/<img[^>]*src="\/images\/emoji\/trophy-v1-64\.webp"/);
  });

  it('is decorative by default: empty alt + aria-hidden', async () => {
    const html = await render({ name: 'books' });
    // Astro's runtime attribute serializer collapses a dynamic `alt={''}` to
    // the bare `alt` attribute (no `=""`) — equivalent per the HTML spec (a
    // valueless attribute parses as an empty string), unlike a STATIC
    // `alt=""` written directly in markup elsewhere in this codebase.
    expect(html).toMatch(/<img[^>]* alt(?=[\s>])/);
    expect(html).toContain('aria-hidden="true"');
  });

  it('accepts an accessible label and drops aria-hidden', async () => {
    const html = await render({ name: 'rocket', label: 'Cohete' });
    expect(html).toContain('alt="Cohete"');
    expect(html).not.toContain('aria-hidden');
  });

  it('sizes the <img> from the size prop, defaulting to 48', async () => {
    const htmlDefault = await render({ name: 'llama' });
    expect(htmlDefault).toMatch(/width="48"/);
    expect(htmlDefault).toMatch(/height="48"/);

    const htmlCustom = await render({ name: 'llama', size: 32 });
    expect(htmlCustom).toMatch(/width="32"/);
    expect(htmlCustom).toMatch(/height="32"/);
  });

  it('carries loading=lazy and decoding=async', async () => {
    const html = await render({ name: 'sparkles' });
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('forwards data-testid to the <picture> root', async () => {
    const html = await render({ name: 'star-struck', 'data-testid': 'my-emoji' });
    expect(html).toMatch(/<picture[^>]*data-testid="my-emoji"/);
  });

  // Desk hub folders ("desktop" redesign PART 3): the two slugs added for
  // "Actividades de la comunidad" and the "Para ti hoy" folder's star.
  it('renders the two desk-hub folder emoji', async () => {
    const busts = await render({ name: 'busts-in-silhouette' });
    expect(busts).toContain('/images/emoji/busts-in-silhouette-v1-64.avif 1x');
    expect(busts).toMatch(/<img[^>]*src="\/images\/emoji\/busts-in-silhouette-v1-64\.webp"/);

    const star = await render({ name: 'glowing-star' });
    expect(star).toContain('/images/emoji/glowing-star-v1-64.avif 1x');
    expect(star).toMatch(/<img[^>]*src="\/images\/emoji\/glowing-star-v1-64\.webp"/);
  });
});
