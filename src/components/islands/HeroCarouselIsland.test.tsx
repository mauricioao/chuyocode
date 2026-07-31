// @vitest-environment jsdom
/**
 * HeroCarouselIsland tests (the client half of the hero).
 *
 * Embla needs layout/measurement APIs jsdom lacks, so these tests focus on the
 * RENDER CONTRACT (markup the island produces from its slide data) rather than
 * scroll physics: slides, titles, CTAs, optional logo, and the empty/single
 * edge behavior. Autoplay/embla motion is validated in the browser.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import HeroCarouselIsland, {
  type HeroSlideData,
} from './HeroCarouselIsland';

// Embla (inside useEmblaCarousel) touches browser measurement APIs jsdom omits.
// Stub the minimum it needs so the island mounts without throwing; the tests
// then assert the RENDERED markup, not embla's scroll physics (browser-only).
beforeAll(() => {
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(cleanup);

const img = (name: string) => ({
  src: `https://cdn.sanity.io/images/proj/production/${name}.jpg`,
  srcset: `https://cdn.sanity.io/images/proj/production/${name}.jpg?w=1920 1920w`,
  sizes: '100vw',
  lqip: 'data:image/jpeg;base64,QUJD',
});

const slide = (n: number): HeroSlideData => ({
  id: `doc-${n}`,
  href: `/es/libros/libro-${n}`,
  title: `Libro ${n}`,
  tagline: `Tagline ${n}`,
  ctaLabel: 'Leer más',
  image: img(`cover${n}`),
});

describe('HeroCarouselIsland', () => {
  it('renders one slide per item with its title', () => {
    render(<HeroCarouselIsland slides={[slide(1), slide(2), slide(3)]} />);
    const items = document.querySelectorAll('[data-hero-slide]');
    expect(items).toHaveLength(3);
    expect(screen.getByText('Libro 1')).toBeTruthy();
    expect(screen.getByText('Libro 2')).toBeTruthy();
    expect(screen.getByText('Libro 3')).toBeTruthy();
  });

  it('renders a CTA deep-link per slide with its custom label', () => {
    render(<HeroCarouselIsland slides={[slide(1), slide(2)]} />);
    const ctas = document.querySelectorAll('[data-hero-cta]');
    expect(ctas).toHaveLength(2);
    expect(ctas[0]?.getAttribute('href')).toBe('/es/libros/libro-1');
    expect(screen.getAllByText('Leer más').length).toBe(2);
  });

  it('falls back to the default CTA label when a slide omits one', () => {
    render(
      <HeroCarouselIsland
        slides={[{ ...slide(1), ctaLabel: undefined }]}
        defaultCtaLabel="Leer"
      />,
    );
    expect(screen.getByText('Leer')).toBeTruthy();
  });

  it('renders the tagline when present', () => {
    render(<HeroCarouselIsland slides={[slide(1)]} />);
    expect(screen.getByText('Tagline 1')).toBeTruthy();
  });

  it('renders the optional logo AND keeps the text title', () => {
    render(
      <HeroCarouselIsland
        slides={[{ ...slide(1), logo: img('logo1') }]}
      />,
    );
    expect(document.querySelector('[data-hero-logo]')).toBeTruthy();
    // The text <h2> title is still present — the logo never replaces it.
    expect(screen.getByRole('heading', { name: 'Libro 1' })).toBeTruthy();
  });

  it('renders no logo image when the slide has no logo', () => {
    render(<HeroCarouselIsland slides={[slide(1)]} />);
    expect(document.querySelector('[data-hero-logo]')).toBeNull();
  });

  it('renders a single slide without crashing', () => {
    render(<HeroCarouselIsland slides={[slide(1)]} />);
    expect(document.querySelectorAll('[data-hero-slide]')).toHaveLength(1);
    expect(screen.getByText('Libro 1')).toBeTruthy();
  });
});
