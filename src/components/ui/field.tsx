import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Field — label above (small semibold), the control in the middle, an
 * optional hint or error below. A render-prop child so `Field` owns id
 * generation and `aria-describedby` wiring without dictating which control
 * (`Input`/`Textarea`/`Select`) it wraps.
 *
 * An `error` replaces the `hint` (never shown together) and is announced via
 * `role="alert"`, same convention as the rest of the site's inline errors.
 */
export interface FieldProps {
  label: string;
  /** Use an existing id instead of the auto-generated one (e.g. to match a
   * `name` already wired elsewhere). */
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => React.ReactNode;
}

function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  const autoId = React.useId();
  const id = htmlFor ?? autoId;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)} data-slot="field">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children({ id, describedBy })}
      {hintId && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { Field };
