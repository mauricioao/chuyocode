'use client';

import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { cn } from '@/lib/utils';

/**
 * Checkbox — same field surface as input/select (filled soft background,
 * subtle border), radix-driven for correct keyboard/aria behavior. Radix
 * writes checked state via `data-state` (`checked`/`unchecked`/
 * `indeterminate`), not a boolean attribute — same rule `radio-group.tsx`
 * already documents.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer flex size-5 shrink-0 items-center justify-center rounded-[min(var(--radius-field),6px)] border border-(--color-field-border) bg-(--color-field) outline-none transition-[border-color,box-shadow] duration-(--transition-duration-control) ease-(--ease-control)',
        'hover:border-(--color-field-border-hover)',
        'focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-(--color-field-ring)',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <CheckIcon size={14} weight="bold" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
