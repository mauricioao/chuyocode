import { describe, it, expect } from 'vitest';
import { VARIOS_JUEGOS_ENABLED, CHANGE_MOLD_ENABLED } from './flags';

describe('activity flags', () => {
  it('keeps "Varios juegos" creation and discovery hidden (owner decision 2026-10-19)', () => {
    expect(VARIOS_JUEGOS_ENABLED).toBe(false);
  });

  it('keeps "Cambiar molde" hidden (owner decision 2026-10-19 follow-up)', () => {
    expect(CHANGE_MOLD_ENABLED).toBe(false);
  });
});
