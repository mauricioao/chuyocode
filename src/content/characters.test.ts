import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_WIDTHS, characterFallbackSrc, characterSrcSet, type CharacterSlug } from './characters';

describe('CHARACTERS registry', () => {
  it('maps every character to the owner-approved Fluent Emoji fallback', () => {
    expect(CHARACTERS.paco.emojiFallback).toBe('llama');
    expect(CHARACTERS.luna.emojiFallback).toBe('books');
    expect(CHARACTERS.mia.emojiFallback).toBe('sparkles');
    expect(CHARACTERS.bruno.emojiFallback).toBe('waving-hand');
    expect(CHARACTERS.tobi.emojiFallback).toBe('rocket');
  });

  it('gives every character an uppercase display name', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.name).toBe(def.name.toUpperCase());
    }
  });

  it('ships real art for every character (phase 2b: Open Peeps busts)', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.ready).toBe(true);
    }
  });

  it('carries an es and en alt text for every character', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.alt.es.length).toBeGreaterThan(0);
      expect(def.alt.en.length).toBeGreaterThan(0);
    }
  });

  it('exposes exactly the five named characters', () => {
    const slugs = Object.keys(CHARACTERS) as CharacterSlug[];
    expect(slugs.sort()).toEqual(['bruno', 'luna', 'mia', 'paco', 'tobi']);
  });
});

describe('characterSrcSet / characterFallbackSrc', () => {
  it('builds a versioned, density-descriptor srcset per format, under /images/characters/', () => {
    expect(characterSrcSet('paco', 'avif')).toBe(
      '/images/characters/paco-v2-128.avif 1x, /images/characters/paco-v2-256.avif 2x',
    );
    expect(characterSrcSet('paco', 'webp')).toBe(
      '/images/characters/paco-v2-128.webp 1x, /images/characters/paco-v2-256.webp 2x',
    );
  });

  it('falls back to the smallest WebP width', () => {
    expect(characterFallbackSrc('luna')).toBe('/images/characters/luna-v2-128.webp');
  });
});

describe('generated character assets on disk', () => {
  // Every `ready: true` character must have actually shipped its optimized
  // AVIF + WebP pair at every width `characterSrcSet` promises — otherwise
  // the registry and the real `public/images/characters/` directory drift
  // apart silently (a build still succeeds; only the <img> 404s at runtime).
  const PUBLIC_CHARACTERS_DIR = join(process.cwd(), 'public', 'images', 'characters');
  const FORMATS = ['avif', 'webp'] as const;

  for (const slug of Object.keys(CHARACTERS) as CharacterSlug[]) {
    const def = CHARACTERS[slug];
    if (!def.ready) continue;

    it(`${slug} has every width/format file characterSrcSet promises`, () => {
      for (const width of CHARACTER_WIDTHS) {
        for (const format of FORMATS) {
          const file = join(PUBLIC_CHARACTERS_DIR, `${slug}-v2-${width}.${format}`);
          expect(existsSync(file), file).toBe(true);
        }
      }
    });
  }
});
