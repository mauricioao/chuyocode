/**
 * SaveStatusIndicator — the editor's icon-only autosave status (creator
 * polish round 2, owner request #8). No text label ("Cambios sin guardar"
 * is gone): the meaning lives in an accessible label/tooltip on the icon
 * itself, so a screen reader or a hover both get the same information a
 * sighted user reads from the icon shape/color alone.
 *
 * - saving: `CircleNotch`, spinning.
 * - saved: `CheckCircle`, weight "fill", in `--color-success` (a light,
 *   characteristic emerald — see `global.css`).
 * - error: `WarningCircle` in destructive red, ICON-ONLY (creator polish
 *   round 3, owner feedback #1: no separate "Reintentar" text) — the icon
 *   itself IS the retry button, its accessible name/tooltip stating both the
 *   failure and the action ("No se pudo guardar, reintentar"/"Couldn't save,
 *   retry"). A failed autosave must never be silent (owner request #8).
 * - pending ("unsaved"): a plain (non-spinning) `CircleNotch` — a change is
 *   queued but the ~3s autosave debounce hasn't fired yet.
 *
 * `data-status` keeps the same four values ActivityEditorIsland's tests
 * already asserted before this rework (`saved`/`unsaved`/`saving`/`error`),
 * mapped from the scheduler's own `AutosaveStatus` (`pending` -> `unsaved`).
 */
import { CircleNotchIcon } from '@phosphor-icons/react/dist/ssr/CircleNotch';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import type { AutosaveStatus } from '@/lib/activities/autosave';
import { Button } from '@/components/ui/button';

export interface SaveStatusLabels {
  saving: string;
  saved: string;
  error: string;
  unsaved: string;
  retry: string;
  /** The error state's ONE accessible label/tooltip — combines the failure and the retry action. */
  errorRetry: string;
}

export interface SaveStatusIndicatorProps {
  status: AutosaveStatus | 'idle';
  onRetry: () => void;
  labels: SaveStatusLabels;
}

export default function SaveStatusIndicator({ status, onRetry, labels }: SaveStatusIndicatorProps) {
  if (status === 'error') {
    // Icon-only, clickable — no separate "Reintentar" text (creator polish
    // round 3, owner feedback #1).
    return (
      <span data-testid="save-status" data-status="error">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={labels.errorRetry}
          title={labels.errorRetry}
          data-testid="save-retry"
          onClick={onRetry}
        >
          <WarningCircleIcon aria-hidden="true" className="text-destructive" size={18} />
        </Button>
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span data-testid="save-status" data-status="saving" role="status" aria-label={labels.saving} title={labels.saving}>
        <CircleNotchIcon aria-hidden="true" className="animate-spin text-muted-foreground" size={18} />
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span data-testid="save-status" data-status="unsaved" role="status" aria-label={labels.unsaved} title={labels.unsaved}>
        <CircleNotchIcon aria-hidden="true" className="text-muted-foreground" size={18} />
      </span>
    );
  }

  // 'saved' or the initial 'idle' state (nothing to save yet) both read as "saved".
  return (
    <span data-testid="save-status" data-status="saved" role="status" aria-label={labels.saved} title={labels.saved}>
      <CheckCircleIcon aria-hidden="true" weight="fill" className="text-success" size={18} />
    </span>
  );
}
