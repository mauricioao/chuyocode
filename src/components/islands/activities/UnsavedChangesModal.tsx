/**
 * UnsavedChangesModal — the editor's own confirmation dialog for an in-app
 * navigation while there are unsaved changes (owner request #9). A tab
 * close/reload still gets the native, unthemeable `beforeunload` prompt (no
 * browser lets a page customize that text any more) — this modal is only
 * for navigating to ANOTHER page of the site while this one still has
 * something unsaved, which `ActivityEditorIsland` intercepts via a
 * document-level click listener and the `astro:before-preparation` event.
 *
 * Three choices, always in this order: "Guardar y salir" (save, then
 * navigate), "Salir sin guardar" (navigate immediately), "Cancelar" (stay).
 * A failed save-and-leave never navigates anyway — the whole point is not
 * losing work — so it shows an inline error and leaves both the modal and
 * the choice to retry or leave without saving.
 */
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface UnsavedChangesModalLabels {
  title: string;
  saveAndLeave: string;
  leaveWithoutSaving: string;
  cancel: string;
  saveError: string;
}

export interface UnsavedChangesModalProps {
  open: boolean;
  saving: boolean;
  error: boolean;
  labels: UnsavedChangesModalLabels;
  onSaveAndLeave: () => void;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
}

export default function UnsavedChangesModal({
  open,
  saving,
  error,
  labels,
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onCancel,
}: UnsavedChangesModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent data-testid="unsaved-changes-modal" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" data-testid="unsaved-modal-error">
            <WarningCircleIcon aria-hidden="true" />
            {labels.saveError}
          </p>
        )}
        {/* Three actions, stacked (owner report "botón fuera de la caja", UI
            round 2 follow-up): a two-button `DialogFooter` row
            (`ReportActivityButton`, `ModerationQueueIsland`, etc.) is the
            kit's own exception, not its default — the kit's iOS-style alert
            rule for THREE actions is a full-width capsule stack, primary
            first, same at every width (DIRECCION-VISUAL.md §3.2: "lo que se
            toca o flota: cápsula"). `w-full` on every button is also what
            makes the original overflow structurally impossible now: a
            full-width button can never spill past its own `max-w-sm`
            dialog's edge, at any label length/locale — no `sm:` row, no
            wrap needed. DOM order IS visual order (top to bottom, primary
            first) — no `flex-col-reverse` trick required either. */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="w-full rounded-full"
            data-testid="unsaved-modal-save-and-leave"
            disabled={saving}
            loading={saving}
            onClick={onSaveAndLeave}
          >
            {labels.saveAndLeave}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full rounded-full"
            data-testid="unsaved-modal-leave"
            onClick={onLeaveWithoutSaving}
          >
            {labels.leaveWithoutSaving}
          </Button>
          <Button type="button" variant="ghost" className="w-full rounded-full" data-testid="unsaved-modal-cancel" onClick={onCancel}>
            {labels.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
