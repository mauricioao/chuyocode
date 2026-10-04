import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * TaskProgress — the panel for a long multi-step task (coherent loading
 * states, item 4: PDF/image uploads today, any future chunked job later).
 * It REPLACES whatever empty/idle state the caller shows while a task runs
 * — the caller decides when to mount/unmount it, this component never
 * falls back to anything on its own.
 *
 * Dumb/presentational: every number and string comes from the caller (e.g.
 * `src/lib/activities/uploadTask.ts`'s state machine) — this component owns
 * only the shared panel chrome: an `aria-live="polite"` status region with
 * an optional cheap thumbnail, a determinate progress bar, and EITHER a
 * `cancel` affordance (normal run) OR an `error` affordance (retry/choose
 * another) — never both at once.
 */
export interface TaskProgressErrorProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  chooseAnotherLabel: string;
  onChooseAnother: () => void;
}

export interface TaskProgressCancelProps {
  label: string;
  onCancel: () => void;
}

export interface TaskProgressProps {
  /** Already-localized text for the current stage, e.g. "Convirtiendo página 2 de 5". */
  label: string;
  /** 0..1 determinate progress. */
  progress: number;
  /** The current item's cheap preview (e.g. a PDF page thumbnail), if any. */
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  /** Omitted once the task can no longer be cancelled (e.g. mid-error). */
  cancel?: TaskProgressCancelProps;
  /** When set, the panel shows the failure + its actions instead of `cancel`. */
  error?: TaskProgressErrorProps;
  className?: string;
}

function TaskProgress({
  label,
  progress,
  thumbnailUrl,
  thumbnailAlt,
  cancel,
  error,
  className,
}: TaskProgressProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div
      data-slot="task-progress"
      data-testid="task-progress"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-theme duration-theme',
        error ? 'border-destructive/40' : 'border-border',
        className,
      )}
    >
      <div
        role="status"
        aria-live="polite"
        aria-busy={!error}
        className="flex w-full flex-col items-center gap-3"
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={thumbnailAlt ?? ''}
            className="h-20 w-auto rounded border border-border object-contain"
          />
        )}
        <p className="text-sm font-medium text-foreground" data-testid="task-progress-label">
          {label}
        </p>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid="task-progress-bar"
          className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{percent}%</span>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-2">
          <p className="text-sm text-destructive" data-testid="task-progress-error">
            {error.message}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" size="sm" onClick={error.onRetry} data-testid="task-progress-retry">
              {error.retryLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={error.onChooseAnother}
              data-testid="task-progress-choose-another"
            >
              {error.chooseAnotherLabel}
            </Button>
          </div>
        </div>
      ) : (
        cancel && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancel.onCancel}
            data-testid="task-progress-cancel"
          >
            {cancel.label}
          </Button>
        )
      )}
    </div>
  );
}

export { TaskProgress };
