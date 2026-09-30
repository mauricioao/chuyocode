import * as React from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { fieldClasses, type FieldSize } from '@/lib/ui/field';
import { cn } from '@/lib/utils';

/**
 * Select — a styled NATIVE `<select>`, not a Radix/headless listbox.
 *
 * Kept native on purpose (owner spec): mobile OSes render their own native
 * picker UI for a real `<select>`, and it comes with full keyboard/screen
 * reader support for free. `appearance-none` strips only the browser's own
 * chevron/chrome; a Phosphor `CaretDown` is drawn on top so it matches
 * `input.tsx`/`textarea.tsx` pixel-for-pixel.
 */
export interface SelectProps extends React.ComponentProps<'select'> {
  fieldSize?: FieldSize;
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, fieldSize, wrapperClassName, children, ...props }, ref) => {
    return (
      <div className={cn('relative', wrapperClassName)}>
        <select
          ref={ref}
          data-slot="select"
          className={fieldClasses({
            size: fieldSize,
            className: cn('appearance-none pr-9', className),
          })}
          {...props}
        >
          {children}
        </select>
        <CaretDownIcon
          size={16}
          weight="bold"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
