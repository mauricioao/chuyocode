/**
 * The shared arrow control — the little that is actually worth proving.
 *
 * This module is mostly constants, and a test that restates a constant proves
 * nothing. What IS worth pinning is the pair of failure modes that ship quietly
 * because both arrows still LOOK like arrows:
 *
 *   1. Both directions resolving to the same glyph, so prev and next point the
 *      same way. Two consumers now read this map; one wrong key is invisible in
 *      a diff and obvious to a learner.
 *   2. The glyph losing `aria-hidden`, which would let a chevron compete with
 *      the button's `aria-label` for the accessible name.
 */
import { describe, it, expect } from 'vitest';
import { CHEVRON_PATH, chevronSvgMarkup } from './arrowControl';

describe('arrowControl', () => {
  it('points the two chevrons in opposite directions', () => {
    expect(CHEVRON_PATH.prev).not.toBe(CHEVRON_PATH.next);
    expect(chevronSvgMarkup('prev')).toContain(CHEVRON_PATH.prev);
    expect(chevronSvgMarkup('next')).toContain(CHEVRON_PATH.next);
    expect(chevronSvgMarkup('prev')).not.toContain(CHEVRON_PATH.next);
  });

  it('hides the glyph from assistive tech so the button name stands alone', () => {
    for (const direction of ['prev', 'next'] as const) {
      expect(chevronSvgMarkup(direction)).toContain('aria-hidden="true"');
    }
  });
});
