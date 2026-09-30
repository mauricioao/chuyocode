import * as React from 'react';
import { fieldClasses, type FieldSize } from '@/lib/ui/field';

/**
 * Input — the shadcn-style text input, styled from the shared field system
 * (`@/lib/ui/field`) so it matches `textarea.tsx`/`select.tsx` exactly.
 *
 * `fieldSize` (not `size` — the native `<input size>` attribute already
 * means something else: visible character width) opts into a fixed height
 * instead of the default responsive 44px-phone/40px-desktop height.
 */
export interface InputProps extends React.ComponentProps<'input'> {
  fieldSize?: FieldSize;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', fieldSize, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={fieldClasses({ size: fieldSize, className })}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
