import { describe, it, expect } from 'vitest';
import { BACKDROP_PRESETS, backdropCssVar, backdropLabelKey } from './backgrounds';
import type { BackdropPreset } from './blocks';

describe('BACKDROP_PRESETS', () => {
  it('is exactly the five stable, persisted keys, in the proposal\'s own order', () => {
    expect(BACKDROP_PRESETS).toEqual(['sky', 'mint', 'sun', 'lavender', 'slate']);
  });
});

describe('backdropCssVar', () => {
  it.each(BACKDROP_PRESETS)('maps %s to its own --backdrop-%s custom property', (preset) => {
    expect(backdropCssVar(preset)).toBe(`var(--backdrop-${preset})`);
  });
});

describe('backdropLabelKey', () => {
  it('maps every preset to its own i18n key, one to one', () => {
    const expected: Record<BackdropPreset, string> = {
      sky: 'presetSky',
      mint: 'presetMint',
      sun: 'presetSun',
      lavender: 'presetLavender',
      slate: 'presetSlate',
    };
    for (const preset of BACKDROP_PRESETS) {
      expect(backdropLabelKey(preset)).toBe(expected[preset]);
    }
  });

  it('every mapped key is unique (no two presets collide on one label)', () => {
    const keys = BACKDROP_PRESETS.map((preset) => backdropLabelKey(preset));
    expect(new Set(keys).size).toBe(BACKDROP_PRESETS.length);
  });
});
