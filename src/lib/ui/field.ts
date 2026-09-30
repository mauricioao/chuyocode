import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * field.ts — the single shared visual system for text-entry controls
 * (input, textarea, styled-native select).
 *
 * `fieldClasses()` is consumed by BOTH the React components
 * (`input.tsx`, `textarea.tsx`, `select.tsx`) AND raw `.astro` markup, so
 * neither duplicates the "filled soft surface, subtle border, comfortable
 * padding, smooth focus ring" look. Import `fieldClasses` directly in an
 * `.astro` file's frontmatter and pass the result to `class=`.
 */

/**
 * Base look shared by every text-entry control, WITHOUT a height — a fixed
 * height only makes sense for single-line controls (input, select);
 * `textarea.tsx` composes this with its own `min-h-*` instead of
 * `fieldHeight`.
 */
export const fieldBase =
  'flex w-full min-w-0 rounded-(--radius-field) border border-(--color-field-border) bg-(--color-field) px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-(--transition-duration-control) ease-(--ease-control) placeholder:text-muted-foreground hover:border-(--color-field-border-hover) focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-(--color-field-ring) disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20';

/**
 * Height axis, separate from `fieldBase` so a caller can opt out entirely
 * (textarea). `responsive` (the default) is the owner's spec verbatim: 44px
 * on phones, 40px on desktop (`md:` breakpoint). `sm`/`md`/`lg` are fixed
 * overrides for contexts that must not resize across breakpoints (e.g. a
 * compact filters row that keeps one height at every size).
 */
export const fieldHeight = cva('', {
  variants: {
    size: {
      responsive: 'h-(--control-h-lg) md:h-(--control-h-md)',
      sm: 'h-(--control-h-sm)',
      md: 'h-(--control-h-md)',
      lg: 'h-(--control-h-lg)',
    },
  },
  defaultVariants: { size: 'responsive' },
});

export type FieldSize = VariantProps<typeof fieldHeight>['size'];

/**
 * `fieldClasses({ size, className })` -> the full class string for a
 * single-line control (input or the styled-native select). `className` is
 * merged last (via `cn`/tailwind-merge) so a caller's own overrides win.
 */
export function fieldClasses(opts?: { size?: FieldSize; className?: string }): string {
  return cn(fieldBase, fieldHeight({ size: opts?.size }), opts?.className);
}
