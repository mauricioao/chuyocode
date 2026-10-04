import { describe, it, expect } from 'vitest';
import {
  canonicalUrl,
  hreflangAlternates,
  defaultHreflangAlternate,
  isNoindexPath,
} from './seo';

const SITE = new URL('https://chuyocode.netlify.app/');

describe('canonicalUrl', () => {
  it('builds an absolute URL from site + pathname', () => {
    expect(canonicalUrl(SITE, '/es/libros/clean-code')).toBe(
      'https://chuyocode.netlify.app/es/libros/clean-code',
    );
  });

  it('drops any query string', () => {
    expect(canonicalUrl(SITE, '/es/ingles/actividades')).toBe(
      'https://chuyocode.netlify.app/es/ingles/actividades',
    );
  });

  it('falls back to the literal Netlify domain when site is undefined', () => {
    expect(canonicalUrl(undefined, '/es/')).toBe(
      'https://chuyocode.netlify.app/es/',
    );
  });
});

describe('hreflangAlternates', () => {
  it('returns es + en alternates for a lang-prefixed path, swapping the first segment', () => {
    expect(hreflangAlternates('/es/libros/clean-code', SITE)).toEqual([
      { lang: 'es', href: 'https://chuyocode.netlify.app/es/libros/clean-code' },
      { lang: 'en', href: 'https://chuyocode.netlify.app/en/libros/clean-code' },
    ]);
  });

  it('works starting from an en path too', () => {
    expect(hreflangAlternates('/en/noticias', SITE)).toEqual([
      { lang: 'es', href: 'https://chuyocode.netlify.app/es/noticias' },
      { lang: 'en', href: 'https://chuyocode.netlify.app/en/noticias' },
    ]);
  });

  it('returns [] for a path with no valid lang prefix', () => {
    expect(hreflangAlternates('/sitemap.xml', SITE)).toEqual([]);
    expect(hreflangAlternates('/api/me', SITE)).toEqual([]);
  });
});

describe('defaultHreflangAlternate', () => {
  it('picks the es (default lang) alternate', () => {
    const alternates = hreflangAlternates('/en/libros', SITE);
    expect(defaultHreflangAlternate(alternates)?.href).toBe(
      'https://chuyocode.netlify.app/es/libros',
    );
  });

  it('is undefined when there are no alternates', () => {
    expect(defaultHreflangAlternate([])).toBeUndefined();
  });
});

describe('isNoindexPath', () => {
  it.each([
    '/es/',
    '/en/',
    '/es/libros',
    '/es/libros/clean-code',
    '/es/noticias',
    '/es/noticias/some-article',
    '/es/legal/terms',
    '/es/legal/privacy',
    // Guest play carve-out: public even though it is nested under `ingles`.
    '/es/ingles/actividades/abc123',
    '/en/ingles/actividades/abc123/presentar',
  ])('is false for the public page %s', (pathname) => {
    expect(isNoindexPath(pathname)).toBe(false);
  });

  it.each([
    '/es/ingles',
    '/es/ingles/actividades',
    '/es/ingles/actividades/abc123/imprimir',
    '/es/ingles/propuestos',
    '/es/cursos',
    '/es/cursos/some-course',
    '/es/crear',
    '/es/crear/abc123',
    '/es/mis-actividades',
    '/es/admin/actividades',
    '/es/auth/entrar',
  ])('is true for the gated page %s', (pathname) => {
    expect(isNoindexPath(pathname)).toBe(true);
  });

  it('is false for a path with no section at all', () => {
    expect(isNoindexPath('/')).toBe(false);
    expect(isNoindexPath('/es')).toBe(false);
  });
});
