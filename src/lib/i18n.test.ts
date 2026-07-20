import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  UI_LABELS,
  isValidLang,
  getDefaultLang,
  resolveLang,
} from './i18n';

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

  it('exposes english.teaser copy for both locales', () => {
    for (const l of locales) {
      const teaser = UI_LABELS[l].english.teaser;
      for (const key of ['badge', 'title', 'description', 'imageAlt'] as const) {
        expect(typeof teaser[key]).toBe('string');
        expect(teaser[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('distinguishes es from en for the hero headline', () => {
    expect(UI_LABELS.es.home.hero.headline).not.toBe(
      UI_LABELS.en.home.hero.headline,
    );
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
