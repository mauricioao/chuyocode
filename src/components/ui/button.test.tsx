// @vitest-environment jsdom
/**
 * button.tsx — `press` variant regression guard, plus variant/loading
 * coverage for the premium design system (PR 1).
 *
 * Every shadcn button gets `active:not-aria-[haspopup]:scale-[0.98]` for a
 * tactile "press" affordance. It used to be `translate-y-px`, which shared
 * the same underlying transform slot as any `translate-y-*` a caller used
 * for its OWN positioning (e.g. a `-translate-y-1/2` vertical-center trick)
 * and silently replaced it on `:active` — root cause of the carousel/row
 * arrow buttons visibly "dodging" on click (see `carousel.test.tsx` and
 * `EditorialRow.test.ts`). `scale` is its own standalone CSS property in
 * Tailwind 4 (not folded into `transform`), so it composes instead.
 *
 * `press="none"` still opts a button OUT of the press utility entirely (the
 * class is absent from the string, not merely overridden), for any control
 * that must never move/scale on click, like an arrow control.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from './button';

describe('buttonVariants — press', () => {
  it('includes the active-press scale utility by default', () => {
    expect(buttonVariants()).toContain('scale-[0.98]');
  });

  it('omits the active-press scale utility entirely when press="none"', () => {
    const classes = buttonVariants({ press: 'none' });
    expect(classes).not.toMatch(/scale-\[0\.98\]/);
  });
});

describe('buttonVariants — variant set', () => {
  it('primary is the same brand-yellow/dark-text look as default', () => {
    expect(buttonVariants({ variant: 'primary' })).toBe(buttonVariants({ variant: 'default' }));
  });

  it('secondary is a filled surface with a subtle border', () => {
    const classes = buttonVariants({ variant: 'secondary' });
    expect(classes).toContain('bg-secondary');
    expect(classes).toContain('border-border');
  });
});

describe('Button — loading state', () => {
  it('sets aria-busy and disables the button while loading', () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('renders a spinner and keeps the label present but visually hidden (stable width)', () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.textContent).toContain('Guardar');
  });

  it('is not busy/disabled when loading is false', () => {
    render(<Button>Guardar</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-busy')).toBeNull();
    expect(btn).toHaveProperty('disabled', false);
  });
});
