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
 * PROJECTION WARNINGS (worksheet zoom tour, sprint week 3; GROUPED, owner
 * report): a NON-BLOCKING list above the rights checkbox —
 * `summarizeProjectionWarnings(listProjectionWarnings(blocks))`
 * (`presentationSlides.ts`) scanning `blocks` for a quiz prompt long enough
 * to already be floored at the minimum stage font size, or a worksheet zone
 * below the calibrated projection minimum (`zoneGeometry.ts`'s
 * `isZoneTooSmallToProject`) — GROUPED into one line per warning KIND with
 * its count, never the same line repeated once per zone/prompt (the owner's
 * original screenshot: the exact same line, 10 times, with "no way to know
 * what to do"). The zone-too-small line carries two non-blocking actions:
 * "Agrandar las zonas chicas" (`onEnlargeSmallZones`, grows every small
 * zone to the minimum around its own center, as ONE undo step — the
 * warning here updates on its own once the parent re-renders with the
 * grown `blocks`) and "Ver cuáles" (`onViewSmallZone`, closes this dialog
 * and selects the first small zone, same "point the author straight at the
 * gap" pattern `ActivityEditorIsland.tsx`'s own incomplete-submit handling
 * already uses). Purely informational: it never disables "Enviar" and
 * never blocks the submit itself, same posture as the per-block checklist
 * `QuizBlockEditor.tsx` already shows in its own header (reused visual
 * pattern — a bordered box, one line per item — just an amber/warning tone
 * instead of that one's blocking destructive red).
 */
import { useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr/Warning';
import type { Block } from '@/lib/activities/blocks';
import { listProjectionWarnings, summarizeProjectionWarnings } from '@/lib/activities/presentationSlides';
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
  /** "Agrandar las zonas chicas" — grow every too-small zone to the calibrated minimum, as one undo step. */
  onEnlargeSmallZones: () => void;
  /** "Ver cuáles" — jump to (select) the first too-small zone; the dialog closes itself (see this file's own header). */
  onViewSmallZone: (blockId: string, zoneId: string) => void;
}

export default function SubmitForReviewDialog({
  lang,
  open,
  submitting,
  errorMessage,
  blocks,
  onConfirm,
  onCancel,
  onEnlargeSmallZones,
  onViewSmallZone,
}: SubmitForReviewDialogProps) {
  const t = UI_LABELS[lang].activities.editor;
  const [accepted, setAccepted] = useState(false);
  const warnings = useMemo(() => listProjectionWarnings(blocks), [blocks]);
  const warningSummaries = useMemo(() => summarizeProjectionWarnings(warnings), [warnings]);

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
        {warningSummaries.length > 0 && (
          <div
            data-testid="submit-projection-warnings"
            // `dark:text-amber-400` kept literal (theme-remap-cleanup): this
            // dialog only ever mounts under `theme="ingles"` (the activity
            // editor), so `<html>` never carries the `.dark` class here and
            // this variant never actually applies — the removed remap never
            // touched it either way. The base `text-amber-700` (unaffected;
            // not one of the 7 remapped steps) is what Inglés always shows.
            className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <WarningIcon aria-hidden="true" weight="fill" />
              {t.projectionWarningsHeading}
            </span>
            {warningSummaries.map((summary) => (
              <div key={summary.reason} data-testid={`projection-warning-${summary.reason}`} className="flex flex-col gap-1.5">
                <p>
                  {summary.reason === 'quiz_prompt_too_long'
                    ? t.projectionWarningQuizPromptTooLongGrouped(summary.count)
                    : t.projectionWarningWorksheetZoneTooSmallGrouped(summary.count)}
                </p>
                {summary.reason === 'worksheet_zone_too_small' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="submit-projection-grow-zones"
                      onClick={onEnlargeSmallZones}
                    >
                      {t.projectionWarningGrowSmallZones}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="submit-projection-view-zones"
                      onClick={() => {
                        // Non-null: a `'worksheet_zone_too_small'` warning always carries a `zoneId` — see `ProjectionWarning`'s own header.
                        onViewSmallZone(summary.first.blockId, summary.first.zoneId!);
                        onCancel();
                      }}
                    >
                      {t.projectionWarningSeeWhich}
                    </Button>
                  </div>
                )}
              </div>
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
