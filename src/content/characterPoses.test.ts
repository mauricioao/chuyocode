import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_POSES,
  characterPoseFallbackSrc,
  characterPoseSrcSet,
  characterPoseWidth,
  type CharacterPoseKey,
} from './characterPoses';

describe('CHARACTER_POSES registry', () => {
  it('names only vanina or paco as the character', () => {
    for (const pose of Object.values(CHARACTER_POSES)) {
      expect(['vanina', 'paco']).toContain(pose.character);
    }
  });

  it('keys every entry as "<character>/<slug>", matching its own fields', () => {
    for (const [key, pose] of Object.entries(CHARACTER_POSES)) {
      expect(key).toBe(`${pose.character}/${pose.slug}`);
    }
  });

  it('gives every pose exactly two widths (1x, 2x), smaller first', () => {
    for (const pose of Object.values(CHARACTER_POSES)) {
      expect(pose.widths).toHaveLength(2);
      expect(pose.widths[0]).toBeLessThan(pose.widths[1]);
    }
  });

  it('carries a flushEdge of the one allowed shape', () => {
    for (const pose of Object.values(CHARACTER_POSES)) {
      expect([null, 'top', 'bottom', 'left', 'right']).toContain(pose.flushEdge);
    }
  });
});

describe('characterPoseSrcSet / characterPoseFallbackSrc / characterPoseWidth', () => {
  it('builds a density-descriptor srcset per format, under /images/characters/<character>/', () => {
    expect(characterPoseSrcSet('vanina/avatar', 'avif')).toBe(
      '/images/characters/vanina/avatar-114.avif 1x, /images/characters/vanina/avatar-227.avif 2x',
    );
    expect(characterPoseSrcSet('paco/sentado-borde', 'webp')).toBe(
      '/images/characters/paco/sentado-borde-71.webp 1x, /images/characters/paco/sentado-borde-142.webp 2x',
    );
  });

  it('falls back to the smallest (1x) WebP width', () => {
    expect(characterPoseFallbackSrc('vanina/celebra')).toBe('/images/characters/vanina/celebra-90.webp');
  });

  it('reports the 1x file width for the <img width> attribute', () => {
    expect(characterPoseWidth('vanina/casi')).toBe(119);
  });
});

describe('generated character pose assets on disk', () => {
  // Every pose must have actually shipped its AVIF + WebP pair at every
  // width `characterPoseSrcSet` promises — otherwise the registry and the
  // real `public/images/characters/` directory drift apart silently (a build
  // still succeeds; only the <img> 404s at runtime). See
  // `scripts/characters/export-web.mjs`.
  const PUBLIC_CHARACTERS_DIR = join(process.cwd(), 'public', 'images', 'characters');
  const FORMATS = ['avif', 'webp'] as const;

  for (const key of Object.keys(CHARACTER_POSES) as CharacterPoseKey[]) {
    const pose = CHARACTER_POSES[key];

    it(`${key} has every width/format file characterPoseSrcSet promises`, () => {
      for (const width of pose.widths) {
        for (const format of FORMATS) {
          const file = join(PUBLIC_CHARACTERS_DIR, pose.character, `${pose.slug}-${width}.${format}`);
          expect(existsSync(file), file).toBe(true);
        }
      }
    });
  }
});
