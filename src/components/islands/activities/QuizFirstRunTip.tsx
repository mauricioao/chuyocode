/**
 * QuizFirstRunTip — one anchored bubble of the quiz editor's 3-step
 * onboarding tour (owner build item 6). Wraps the element it points at in a
 * `position: relative` span and renders the bubble `absolute`ly right under
 * it — anchored to that element by plain CSS, not by measuring its position
 * in JS, so there is nothing here that can disagree between server and
 * client renders.
 *
 * NEVER A BLOCKING OVERLAY: no backdrop, no fixed fullscreen layer — the
 * rest of the page stays fully interactive while a tip is showing.
 *
 * KEPT INSIDE THE VIEWPORT ON PHONES: the bubble's own width is clamped to
 * `calc(100vw - 2rem)` (a phone's width minus a comfortable side margin), so
 * even a bubble anchored near a screen edge never forces horizontal
 * scrolling — a CSS-only guarantee, not a runtime measurement.
 */
import { cn } from '@/lib/utils';

export interface QuizFirstRunTipProps {
  /** Whether THIS step's bubble is the one currently showing. */
  active: boolean;
  text: string;
  isLast: boolean;
  nextLabel: string;
  doneLabel: string;
  dismissLabel: string;
  onNext: () => void;
  onDismiss: () => void;
  /** The element this tip points at. */
  children: React.ReactNode;
  /** `'top'` flips the bubble above the anchor instead of below it — for an anchor near the bottom of the viewport (e.g. the trailing "+ Agregar pregunta" button). */
  side?: 'top' | 'bottom';
}

export default function QuizFirstRunTip({
  active,
  text,
  isLast,
  nextLabel,
  doneLabel,
  dismissLabel,
  onNext,
  onDismiss,
  children,
  side = 'bottom',
}: QuizFirstRunTipProps) {
  return (
    <span className="relative inline-block w-full">
      {children}
      {active && (
        <span
          role="tooltip"
          data-testid="quiz-first-run-tip"
          className={cn(
            'absolute left-1/2 z-50 w-max max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg',
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          <p>{text}</p>
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              data-testid="quiz-first-run-tip-dismiss"
              onClick={onDismiss}
              className="text-muted-foreground hover:underline"
            >
              {dismissLabel}
            </button>
            <button
              type="button"
              data-testid="quiz-first-run-tip-next"
              onClick={onNext}
              className="font-medium text-accent-ink hover:underline"
            >
              {isLast ? doneLabel : nextLabel}
            </button>
          </div>
        </span>
      )}
    </span>
  );
}
