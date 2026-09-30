import * as React from 'react';
import { fieldBase } from '@/lib/ui/field';
import { cn } from '@/lib/utils';

/**
 * Textarea — shares `fieldBase` with `input.tsx`/`select.tsx` (same
 * surface/border/focus ring) but never `fieldHeight`: a textarea's height is
 * either the browser's own resize handle or `autoGrow`, never one of the
 * fixed single-line control heights.
 *
 * `autoGrow` (opt-in, per the design-system brief) resizes the element to
 * fit its content on every change instead of scrolling internally; it stays
 * off by default so existing callers keep their current scroll behavior.
 * `rows` defaults to 3 (the spec's "min 3 rows").
 */
export interface TextareaProps extends React.ComponentProps<'textarea'> {
  autoGrow?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoGrow = false, rows = 3, onChange, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref],
    );

    const resize = React.useCallback(() => {
      if (!autoGrow) return;
      const el = internalRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [autoGrow]);

    return (
      <textarea
        ref={setRefs}
        data-slot="textarea"
        rows={rows}
        className={cn(
          fieldBase,
          'min-h-(--control-h-lg)',
          autoGrow ? 'resize-none overflow-hidden' : 'resize-y',
          className,
        )}
        onChange={(event) => {
          onChange?.(event);
          resize();
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
