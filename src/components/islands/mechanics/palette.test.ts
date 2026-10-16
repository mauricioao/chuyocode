/**
 * palette.ts tests — the shared "colour by position" tile palette, now ONE
 * module behind both the presentation stage's option tiles
 * (`PresentationIsland.tsx`) and the big-stage drag chips' colour-filled
 * variant (`chip.ts`'s `stageChipColorClass`). See that module's own header
 * for why this module exists at all.
 */
import { describe, expect, it } from 'vitest';
import { TILE_COLOR_CLASSES, optionColorClass } from './palette';

describe('palette (shared tile colour set)', () => {
  it('exposes exactly the six `bg-tile-*` kit token classes, in order', () => {
    expect(TILE_COLOR_CLASSES).toEqual(['bg-tile-1', 'bg-tile-2', 'bg-tile-3', 'bg-tile-4', 'bg-tile-5', 'bg-tile-6']);
  });

  it('never a Tailwind default-palette or raw hex class (no second colour system)', () => {
    for (const cls of TILE_COLOR_CLASSES) {
      expect(cls).toMatch(/^bg-tile-[1-6]$/);
    }
  });

  it('maps a 0-based index to the matching 1-based token class', () => {
    expect(optionColorClass(0)).toBe('bg-tile-1');
    expect(optionColorClass(1)).toBe('bg-tile-2');
    expect(optionColorClass(5)).toBe('bg-tile-6');
  });

  it('cycles once every six indices, so a run of six consecutive positions never repeats a colour', () => {
    const run = Array.from({ length: 6 }, (_, i) => optionColorClass(i));
    expect(new Set(run).size).toBe(6);
    expect(optionColorClass(6)).toBe(optionColorClass(0));
    expect(optionColorClass(7)).toBe(optionColorClass(1));
  });
});
