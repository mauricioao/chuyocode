import { describe, it, expect } from 'vitest';
import {
  LEVELS,
  SKILLS,
  SKILL_LABELS,
  TOPICS,
  TOPIC_LABELS,
} from './exerciseTaxonomy';
import { findVoseo, voseoWords } from './neutralSpanish';
import {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  UI_LABELS,
  isValidLang,
  getDefaultLang,
  resolveLang,
} from './i18n';

/** Every string reachable under `value`, at any depth, in arrays or objects. */
function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}

describe('SUPPORTED_LANGS / DEFAULT_LANG', () => {
  it('supports exactly es and en', () => {
    expect([...SUPPORTED_LANGS]).toEqual(['es', 'en']);
  });

  it('defaults to es', () => {
    expect(DEFAULT_LANG).toBe('es');
    expect(getDefaultLang()).toBe('es');
  });
});

describe('isValidLang', () => {
  // Spec 5 — Scenario: Valid lang prefix.
  it('accepts supported langs', () => {
    expect(isValidLang('es')).toBe(true);
    expect(isValidLang('en')).toBe(true);
  });

  // Spec 5 — Scenario: Invalid lang.
  it('rejects unsupported langs', () => {
    expect(isValidLang('fr')).toBe(false);
    expect(isValidLang('EN')).toBe(false); // case-sensitive segment
    expect(isValidLang('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidLang(undefined)).toBe(false);
    expect(isValidLang(null)).toBe(false);
    expect(isValidLang(42)).toBe(false);
  });
});

describe('resolveLang', () => {
  it('returns default when header is absent', () => {
    expect(resolveLang()).toBe('es');
    expect(resolveLang(undefined)).toBe('es');
    expect(resolveLang(null)).toBe('es');
    expect(resolveLang('')).toBe('es');
  });

  it('returns default when no supported lang is present', () => {
    expect(resolveLang('fr-FR,fr;q=0.9,de;q=0.8')).toBe('es');
  });

  it('matches a supported primary subtag', () => {
    expect(resolveLang('en-US,en;q=0.9')).toBe('en');
    expect(resolveLang('es-PE,es;q=0.9')).toBe('es');
  });

  it('picks the highest-quality supported lang', () => {
    // fr has highest q but is unsupported; en (0.8) beats es (0.5).
    expect(resolveLang('fr;q=1.0,en;q=0.8,es;q=0.5')).toBe('en');
  });

  it('treats missing q as 1.0', () => {
    expect(resolveLang('en,es;q=0.9')).toBe('en');
  });

  it('is case-insensitive on the header tag', () => {
    expect(resolveLang('EN-us')).toBe('en');
  });
});

describe('UI_LABELS — article-reading keys', () => {
  // Spec 5: UI Labels — no hardcoded UI strings; article chrome + read-more
  // labels MUST exist for both es and en.
  it('exposes news.readMore for both locales', () => {
    expect(UI_LABELS.es.news.readMore).toBe('Leer más');
    expect(UI_LABELS.en.news.readMore).toBe('Read more');
  });

  it('exposes article.back for both locales', () => {
    expect(typeof UI_LABELS.es.article.back).toBe('string');
    expect(typeof UI_LABELS.en.article.back).toBe('string');
    expect(UI_LABELS.es.article.back.length).toBeGreaterThan(0);
    expect(UI_LABELS.en.article.back.length).toBeGreaterThan(0);
  });
});

describe('UI_LABELS — home-streaming keys', () => {
  // PR 3 (home-streaming): hero storytelling, row titles, and static teaser
  // copy MUST exist for both es and en (spec 5: no hardcoded UI strings).
  const locales = ['es', 'en'] as const;

  it('exposes all home.hero keys for both locales', () => {
    for (const l of locales) {
      const hero = UI_LABELS[l].home.hero;
      for (const key of [
        'headline',
        'subline',
        'primaryCta',
        'secondaryCta',
        'imageAlt',
      ] as const) {
        expect(typeof hero[key]).toBe('string');
        expect(hero[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes all home.rows titles for both locales', () => {
    for (const l of locales) {
      const rows = UI_LABELS[l].home.rows;
      for (const key of [
        'viewAll',
        'featuredBooks',
        'latestArticles',
        'courses',
        'english',
      ] as const) {
        expect(typeof rows[key]).toBe('string');
        expect(rows[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes courses.teaser copy for both locales', () => {
    for (const l of locales) {
      const teaser = UI_LABELS[l].courses.teaser;
      for (const key of ['badge', 'title', 'description', 'imageAlt'] as const) {
        expect(typeof teaser[key]).toBe('string');
        expect(teaser[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes english.exercise copy for both locales', () => {
    for (const l of locales) {
      const exercise = UI_LABELS[l].english.exercise;
      for (const key of ['back', 'level', 'description'] as const) {
        expect(typeof exercise[key]).toBe('string');
        expect(exercise[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('offers several phrasings for the related-exercises heading', () => {
    // "Más ejercicios de este nivel" was literally true and read like a
    // database description. Several warmer phrasings, picked deterministically
    // from the exercise slug so a given page always reads the same way.
    for (const l of locales) {
      const headings = UI_LABELS[l].english.exercise.relatedHeadings;
      expect(Array.isArray(headings)).toBe(true);
      expect(headings.length).toBeGreaterThan(1);
      for (const heading of headings) {
        expect(typeof heading).toBe('string');
        expect(heading.trim().length).toBeGreaterThan(0);
      }
      // Duplicates would make the "variety" a lie for part of the catalogue.
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  it('does not keep the single literal related heading it replaced', () => {
    for (const l of locales) {
      expect('related' in UI_LABELS[l].english.exercise).toBe(false);
    }
  });

  it('localizes the exercise route copy differently per locale', () => {
    expect(UI_LABELS.es.english.exercise.back).not.toBe(
      UI_LABELS.en.english.exercise.back,
    );
  });

  it('distinguishes es from en for the hero headline', () => {
    expect(UI_LABELS.es.home.hero.headline).not.toBe(
      UI_LABELS.en.home.hero.headline,
    );
  });
});

describe('UI_LABELS — english section keys', () => {
  // The English section entry + listing routes. Every string these two routes
  // render must exist in both locales BEFORE the routes ship — a missing key
  // would surface as `undefined` in the page, which typecheck and the
  // status-code page tests both fail to catch.
  const locales = ['es', 'en'] as const;

  it('exposes english.section copy for both locales', () => {
    for (const l of locales) {
      const section = UI_LABELS[l].english.section;
      for (const key of [
        'title',
        'description',
        'intro',
        'chooseLevel',
        'topicsTitle',
        'exerciseOne',
        'exerciseMany',
        'empty',
        'emptyLevel',
        'emptyPair',
      ] as const) {
        expect(typeof section[key]).toBe('string');
        expect(section[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes a display label for every CEFR level in both locales', () => {
    for (const l of locales) {
      const levels = UI_LABELS[l].english.levels;
      // Driven off the taxonomy: adding a level without copy fails HERE rather
      // than rendering an empty chip in production.
      for (const level of LEVELS) {
        expect(typeof levels[level]).toBe('string');
        expect(levels[level].length).toBeGreaterThan(0);
      }
    }
  });

  it('ships NO per-locale topic or skill label map', () => {
    // `topic` and `skill` are exercise DATA, not chrome. Their display labels
    // are English in every locale and live in `exerciseTaxonomy`, beside the
    // slugs they name. A per-locale map here is exactly the mistake this test
    // exists to stop coming back — it made the same row read "Escritura" under
    // /es and "Writing" under /en while the exercise itself stayed English.
    for (const l of locales) {
      expect('topics' in UI_LABELS[l].english).toBe(false);
      expect('skills' in UI_LABELS[l].english).toBe(false);
    }
  });

  it('keeps the taxonomy labels out of the locale maps entirely', () => {
    // Stronger than the key check above: no locale value anywhere under
    // `english` may equal a taxonomy label, which would mean a copy of the map
    // was smuggled back under a different key.
    const taxonomyLabels = new Set<string>([
      ...TOPICS.map((topic) => TOPIC_LABELS[topic]),
      ...SKILLS.map((skill) => SKILL_LABELS[skill]),
    ]);
    expect(taxonomyLabels.size).toBeGreaterThan(0);
    for (const l of locales) {
      for (const value of flattenStrings(UI_LABELS[l].english)) {
        expect(taxonomyLabels.has(value)).toBe(false);
      }
    }
  });

  it('localizes the section copy (es vs en)', () => {
    expect(UI_LABELS.es.english.section.chooseLevel).not.toBe(
      UI_LABELS.en.english.section.chooseLevel,
    );
    expect(UI_LABELS.es.english.levels.A1).not.toBe(
      UI_LABELS.en.english.levels.A1,
    );
  });

  it('no longer ships the "coming soon" teaser now that the section exists', () => {
    // The placeholder promised a section that was not built yet. It IS built,
    // so leaving the copy behind invites it back onto a page.
    for (const l of locales) {
      expect('teaser' in UI_LABELS[l].english).toBe(false);
    }
  });
});

describe('UI_LABELS — nav-structure keys', () => {
  // PR 4 (nav-structure): the disabled English nav slot label + "coming soon"
  // badge, and the legal-page titles/placeholder copy MUST exist for both
  // locales (spec 5: no hardcoded UI strings).
  const locales = ['es', 'en'] as const;

  it('exposes nav.english + nav.soon for both locales', () => {
    for (const l of locales) {
      expect(typeof UI_LABELS[l].nav.english).toBe('string');
      expect(UI_LABELS[l].nav.english.length).toBeGreaterThan(0);
      expect(typeof UI_LABELS[l].nav.soon).toBe('string');
      expect(UI_LABELS[l].nav.soon.length).toBeGreaterThan(0);
    }
  });

  it('localizes the "coming soon" badge (es vs en)', () => {
    expect(UI_LABELS.es.nav.soon).toBe('Pronto');
    expect(UI_LABELS.en.nav.soon).toBe('Soon');
  });

  it('exposes legal.titles for terms and privacy in both locales', () => {
    for (const l of locales) {
      const titles = UI_LABELS[l].legal.titles;
      for (const key of ['terms', 'privacy'] as const) {
        expect(typeof titles[key]).toBe('string');
        expect(titles[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes legal placeholder + privacy note for both locales', () => {
    for (const l of locales) {
      const legal = UI_LABELS[l].legal;
      expect(typeof legal.pending).toBe('string');
      expect(legal.pending.length).toBeGreaterThan(0);
      expect(typeof legal.privacyNote).toBe('string');
      expect(legal.privacyNote.length).toBeGreaterThan(0);
    }
  });
});

describe('UI_LABELS — motion-polish (SEO) keys', () => {
  // PR 5 (motion-polish): BaseLayout falls back to localized meta descriptions
  // (decision #7). These MUST exist for both locales so no page is shipped
  // without a description, and es/en must differ.
  const locales = ['es', 'en'] as const;

  it('exposes meta descriptions for both locales', () => {
    for (const l of locales) {
      const meta = UI_LABELS[l].meta;
      for (const key of [
        'siteDescription',
        'booksDescription',
        'newsDescription',
      ] as const) {
        expect(typeof meta[key]).toBe('string');
        expect(meta[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('localizes the site description (es vs en)', () => {
    expect(UI_LABELS.es.meta.siteDescription).not.toBe(
      UI_LABELS.en.meta.siteDescription,
    );
  });
});

describe('UI_LABELS — 404 keys', () => {
  // The 404 copy used to live in a local map inside `404.astro`. Astro
  // frontmatter cannot be imported by a test, so that map was unreachable by
  // any guard — and it is exactly where a voseo survived the English-section
  // sweep. Centralizing it is what makes the site-wide guard below honest.
  const locales = ['es', 'en'] as const;

  it('exposes notFound copy for both locales', () => {
    for (const l of locales) {
      const notFound = UI_LABELS[l].notFound;
      for (const key of ['title', 'body', 'home'] as const) {
        expect(typeof notFound[key]).toBe('string');
        expect(notFound[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('localizes the 404 copy (es vs en)', () => {
    expect(UI_LABELS.es.notFound.title).not.toBe(UI_LABELS.en.notFound.title);
  });
});

describe('UI_LABELS — neutral Spanish, SITE-WIDE', () => {
  // STANDING PROJECT RULE, and no longer scoped to the English section.
  //
  // ChuyoCode serves the whole Latin community, not Argentina, so regional
  // (Rioplatense) verb forms must not reach the UI anywhere. The register is
  // impersonal: the infinitive for instructions ("Revisar las respuestas",
  // "Probar con otro tema") and impersonal prose for descriptions — no
  // second-person verb at all, which removes the tú/vos fork at the root
  // instead of picking a side of it.
  //
  // Possessives (`tu idioma`) are deliberately still allowed: identical in
  // tuteo and voseo, so they carry no regional signal.

  it('detects voseo when it IS there (the guard below is not vacuous)', () => {
    // Triangulation. `findVoseo` returning `[]` is the pass condition below, so
    // a detector that matched nothing would make that guard permanently green.
    // Full rule-by-rule coverage lives in `neutralSpanish.test.ts`; this proves
    // the detector THIS FILE imports fires on copy this repo actually shipped.
    expect(voseoWords('Elegí tu nivel y practicá con ejercicios cortos.')).toEqual(
      ['Elegí', 'practicá'],
    );
    expect(voseoWords('Aprendé tecnología en tu idioma')).toEqual(['Aprendé']);
    expect(voseoWords('La página que buscás no existe.')).toEqual(['buscás']);
    expect(voseoWords('Muy pronto vas a poder aprender.')).toEqual(['vas']);
    // ...and stays silent on ordinary Spanish that happens to end in a stress.
    expect(
      voseoWords('Practicar inglés aquí, así, cuando esté todo listo. Leer más.'),
    ).toEqual([]);
  });

  it('reports the offending KEY alongside the offending word', () => {
    // A guard that only names the word leaves the author grepping for it. The
    // failure output has to point at the exact copy entry to fix.
    expect(
      findVoseo({ home: { hero: { headline: 'Aprendé tecnología' } } }),
    ).toEqual(['home.hero.headline: Aprendé']);
  });

  it('writes ALL of the Spanish UI copy in neutral Spanish, with no voseo', () => {
    // Not `UI_LABELS.es.english` any more — the whole locale map. Every Spanish
    // string the site renders from here is covered.
    const strings = flattenStrings(UI_LABELS.es);
    expect(strings.length).toBeGreaterThan(50);
    expect(findVoseo(UI_LABELS.es)).toEqual([]);
  });
});
