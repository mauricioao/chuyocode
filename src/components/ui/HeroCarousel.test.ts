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

// Optional hero art (spec: hero-logo-background): a transparent-PNG title
// treatment and a wide landscape backdrop. Distinct filenames per asset so a
// test can prove WHICH one the backdrop actually resolved to.
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

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(HeroCarousel, { props });
}

// First rendered Sanity CDN `src`, i.e. the backdrop of the first slide.
function srcOf(html: string): string | undefined {
  return html.match(/src="(https:\/\/cdn\.sanity\.io[^"]*)"/)?.[1];
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

  it('renders NO indicator dots (removed pending a new slide control)', async () => {
    const html = await render({ items: [slide(1), slide(2), slide(3)] });
    // Dots were removed intentionally; a different control replaces them later.
    expect(html).not.toContain('data-hero-dots');
    expect(html).not.toContain('data-hero-dot');
    expect(html).not.toContain('role="tablist"');
  });

  it('marks the first slide active by default', async () => {
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
    expect(html).toContain('>Leer<');
  });

  it('renders the tagline in the info panel when present', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toContain('Tagline 1');
  });

  it('emits a responsive hero srcset (no raw full-res URL) per slide', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    expect(html).toMatch(/srcset="[^"]*\?w=\d+&(?:amp;)?auto=format[^"]*"/);
    // hero variant spans 960..2560; 1920 stays a candidate, 2560 is the new top.
    expect(html).toContain('1920w');
    expect(html).toContain('2560w');
    // Full-bleed slide, so the sizes hint must be the truthful 100vw.
    expect(html).toContain('sizes="100vw"');
  });
});

// ---------------------------------------------------------------------------
// hero-logo-background — the two OPTIONAL hero art fields. Both are purely
// additive: a slide without them must render exactly as it did before.
// ---------------------------------------------------------------------------
describe('HeroCarousel.astro — optional content logo', () => {
  it('renders the logo AND keeps the text title visible', async () => {
    const html = await render({
      items: [{ ...slide(1), logoAsset: logo(1) }, slide(2)],
    });
    // The logo image renders...
    expect(html).toContain('data-hero-logo');
    expect(html).toContain('logo1-800x300.png');
    // ...and the <h2> text title is STILL rendered. The logo never replaces it.
    expect(html).toMatch(/<h2[^>]*>\s*Libro 1\s*<\/h2>/);
    // Nothing hides the heading.
    expect(html).not.toContain('sr-only');
  });

  it('places the logo BEFORE the <h2> in document order', async () => {
    const html = await render({ items: [{ ...slide(1), logoAsset: logo(1) }] });
    expect(html.indexOf('data-hero-logo')).toBeLessThan(html.indexOf('<h2'));
  });

  it('renders NO logo image when the document has no contentLogo', async () => {
    const html = await render({ items: [slide(1), slide(2)] });
    // Hook attribute must be absent…
    expect(html).not.toContain('data-hero-logo');
    // …but also no logo CDN URL — catches the case where the attribute is
    // renamed/deleted while the <img> still renders (observable behavior).
    expect(html).not.toContain('logo1-800x300.png');
    // No extra <img> elements beyond the backdrop covers (one per slide here).
    const imgTags = html.match(/<img\b/g) ?? [];
    expect(imgTags.length).toBe(2);
    // The title renders exactly as before, unchanged.
    expect(html).toMatch(/<h2[^>]*>\s*Libro 1\s*<\/h2>/);
  });

  it('renders NO logo image when logoAsset is null', async () => {
    const html = await render({ items: [{ ...slide(1), logoAsset: null }] });
    // Hook attribute must be absent…
    expect(html).not.toContain('data-hero-logo');
    // …and no logo CDN URL either.
    expect(html).not.toContain('logo1-800x300.png');
    // Only the single backdrop <img> should be present.
    const imgTags = html.match(/<img\b/g) ?? [];
    expect(imgTags.length).toBe(1);
    expect(html).toContain('Libro 1');
  });

  it('emits a small responsive logo srcset, not the hero width set', async () => {
    const html = await render({ items: [{ ...slide(1), logoAsset: logo(1) }] });
    expect(html).toContain('480w');
    expect(html).toContain('(min-width: 640px) 22rem, 14rem');
  });
});

describe('HeroCarousel.astro — optional hero background', () => {
  it('uses heroBackground for the backdrop when present', async () => {
    const html = await render({
      items: [{ ...slide(1), backgroundAsset: backdrop(1) }],
    });
    expect(html).toContain('backdrop1-2560x1440.jpg');
  });

  it('falls back to the cover when heroBackground is absent', async () => {
    const withBackdrop = await render({
      items: [{ ...slide(1), backgroundAsset: backdrop(1) }],
    });
    const coverOnly = await render({ items: [slide(1)] });

    // The fallback path renders the cover, NOT the backdrop.
    expect(coverOnly).toContain('cover1-1600x900.jpg');
    expect(coverOnly).not.toContain('backdrop1-2560x1440.jpg');
    // And the two cases genuinely resolve to different image URLs.
    expect(srcOf(withBackdrop)).not.toBe(srcOf(coverOnly));
  });

  it('falls back to the cover when backgroundAsset is null', async () => {
    const html = await render({ items: [{ ...slide(1), backgroundAsset: null }] });
    expect(html).toContain('cover1-1600x900.jpg');
  });

  it('renders no backdrop image when neither background nor cover exists', async () => {
    const html = await render({
      items: [{ ...slide(1), asset: undefined, backgroundAsset: undefined }],
    });
    expect(html).not.toContain('cdn.sanity.io');
    // The info panel still renders, so the slide is never blank.
    expect(html).toContain('Libro 1');
    expect(html).toContain('data-hero-cta');
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
