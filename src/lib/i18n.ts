/**
 * i18n — shared locale support for ChuyoCode (spec 5: Internationalization).
 *
 * Single source of truth for the supported languages, the default language,
 * and the resolver that picks a best match from an `Accept-Language` header.
 * The middleware (lang-segment validation, root redirect) and every localized
 * page/component consume these helpers instead of hand-rolling their own maps.
 *
 * This module supersedes the tiny inline NAV_LABELS/FOOTER_LABELS maps that
 * Header/Footer used to stay autonomous in the design-system work unit (PR 2).
 */

/** Languages the site serves. `es` is primary; `en` is the secondary locale. */
export const SUPPORTED_LANGS = ['es', 'en'] as const;

/** Union of the supported language codes. */
export type Lang = (typeof SUPPORTED_LANGS)[number];

/**
 * Default language. Requests to `/` redirect here and any unresolved locale
 * falls back to this value (spec 5: root redirect + es fallback).
 */
export const DEFAULT_LANG: Lang = 'es';

/**
 * Type guard: is `lang` one of the supported languages?
 *
 * Accepts an `unknown` so it can validate raw route params / header fragments
 * without an unsafe cast at the call site.
 */
export function isValidLang(lang: unknown): lang is Lang {
  return (
    typeof lang === 'string' &&
    (SUPPORTED_LANGS as readonly string[]).includes(lang)
  );
}

/** The default language. Kept as a function for call-site symmetry with resolve. */
export function getDefaultLang(): Lang {
  return DEFAULT_LANG;
}

/**
 * Resolve the best-matching supported language from an `Accept-Language`
 * header value.
 *
 * Parses the header's quality-weighted list (e.g. `en-US,en;q=0.9,es;q=0.8`),
 * sorts by `q`, and returns the first entry whose primary subtag is supported.
 * Falls back to {@link DEFAULT_LANG} when the header is absent, empty, or names
 * no supported language.
 *
 * @param acceptLang - Raw `Accept-Language` header value, if any.
 */
export function resolveLang(acceptLang?: string | null): Lang {
  if (!acceptLang) {
    return DEFAULT_LANG;
  }

  const ranked = acceptLang
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      // Primary subtag only: `en-US` -> `en`.
      const primary = tag.trim().toLowerCase().split('-')[0];
      return { primary, q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.primary.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if (isValidLang(entry.primary)) {
      return entry.primary;
    }
  }

  return DEFAULT_LANG;
}

/**
 * Localized labels for shared chrome (Header nav, Footer secondary links).
 *
 * Centralized here so Header/Footer no longer carry their own inline maps.
 * Keep these keys stable — components read `UI_LABELS[lang]` directly.
 */
export const UI_LABELS = {
  es: {
    meta: {
      siteDescription:
        'ChuyoCode: libros, artículos y cursos de programación para la comunidad latina. Aprendé tecnología en tu idioma, con fundamentos sólidos.',
      booksDescription:
        'Catálogo de libros de programación y tecnología en español, seleccionados para aprender con fundamentos sólidos.',
      newsDescription:
        'Últimas noticias y artículos de programación y tecnología para la comunidad latina de desarrolladores.',
    },
    nav: {
      home: 'Inicio',
      books: 'Libros',
      news: 'Noticias',
      english: 'English',
      soon: 'Pronto',
      switchTo: 'Cambiar a',
    },
    footer: { terms: 'Términos', privacy: 'Privacidad' },
    legal: {
      titles: { terms: 'Términos y condiciones', privacy: 'Política de privacidad' },
      pending: 'Contenido legal pendiente',
      privacyNote:
        'Respetamos tu privacidad. Todavía estamos redactando la versión completa de este documento; mientras tanto, no vendemos ni compartimos tus datos personales con terceros.',
    },
    news: { readMore: 'Leer más' },
    article: { back: 'Volver a noticias' },
    home: {
      hero: {
        headline: 'Aprendé tecnología en tu idioma',
        subline:
          'Libros, artículos y cursos de programación pensados para la comunidad latina. Contenido claro, sin atajos, con fundamentos sólidos.',
        primaryCta: 'Explorar libros',
        secondaryCta: 'Leer noticias',
        imageAlt:
          'Ilustración de una comunidad latina aprendiendo programación con motivos andinos',
      },
      rows: {
        viewAll: 'Ver todo',
        featuredBooks: 'Libros destacados',
        latestArticles: 'Últimas noticias',
        courses: 'Cursos',
        english: 'Inglés para programadores',
      },
    },
    courses: {
      teaser: {
        badge: 'Próximamente',
        title: 'Cursos en camino',
        description:
          'Estamos preparando cursos prácticos de programación. Muy pronto vas a poder aprender paso a paso con nosotros.',
        imageAlt: 'Vista previa de los próximos cursos de programación',
      },
    },
    english: {
      teaser: {
        badge: 'Próximamente',
        title: 'Inglés para programadores',
        description:
          'Una sección independiente para dominar el inglés técnico que necesitás en tu carrera. Estamos trabajando en ella.',
        imageAlt: 'Vista previa de la sección de inglés para programadores',
      },
    },
  },
  en: {
    meta: {
      siteDescription:
        'ChuyoCode: books, articles, and programming courses for the Latin community. Learn technology in your own language, with solid foundations.',
      booksDescription:
        'A catalog of programming and technology books curated to help you learn with solid foundations.',
      newsDescription:
        'The latest programming and technology news and articles for the Latin developer community.',
    },
    nav: {
      home: 'Home',
      books: 'Books',
      news: 'News',
      english: 'English',
      soon: 'Soon',
      switchTo: 'Switch to',
    },
    footer: { terms: 'Terms', privacy: 'Privacy' },
    legal: {
      titles: { terms: 'Terms and conditions', privacy: 'Privacy policy' },
      pending: 'Legal content pending',
      privacyNote:
        'We respect your privacy. We are still drafting the full version of this document; in the meantime, we do not sell or share your personal data with third parties.',
    },
    news: { readMore: 'Read more' },
    article: { back: 'Back to news' },
    home: {
      hero: {
        headline: 'Learn technology in your own language',
        subline:
          'Books, articles, and programming courses built for the Latin community. Clear content, no shortcuts, solid foundations.',
        primaryCta: 'Explore books',
        secondaryCta: 'Read news',
        imageAlt:
          'Illustration of a Latin community learning to code with Andean motifs',
      },
      rows: {
        viewAll: 'View all',
        featuredBooks: 'Featured books',
        latestArticles: 'Latest news',
        courses: 'Courses',
        english: 'English for developers',
      },
    },
    courses: {
      teaser: {
        badge: 'Coming soon',
        title: 'Courses on the way',
        description:
          'We are building hands-on programming courses. Very soon you will be able to learn step by step with us.',
        imageAlt: 'Preview of the upcoming programming courses',
      },
    },
    english: {
      teaser: {
        badge: 'Coming soon',
        title: 'English for developers',
        description:
          'An independent section to master the technical English your career needs. We are working on it.',
        imageAlt: 'Preview of the English for developers section',
      },
    },
  },
} as const satisfies Record<Lang, unknown>;

