/**
 * SubmitForReviewDialog — the editor's "Enviar a revisión" confirmation
 * (PR D, "Activities practice"). A small dialog with the rights checkbox
 * (`POST /api/actividades/[id]/enviar` requires `{ acceptedRights: true }`,
 * 422 `rights_required` otherwise — see that endpoint's own header) and a
 * short note explaining what happens next.
 *
 * The checkbox resets to unchecked every time the dialog opens — accepting
 * once must not silently carry over to a later, different submission.
 */
import { useEffect, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

export interface SubmitForReviewDialogProps {
  lang: Lang;
  open: boolean;
  submitting: boolean;
  /** Localized error message from the last failed attempt, or `null`. */
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SubmitForReviewDialog({
  lang,
  open,
  submitting,
  errorMessage,
  onConfirm,
  onCancel,
}: SubmitForReviewDialogProps) {
  const t = UI_LABELS[lang].activities.editor;
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (open) setAccepted(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent data-testid="submit-for-review-dialog">
        <DialogHeader>
          <DialogTitle>{t.submitDialogTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t.submitDialogNote}</p>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox
            data-testid="submit-rights-checkbox"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            className="mt-0.5"
          />
          <span>{t.submitRightsLabel}</span>
        </label>
        {errorMessage && (
          <p data-testid="submit-dialog-error" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" data-testid="submit-dialog-cancel" onClick={onCancel} disabled={submitting}>
            {t.submitCancel}
          </Button>
          <Button
            type="button"
            data-testid="submit-dialog-confirm"
            disabled={!accepted || submitting}
            loading={submitting}
            onClick={onConfirm}
          >
            {t.submitConfirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
