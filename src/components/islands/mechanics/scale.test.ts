import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';
import {
  PROMPT_SCALE,
  STAGE_BOTTOM_RESERVE_CLASS,
  STAGE_BOX_MIN_HEIGHT_SCALE,
  STAGE_CONTAINER,
  STAGE_CONTAINER_SIZE,
  STAGE_SAFE_INSET_CLASS,
  STAGE_SCROLL_PADDING_CLASS,
  STAGE_TWO_COL_GRID,
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
} from './scale';

describe('PROMPT_SCALE — the exercise prompt/sentence font-size ramp (UI-kit refactor)', () => {
  it('stays a mobile-first stepped ramp: text-xl at rest, one sm: bump for a bigger phone/tablet', () => {
    expect(PROMPT_SCALE).toMatch(/^text-xl\b/);
    expect(PROMPT_SCALE).toMatch(/\bsm:text-2xl\b/);
  });

  it('the desktop step is gated on `desk:` (1100px, DeskWindow.astro\'s own chrome breakpoint), never `lg:`', () => {
    expect(PROMPT_SCALE).not.toMatch(/\blg:/);
    expect(PROMPT_SCALE).toMatch(/\bdesk:text-\[/);
  });

  it('lands on the owner\'s ~44px "readable from the back of the room" desktop size, the SAME ceiling TILE_TEXT_SCALE\'s own clamp uses — never a second, independently tuned number', () => {
    expect(PROMPT_SCALE).toMatch(/\bdesk:text-\[2\.75rem\]$/);
    expect(TILE_TEXT_SCALE).toContain('2.75rem');
  });
});

describe('scale — shared game-stage sizing tokens (visual-polish pass)', () => {
  it('STAGE_CONTAINER marks a stage root as a width-only size container', () => {
    expect(STAGE_CONTAINER).toBe('@container');
  });

  it('STAGE_CONTAINER_SIZE marks a stage root with a known height as a full (both-axis) size container, unlocking cqh', () => {
    expect(STAGE_CONTAINER_SIZE).toBe('[container-type:size]');
  });

  it('TILE_TEXT_SCALE is a container-query clamp bounded by BOTH axes (cqw and cqh), not a fixed/viewport-breakpoint size', () => {
    expect(TILE_TEXT_SCALE).toMatch(/^text-\[clamp\(.+min\(.*cqw.*,.*cqh.*\).+\)\]$/);
  });

  it('TILE_PADDING_X_SCALE and TILE_PADDING_Y_SCALE are dual-axis container-query clamps too', () => {
    expect(TILE_PADDING_X_SCALE).toMatch(/^px-\[clamp\(.+min\(.*cqw.*,.*cqh.*\).+\)\]$/);
    expect(TILE_PADDING_Y_SCALE).toMatch(/^py-\[clamp\(.+min\(.*cqw.*,.*cqh.*\).+\)\]$/);
  });

  it('TILE_MIN_HEIGHT_SCALE and STAGE_BOX_MIN_HEIGHT_SCALE are dual-axis container-query clamps', () => {
    expect(TILE_MIN_HEIGHT_SCALE).toMatch(/^min-h-\[clamp\(.+min\(.*cqw.*,.*cqh.*\).+\)\]$/);
    expect(STAGE_BOX_MIN_HEIGHT_SCALE).toMatch(/^min-h-\[clamp\(.+min\(.*cqw.*,.*cqh.*\).+\)\]$/);
  });

  it('STAGE_TWO_COL_GRID is a container-query grid (not a viewport breakpoint) with a one-column floor', () => {
    expect(STAGE_TWO_COL_GRID).toBe('grid-cols-1 @lg:grid-cols-2');
  });

  it('a multi-tile container floor (STAGE_BOX_MIN_HEIGHT_SCALE) never sits below one tile\'s own floor (TILE_MIN_HEIGHT_SCALE)', () => {
    const floorOf = (token: string): number => {
      const match = token.match(/clamp\((\d+(?:\.\d+)?)rem/);
      if (!match) throw new Error(`no rem floor found in ${token}`);
      return Number(match[1]);
    };
    expect(floorOf(STAGE_BOX_MIN_HEIGHT_SCALE)).toBeGreaterThan(floorOf(TILE_MIN_HEIGHT_SCALE));
  });
});

describe('STAGE_SCROLL_PADDING_CLASS — mobile-pass BLOCKER bugfix (floating Comprobar clipped the last row)', () => {
  // Documents the actual bug: every big-stage mould used to combine these
  // two tokens directly, and `cn` (tailwind-merge) silently keeps only the
  // LATER one of a conflicting "all sides" vs "one side" padding pair —
  // regardless of which is more specific — so the 80px bottom reserve never
  // actually rendered, only the 16px safe inset.
  it('the OLD combo (STAGE_BOTTOM_RESERVE_CLASS then STAGE_SAFE_INSET_CLASS) silently drops the bottom reserve', () => {
    const merged = cn(STAGE_BOTTOM_RESERVE_CLASS, STAGE_SAFE_INSET_CLASS).split(' ');
    expect(merged).not.toContain('pb-20');
    expect(merged).toContain('p-[var(--stage-safe-inset)]');
  });

  it('keeps the 80px bottom reserve AND the 16px safe inset on the other three sides, together, regardless of argument order', () => {
    const tokens = cn('overflow-y-auto', STAGE_SCROLL_PADDING_CLASS).split(' ');
    expect(tokens).toContain('pb-20');
    expect(tokens).toContain('pt-[var(--stage-safe-inset)]');
    expect(tokens).toContain('pr-[var(--stage-safe-inset)]');
    expect(tokens).toContain('pl-[var(--stage-safe-inset)]');
  });
});
