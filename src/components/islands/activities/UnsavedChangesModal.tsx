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
 *
 * T4, "offer to discard": the optional `discard` prop swaps this into a
 * DIFFERENT proposal — "this draft has no content yet, discard it?" — over
 * the SAME three-capsule stack. "Descartar" REUSES `onLeaveWithoutSaving`
 * (same outcome: leave, nothing saved) — only its copy, weight and position
 * change; `ActivityEditorIsland` is the one that knows, from the variant IT
 * itself requested, to also call the discard endpoint once that resolves.
 */
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UnsavedChangesModalLabels {
  title: string;
  saveAndLeave: string;
  leaveWithoutSaving: string;
  cancel: string;
  saveError: string;
}

/** T4: the discard proposal's own copy — see this file's own header. */
interface DiscardLabels {
  title: string;
  body: string;
  /** The "Descartar" button's own label. */
  action: string;
}

export interface UnsavedChangesModalProps {
  open: boolean;
  saving: boolean;
  error: boolean;
  labels: UnsavedChangesModalLabels;
  onSaveAndLeave: () => void;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
  /** `undefined` (default) renders today's markup unchanged — see this file's own header. */
  discard?: DiscardLabels;
}

export default function UnsavedChangesModal({
  open,
  saving,
  error,
  labels,
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onCancel,
  discard,
}: UnsavedChangesModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent data-testid="unsaved-changes-modal" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{discard ? discard.title : labels.title}</DialogTitle>
          {discard && <DialogDescription>{discard.body}</DialogDescription>}
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
            first) — no `flex-col-reverse` trick required either.

            T4: the discard variant reorders this to discard (now primary,
            first, so it gets initial focus) / save-and-leave (now
            secondary) / cancel — dropping the plain "leave" button
            entirely, since "Descartar" already covers that outcome. */}
        <div className="flex flex-col gap-2">
          {discard && (
            <Button
              type="button"
              className="w-full rounded-full"
              data-testid="unsaved-modal-discard"
              onClick={onLeaveWithoutSaving}
            >
              {discard.action}
            </Button>
          )}
          <Button
            type="button"
            variant={discard ? 'secondary' : 'default'}
            className="w-full rounded-full"
            data-testid="unsaved-modal-save-and-leave"
            disabled={saving}
            loading={saving}
            onClick={onSaveAndLeave}
          >
            {labels.saveAndLeave}
          </Button>
          {!discard && (
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-full"
              data-testid="unsaved-modal-leave"
              onClick={onLeaveWithoutSaving}
            >
              {labels.leaveWithoutSaving}
            </Button>
          )}
          <Button type="button" variant="ghost" className="w-full rounded-full" data-testid="unsaved-modal-cancel" onClick={onCancel}>
            {labels.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
