import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_POSES,
  GAME_RESULT_OUTCOME_POSES,
  characterPoseFallbackSrc,
  characterPoseFraming,
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

describe('pose framing (GameResult "equal head size" sizing)', () => {
  it('gives every GameResult outcome pose a framing with headTop/chin/abdomen fractions, in that order down the body', () => {
    for (const pose of GAME_RESULT_OUTCOME_POSES) {
      // Goes through the public `characterPoseFraming` (never reaches into
      // `RESULT_POSE_FRAMING` directly) — it's typed to exactly the 3
      // outcome-pose keys, so every `GAME_RESULT_OUTCOME_POSES` entry
      // resolving without throwing already proves the map covers all 3.
      const framing = characterPoseFraming(pose);
      expect(framing.headTop).toBeGreaterThanOrEqual(0);
      expect(framing.headTop).toBeLessThan(1);
      // `abdomen` is `<= 1` always — a bust master whose canvas never
      // reaches a real abdomen sets it to exactly `1` (its own bottom edge,
      // never an extrapolated guess past it — `global.css`'s own
      // `min(var(--pose-abdomen), 1)` is the defensive CSS-side backstop
      // for this same invariant).
      expect(framing.abdomen).toBeGreaterThan(0);
      expect(framing.abdomen).toBeLessThanOrEqual(1);
      // The chin sits strictly between the head top and the abdomen line —
      // enough of a head-top-to-chin gap to actually show a meaningful
      // head slice (never near-zero), and never past the abdomen/bottom
      // edge.
      expect(framing.chin - framing.headTop).toBeGreaterThan(0.1);
      expect(framing.chin).toBeLessThanOrEqual(framing.abdomen);
    }
  });

  it('characterPoseFraming returns the same values as the registry', () => {
    expect(characterPoseFraming('vanina/celebra')).toEqual({ headTop: 0.067, chin: 0.27, abdomen: 0.47 });
    expect(characterPoseFraming('vanina/pulgar-arriba')).toEqual({ headTop: 0.019, chin: 0.285, abdomen: 1 });
    expect(characterPoseFraming('vanina/casi')).toEqual({ headTop: 0.019, chin: 0.3, abdomen: 0.78 });
  });

  it('gives pulgar-arriba an abdomen of exactly 1 — its bust-shot canvas never reaches a real abdomen, so the crop rests on its own bottom edge instead of an extrapolated guess (bugfix: that guess used to inflate her whole image, head included, ~25% bigger than the other two outcome poses)', () => {
    expect(characterPoseFraming('vanina/pulgar-arriba').abdomen).toBe(1);
  });

  it('characterPoseFraming throws for a pose with no framing metadata, instead of silently sizing it wrong', () => {
    expect(() => characterPoseFraming('vanina/avatar')).toThrow(/no framing metadata/);
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
    expect(characterPoseFallbackSrc('vanina/celebra')).toBe('/images/characters/vanina/celebra-251.webp');
  });

  it('reports the 1x file width for the <img width> attribute', () => {
    expect(characterPoseWidth('vanina/casi')).toBe(335);
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

/**
 * preloadCharacterPoses — bugfix (owner report: "Vanina aparece de golpe";
 * verified diagnosis: nothing ever preloaded the 3 outcome poses, so the
 * `<img>` only became paintable well after `GameResult`'s own CSS entrance
 * had already finished playing). Each test gets a FRESH module instance
 * (`vi.resetModules` + a dynamic re-import) so the function's own one-shot
 * guard never leaks between tests — this module has no React/JSX, so a
 * fresh instance per test is safe (no risk of a second React copy).
 */
describe('preloadCharacterPoses', () => {
  function stubImageConstructor() {
    class MockImage {
      src = '';
      srcset = '';
    }
    const instances: MockImage[] = [];
    vi.stubGlobal(
      'Image',
      class extends MockImage {
        constructor() {
          super();
          instances.push(this);
        }
      },
    );
    return instances;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing on the server, where there is no global Image constructor at all', async () => {
    vi.resetModules();
    const fresh = await import('./characterPoses');
    expect(() => fresh.preloadCharacterPoses()).not.toThrow();
  });

  it('warms both avif and webp srcset candidates for all 3 GameResult outcome poses', async () => {
    vi.resetModules();
    const instances = stubImageConstructor();
    const fresh = await import('./characterPoses');
    fresh.preloadCharacterPoses();
    expect(instances).toHaveLength(fresh.GAME_RESULT_OUTCOME_POSES.length * 2);
    for (const pose of fresh.GAME_RESULT_OUTCOME_POSES) {
      for (const format of ['avif', 'webp'] as const) {
        const expectedSrcset = fresh.characterPoseSrcSet(pose, format);
        const match = instances.find((img) => img.srcset === expectedSrcset);
        expect(match, `expected a preloaded Image for ${pose} (${format})`).toBeTruthy();
        expect(match!.src).toBe(fresh.characterPoseFallbackSrc(pose));
      }
    }
  });

  it('is idempotent for the page\'s whole life — a second call issues no further requests', async () => {
    vi.resetModules();
    const instances = stubImageConstructor();
    const fresh = await import('./characterPoses');
    fresh.preloadCharacterPoses();
    fresh.preloadCharacterPoses();
    expect(instances).toHaveLength(fresh.GAME_RESULT_OUTCOME_POSES.length * 2);
  });
});
