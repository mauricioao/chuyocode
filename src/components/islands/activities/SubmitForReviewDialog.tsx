/**
 * SubmitForReviewDialog — the editor's "Enviar a revisión" confirmation
 * (PR D, "Activities practice"). A small dialog with the rights checkbox
 * (`POST /api/actividades/[id]/enviar` requires `{ acceptedRights: true }`,
 * 422 `rights_required` otherwise — see that endpoint's own header) and a
 * short note explaining what happens next.
 *
 * The checkbox resets to unchecked every time the dialog opens — accepting
 * once must not silently carry over to a later, different submission.
 *
 * PROJECTION WARNINGS (worksheet zoom tour, sprint week 3): a NON-BLOCKING
 * list above the rights checkbox — `listProjectionWarnings`
 * (`presentationSlides.ts`) scanning `blocks` for a quiz prompt long enough
 * to already be floored at the minimum stage font size, or a worksheet zone
 * small enough that presenting it would need more than a sane max zoom.
 * Purely informational: it never disables "Enviar" and never blocks the
 * submit itself, same posture as the per-block checklist
 * `QuizBlockEditor.tsx` already shows in its own header (reused visual
 * pattern — a bordered box, one line per item — just an amber/warning tone
 * instead of that one's blocking destructive red).
 */
import { useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr/Warning';
import type { Block } from '@/lib/activities/blocks';
import { listProjectionWarnings } from '@/lib/activities/presentationSlides';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

export interface SubmitForReviewDialogProps {
  lang: Lang;
  open: boolean;
  submitting: boolean;
  /** Localized error message from the last failed attempt, or `null`. */
  errorMessage: string | null;
  /** The activity's current blocks — scanned for non-blocking projection warnings (see this file's own header). */
  blocks: Block[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SubmitForReviewDialog({
  lang,
  open,
  submitting,
  errorMessage,
  blocks,
  onConfirm,
  onCancel,
}: SubmitForReviewDialogProps) {
  const t = UI_LABELS[lang].activities.editor;
  const [accepted, setAccepted] = useState(false);
  const warnings = useMemo(() => listProjectionWarnings(blocks), [blocks]);

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
        {warnings.length > 0 && (
          <div
            data-testid="submit-projection-warnings"
            className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <WarningIcon aria-hidden="true" weight="fill" />
              {t.projectionWarningsHeading}
            </span>
            {warnings.map((warning, i) => (
              <p key={i} data-testid={`projection-warning-${i}`}>
                {warning.reason === 'quiz_prompt_too_long'
                  ? t.projectionWarningQuizPromptTooLong
                  : t.projectionWarningWorksheetZoneTooSmall}
              </p>
            ))}
          </div>
        )}
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
