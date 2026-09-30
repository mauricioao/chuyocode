/**
 * field.ts — the single shared visual system for text-entry controls
 * (input, textarea, styled-native select), consumed by both the React
 * components (`input.tsx`, `textarea.tsx`, `select.tsx`) and raw `.astro`
 * markup via `fieldClasses()`, so neither duplicates the look.
 */
import { describe, it, expect } from 'vitest';
import { fieldBase, fieldClasses } from './field';

describe('fieldBase', () => {
  it('is a filled soft surface with a subtle border and the field radius token', () => {
    expect(fieldBase).toContain('bg-(--color-field)');
    expect(fieldBase).toContain('border-(--color-field-border)');
    expect(fieldBase).toContain('rounded-(--radius-field)');
  });

  it('defines the focus ring using the accent-derived field ring token', () => {
    expect(fieldBase).toContain('focus-visible:ring-(--color-field-ring)');
  });

  it('defines a disabled state', () => {
    expect(fieldBase).toContain('disabled:opacity-50');
    expect(fieldBase).toContain('disabled:cursor-not-allowed');
  });

  it('defines an invalid state distinct from the default border', () => {
    expect(fieldBase).toContain('aria-invalid:border-destructive');
  });
});

describe('fieldClasses', () => {
  it('defaults to 44px on phones and 40px on desktop (responsive height)', () => {
    const classes = fieldClasses();
    expect(classes).toContain('h-(--control-h-lg)');
    expect(classes).toContain('md:h-(--control-h-md)');
  });

  it('supports a fixed size override that is not responsive', () => {
    const classes = fieldClasses({ size: 'sm' });
    expect(classes).toContain('h-(--control-h-sm)');
    expect(classes).not.toContain('md:h-(--control-h-md)');
  });

  it('merges a caller className without dropping the base classes', () => {
    const classes = fieldClasses({ className: 'pr-9' });
    expect(classes).toContain('pr-9');
    expect(classes).toContain('bg-(--color-field)');
  });
});
