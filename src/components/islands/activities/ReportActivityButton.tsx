/**
 * ReportActivityButton — the discreet "Reportar" entry point in the practice
 * page's header (`/[lang]/ingles/actividades/[id]`, PR E "Moderation").
 *
 * The page only MOUNTS this island when the caller may actually report —
 * signed in and not the activity's own author (`[id].astro`'s own gate) —
 * rather than passing a `hidden` prop, the same "don't render what should
 * not exist" posture the header's `UserMenu` uses for its own sign-out form.
 * `POST /api/actividades/[id]/reportar` refuses both cases again server-side
 * (`recordReport`'s own header) — this is only the UI-level courtesy of not
 * offering the button at all.
 *
 * The reason taxonomy is DUPLICATED here, deliberately, rather than imported
 * from `@lib/activities/moderation`: that module pulls in the service-role
 * Supabase client (`createServiceClient`) and must never reach a client
 * bundle. Both lists are guarded against drifting apart by
 * `moderation.test.ts` matching the migration's own check constraint, and by
 * this component's own tests matching `REPORT_REASONS` one-to-one.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { FlagIcon } from '@phosphor-icons/react/dist/ssr/Flag';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const REPORT_REASONS = ['inappropriate', 'off_topic', 'copyright', 'wrong_answers', 'other'] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

export interface ReportActivityButtonProps {
  lang: Lang;
  activityId: string;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function ReportActivityButton({ lang, activityId }: ReportActivityButtonProps) {
  const t = UI_LABELS[lang].activities.report;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function openDialog() {
    setReason(null);
    setDetails('');
    setStatus('idle');
    setErrorKey(null);
    setOpen(true);
  }

  function close() {
    if (status === 'submitting') return;
    setOpen(false);
  }

  async function submit() {
    if (!reason) return;
    setStatus('submitting');
    setErrorKey(null);
    try {
      const res = await fetch(`/api/actividades/${activityId}/reportar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        const body: { error?: unknown } = await res.json().catch(() => ({}));
        setErrorKey(typeof body.error === 'string' ? body.error : 'report_failed');
        setStatus('error');
        return;
      }
      setStatus('success');
      toast.success(UI_LABELS[lang].common.toast.reportSent);
    } catch {
      setErrorKey('report_failed');
      setStatus('error');
    }
  }

  const errors = t.errors as Record<string, string>;
  const errorMessage = errorKey ? (errors[errorKey] ?? t.errors.report_failed) : null;

  return (
    <>
      <button
        type="button"
        data-testid="report-activity-button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <FlagIcon aria-hidden="true" size={16} />
        <span>{t.button}</span>
      </button>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent data-testid="report-activity-dialog">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
          </DialogHeader>

          {status === 'success' ? (
            <div className="flex flex-col gap-4">
              <p data-testid="report-success">{t.success}</p>
              <div className="flex justify-end">
                <Button type="button" data-testid="report-dialog-close" onClick={close}>
                  {t.close}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-foreground">{t.reasonLabel}</legend>
                {REPORT_REASONS.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="report-reason"
                      value={option}
                      data-testid={`report-reason-${option}`}
                      checked={reason === option}
                      onChange={() => setReason(option)}
                    />
                    <span>{t.reasons[option]}</span>
                  </label>
                ))}
              </fieldset>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
                <span>{t.detailsLabel}</span>
                <Textarea
                  data-testid="report-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t.detailsPlaceholder}
                  maxLength={500}
                />
              </label>

              {errorMessage && (
                <p data-testid="report-error" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="report-dialog-cancel"
                  onClick={close}
                  disabled={status === 'submitting'}
                >
                  {t.cancel}
                </Button>
                <Button
                  type="button"
                  data-testid="report-dialog-confirm"
                  disabled={!reason || status === 'submitting'}
                  onClick={() => void submit()}
                >
                  {status === 'submitting' ? t.submitting : t.submit}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
