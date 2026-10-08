import { describe, it, expect } from 'vitest';
import {
  STAGE_BOX_MIN_HEIGHT_SCALE,
  STAGE_CONTAINER,
  STAGE_CONTAINER_SIZE,
  STAGE_TWO_COL_GRID,
  TILE_MIN_HEIGHT_SCALE,
  TILE_PADDING_X_SCALE,
  TILE_PADDING_Y_SCALE,
  TILE_TEXT_SCALE,
} from './scale';

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
