// @vitest-environment jsdom
/**
 * button.tsx — `press` variant regression guard.
 *
 * Every shadcn button gets `active:not-aria-[haspopup]:translate-y-px` for a
 * tactile "press" affordance. That utility shares the same underlying
 * transform slot as any `translate-y-*` a caller uses for its OWN
 * positioning (e.g. a `-translate-y-1/2` vertical-center trick), so on
 * `:active` it silently replaces that positioning instead of composing with
 * it — this is the root cause of the carousel/row arrow buttons visibly
 * "dodging" on click (see `carousel.test.tsx` and `EditorialRow.test.ts`).
 *
 * `press="none"` opts a button OUT of that utility entirely (the class is
 * absent from the string, not merely overridden), so any control positioned
 * with its own transform — or that simply must never move on click, like an
 * arrow control — can ask for it.
 */
import { describe, it, expect } from 'vitest';
import { buttonVariants } from './button';

describe('buttonVariants — press', () => {
  it('includes the active-press translate utility by default', () => {
    expect(buttonVariants()).toContain('translate-y-px');
  });

  it('omits the active-press translate utility entirely when press="none"', () => {
    const classes = buttonVariants({ press: 'none' });
    expect(classes).not.toMatch(/translate-y-px/);
  });
});
