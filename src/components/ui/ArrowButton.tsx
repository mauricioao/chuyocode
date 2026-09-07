/**
 * ArrowButton — the React half of the shared prev/next arrow control.
 *
 * The Astro half lives in `EditorialRow.astro`; both are composed from
 * `@lib/arrowControl`, which owns the chevron geometry and the `buttonVariants`
 * arguments. See that module for why one component cannot serve both.
 *
 * WHAT THIS MUST NOT LOSE relative to the text buttons it replaces:
 *   - it is a real `<button type="button">`, so Enter and Space activate it and
 *     it is in the tab order for free;
 *   - `disabled` is a real attribute, not a dimmed style, so the control cannot
 *     lie about being usable at the ends of a range;
 *   - it carries an accessible NAME. The chevron is `aria-hidden`, so without
 *     `label` this button would announce as "button" and nothing else. The
 *     caller passes its own localized string — this component owns no copy.
 */
import { Button } from '@/components/ui/button';
import {
  ARROW_BUTTON_SHAPE,
  ARROW_BUTTON_VARIANT,
  CHEVRON_PATH,
  CHEVRON_SIZE,
  CHEVRON_STROKE_WIDTH,
  CHEVRON_VIEW_BOX,
  type ArrowDirection,
} from '@/lib/arrowControl';

export interface ArrowButtonProps {
  /** Which way the chevron points. */
  direction: ArrowDirection;
  /** The accessible name. REQUIRED — a bare chevron announces nothing. */
  label: string;
  /** A real attribute at the ends of the range, not a dimmed style. */
  disabled?: boolean;
  onClick: () => void;
  /** Test hook, passed straight through to the button. */
  'data-testid'?: string;
}

export function ArrowButton({
  direction,
  label,
  disabled,
  onClick,
  'data-testid': testId,
}: ArrowButtonProps) {
  return (
    <Button
      type="button"
      variant={ARROW_BUTTON_VARIANT.variant}
      size={ARROW_BUTTON_VARIANT.size}
      className={ARROW_BUTTON_SHAPE}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={CHEVRON_SIZE}
        height={CHEVRON_SIZE}
        viewBox={CHEVRON_VIEW_BOX}
        fill="none"
        stroke="currentColor"
        strokeWidth={CHEVRON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={CHEVRON_PATH[direction]} />
      </svg>
    </Button>
  );
}
