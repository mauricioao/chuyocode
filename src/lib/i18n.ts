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
      // A `<meta name="description">` DESCRIBES; it does not instruct. The
      // sentence that used to open with an imperative is now a claim about the
      // catalogue the previous sentence just named — same promise, no verb
      // addressing the reader. `aprender` was already carried by "cursos".
      siteDescription:
        'ChuyoCode: libros, artículos y cursos de programación para la comunidad latina. Tecnología en tu idioma, con fundamentos sólidos.',
      booksDescription:
        'Catálogo de libros de programación y tecnología en español, seleccionados para aprender con fundamentos sólidos.',
      newsDescription:
        'Últimas noticias y artículos de programación y tecnología para la comunidad latina de desarrolladores.',
    },
    nav: {
      home: 'Inicio',
      books: 'Libros',
      news: 'Noticias',
      courses: 'Cursos',
      englishLink: 'Inglés',
      english: 'English',
      soon: 'Pronto',
      switchTo: 'Cambiar a',
    },
    footer: { terms: 'Términos y Condiciones', privacy: 'Privacidad' },
    legal: {
      titles: { terms: 'Términos y condiciones', privacy: 'Política de privacidad' },
      pending: 'Contenido legal pendiente',
      privacyNote:
        'Respetamos tu privacidad. Todavía estamos redactando la versión completa de este documento; mientras tanto, no vendemos ni compartimos tus datos personales con terceros.',
    },
    news: { readMore: 'Leer más' },
    article: { back: 'Volver a noticias' },
    // 404 copy. It used to live in a local map inside `404.astro`, which put a
    // whole page's Spanish out of reach of the neutral-Spanish guard — and that
    // is precisely where a voseo ("La página que buscás") quietly survived the
    // English-section sweep. Centralizing it is what makes it guardable.
    notFound: {
      title: 'Página no encontrada',
      body: 'La página solicitada no existe o fue movida.',
      home: 'Volver al inicio',
    },
    home: {
      hero: {
        // Infinitive, matching the register the rest of the site already uses
        // for actions ("Elegir nivel", "Revisar las respuestas"). It keeps the
        // headline's rhythm, length and `aprender` keyword intact and changes
        // only the one thing the rule is about: the direct address.
        headline: 'Aprender tecnología en tu idioma',
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
        // "vas a poder" addressed the reader in the second person. The same
        // phrasing the English section already uses for a not-yet-available
        // state ("van a estar disponibles") keeps the promise without it, and
        // "con nosotros" went with it — "Estamos preparando" already says who.
        description:
          'Estamos preparando cursos prácticos de programación. Muy pronto van a estar disponibles para aprender paso a paso.',
        imageAlt: 'Vista previa de los próximos cursos de programación',
      },
    },
    english: {
      // Copy for the section entry route `/[lang]/ingles` and the
      // `[level]/[focus]` listing. The old "coming soon" teaser lived here and
      // was removed when the section actually shipped.
      // REGISTER: neutral Spanish, impersonal. Instructions use the infinitive
      // ("Revisar las respuestas") and descriptions avoid the second person
      // entirely. The site is not Argentina-specific, so no voseo reaches the
      // UI — enforced by a guard in `i18n.test.ts`.
      section: {
        // Names the SECTION, not its audience. "Inglés para programadores"
        // described who the section was for, which the visitor already knows by
        // the time they are looking at it; "Ejercicios de inglés" says what is
        // actually on the screen. It doubles as the `<title>`, where the shorter
        // string also survives a SERP truncation intact.
        title: 'Ejercicios de inglés',
        // `<meta name="description">`. Deliberately left as-is: it already leads
        // with "Ejercicios cortos de inglés técnico", so it reads as an
        // expansion of the new headline rather than a contradiction of it, and
        // it is the one string here that must stay a full descriptive sentence.
        description:
          'Ejercicios cortos de inglés técnico, organizados por nivel y por punto gramatical, con corrección al instante.',
        // MAINTAINER-AUTHORED, VERBATIM. "Elige" is TUTEO, and the standing
        // neutral-Spanish rule bans REGIONAL forms (`Elegí`), not the second
        // person as a category — so this passes `neutralSpanish.ts` unchanged
        // and was NOT rewritten into an infinitive to match `chooseLevel`.
        // Asserted exactly in `i18n.test.ts` so a future "consistency" pass has
        // to argue with a red test instead of quietly editing the maintainer.
        intro: 'Elige un nivel y tema para practicar en el día a día',
        chooseLevel: 'Elegir nivel',
        // The grid under a level lists LANGUAGE POINTS, not settings: someone
        // arriving here wants "conditionals", not "something about airports".
        // This is chrome and localizes; the point NAMES themselves are exercise
        // data and stay English (`FOCUS_LABELS`).
        focusesTitle: 'Puntos gramaticales',
        // Rendered as "1 ejercicio" / "7 ejercicios" — the number is prepended
        // by the page, so these stay plain nouns.
        exerciseOne: 'ejercicio',
        exerciseMany: 'ejercicios',
        empty:
          'Todavía no hay ejercicios publicados. Estamos preparando los primeros y van a estar disponibles en unos días.',
        emptyLevel: 'Todavía no hay ejercicios para este nivel.',
        emptyPair:
          'Todavía no hay ejercicios de este punto gramatical en este nivel. Probar con otro punto.',
        // Accessible name for the magnifier filter over the language-point grid.
        // It is the ONLY name that control has: the trigger is an icon and the
        // input carries a blank placeholder so the bar can animate open, so
        // without this a screen reader announces nothing but "edit text".
        searchFocus: 'Buscar puntos gramaticales',
        // Shown only when a typed query hides every card. Distinct from
        // `emptyLevel` on purpose: that one means "nothing is published here",
        // this one means "your query matched nothing" — collapsing them would
        // tell the user the level is empty when it is full.
        focusesNoResults: 'No hay puntos gramaticales que coincidan con la búsqueda.',
      },
      // Display names for the CEFR levels. The URL keeps the bare code; the
      // screen adds what it means, because "B1" alone tells a beginner nothing.
      levels: {
        A1: 'Principiante',
        A2: 'Básico',
        B1: 'Intermedio',
        B2: 'Intermedio alto',
        C1: 'Avanzado',
        C2: 'Dominio',
      },
      // NO `focuses` / `topics` / `skills` maps here, deliberately. Those are
      // exercise DATA, not chrome: their display labels are English in every
      // locale and live in `exerciseTaxonomy` (`FOCUS_LABELS` / `TOPIC_LABELS` /
      // `SKILL_LABELS`), beside the slugs they name. See
      // docs/exercise-model.md, "Authoring rules".
      //
      // Copy for the exercise detail route `/[lang]/ingles/[level]/[focus]/[slug]`.
      exercise: {
        back: 'Volver a inglés',
        level: 'Nivel',
        // A `<meta name="description">`, so it describes rather than instructs:
        // a noun phrase keeps it neutral without an infinitive standing alone.
        description:
          'Práctica de inglés técnico con ejercicios cortos y corrección al instante.',
        // Several phrasings instead of one. "Más ejercicios de este nivel" was
        // literally true and read like a description of the query behind it.
        // The route picks one DETERMINISTICALLY from the exercise slug
        // (`pickStable` in `exerciseCopy.ts`), so a given page always reads the
        // same way — a random pick on the SSR render path would change the
        // heading on every reload and read as a glitch.
        relatedHeadings: [
          'Otros ejercicios',
          'Tal vez te interese',
          'Para seguir practicando',
        ],
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
      courses: 'Courses',
      englishLink: 'English',
      english: 'English',
      soon: 'Soon',
      switchTo: 'Switch to',
    },
    footer: { terms: 'Terms & Conditions', privacy: 'Privacy' },
    legal: {
      titles: { terms: 'Terms and conditions', privacy: 'Privacy policy' },
      pending: 'Legal content pending',
      privacyNote:
        'We respect your privacy. We are still drafting the full version of this document; in the meantime, we do not sell or share your personal data with third parties.',
    },
    news: { readMore: 'Read more' },
    article: { back: 'Back to news' },
    notFound: {
      title: 'Page not found',
      body: 'The page you are looking for does not exist or was moved.',
      home: 'Back to home',
    },
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
      section: {
        // Matches the Spanish move: name the section, not its audience.
        title: 'English exercises',
        description:
          'Short technical English exercises, organized by level and language point, with instant feedback.',
        // Mirrors the new Spanish subtitle's brevity and meaning — one line, an
        // instruction, no trailing period, and the same two choices ("nivel y
        // tema"). "practise" is this repo's spelling throughout.
        intro: 'Pick a level and a topic to practise day to day',
        chooseLevel: 'Choose your level',
        focusesTitle: 'Language points',
        exerciseOne: 'exercise',
        exerciseMany: 'exercises',
        empty:
          'No exercises published yet. We are preparing the first ones — check back in a few days.',
        emptyLevel: 'No exercises at this level yet.',
        emptyPair:
          'No exercises for this language point at this level yet. Try another one.',
        searchFocus: 'Search language points',
        focusesNoResults: 'No language points match that search.',
      },
      levels: {
        A1: 'Beginner',
        A2: 'Elementary',
        B1: 'Intermediate',
        B2: 'Upper intermediate',
        C1: 'Advanced',
        C2: 'Proficient',
      },
      // No `focuses` / `topics` / `skills` here either — see the `es` block.
      exercise: {
        back: 'Back to English',
        level: 'Level',
        description: 'Practice technical English with short exercises and instant feedback.',
        relatedHeadings: [
          'More exercises',
          'You might also like',
          'Keep practising',
        ],
      },
    },
  },
} as const satisfies Record<Lang, unknown>;

