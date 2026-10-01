/**
 * ModerationQueueIsland — the moderator dashboard's whole interactive
 * surface (`/[lang]/admin/actividades`, PR E "Moderation"). SSR seeds both
 * lists via `getReviewQueue` (`@lib/activities/moderation`); this island
 * owns tab switching, item selection, the answers/version toggles, and the
 * four write actions (aprobar/rechazar/restaurar/eliminar), each removing
 * its item from local state on success — the server round trip is the
 * source of truth, this only avoids a full reload to reflect it, same
 * posture as `MisActividadesIsland`'s own delete flow.
 *
 * Types are imported `import type` from `@lib/activities/moderation` —
 * erased at build time, so that server-only module (it pulls in the
 * service-role Supabase client) never reaches this client bundle.
 */
import { useCallback, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { ReviewQueueItem, ReportedActivityItem } from '@/lib/activities/moderation';
import ModerationBlockPreview from './ModerationBlockPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ModerationQueueIslandProps {
  lang: Lang;
  initialPending: ReviewQueueItem[];
  initialReported: ReportedActivityItem[];
}

type Tab = 'pending' | 'reported';

function resolveImageUrl(path: string): string {
  return `/api/actividades/imagen?path=${encodeURIComponent(path)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

/** Shared shape for the approve/restore/remove confirmations — see file header. */
interface ConfirmState {
  open: boolean;
  submitting: boolean;
  error: boolean;
}
const CONFIRM_IDLE: ConfirmState = { open: false, submitting: false, error: false };

export default function ModerationQueueIsland({ lang, initialPending, initialReported }: ModerationQueueIslandProps) {
  const t = UI_LABELS[lang].activities.moderation;
  const reportReasonLabels = UI_LABELS[lang].activities.report.reasons;

  const [pending, setPending] = useState(initialPending);
  const [reported, setReported] = useState(initialReported);
  const [tab, setTab] = useState<Tab>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [versionView, setVersionView] = useState<'published' | 'new'>('new');

  const [approveState, setApproveState] = useState(CONFIRM_IDLE);
  const [restoreState, setRestoreState] = useState(CONFIRM_IDLE);
  const [removeState, setRemoveState] = useState(CONFIRM_IDLE);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const selectedPending = useMemo(
    () => (tab === 'pending' ? (pending.find((item) => item.revisionId === selectedId) ?? null) : null),
    [tab, pending, selectedId],
  );
  const selectedReported = useMemo(
    () => (tab === 'reported' ? (reported.find((item) => item.activityId === selectedId) ?? null) : null),
    [tab, reported, selectedId],
  );

  function selectTab(next: Tab) {
    setTab(next);
    setSelectedId(null);
    setShowAnswers(false);
    setVersionView('new');
  }

  function select(id: string) {
    setSelectedId(id);
    setShowAnswers(false);
    setVersionView('new');
  }

  const approve = useCallback(async () => {
    if (!selectedPending) return;
    setApproveState({ open: true, submitting: true, error: false });
    try {
      const res = await fetch(`/api/admin/actividades/${selectedPending.revisionId}/aprobar`, { method: 'POST' });
      if (!res.ok) throw new Error('approve_failed');
      setPending((prev) => prev.filter((item) => item.revisionId !== selectedPending.revisionId));
      setSelectedId(null);
      setApproveState(CONFIRM_IDLE);
    } catch {
      setApproveState({ open: true, submitting: false, error: true });
    }
  }, [selectedPending]);

  const reject = useCallback(async () => {
    if (!selectedPending) return;
    const note = rejectNote.trim();
    if (note.length === 0) {
      setRejectError(t.rejectNoteRequired);
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      const res = await fetch(`/api/admin/actividades/${selectedPending.revisionId}/rechazar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error('reject_failed');
      setPending((prev) => prev.filter((item) => item.revisionId !== selectedPending.revisionId));
      setSelectedId(null);
      setRejectOpen(false);
      setRejectNote('');
    } catch {
      setRejectError(t.rejectError);
    } finally {
      setRejectSubmitting(false);
    }
  }, [selectedPending, rejectNote, t.rejectNoteRequired, t.rejectError]);

  const restore = useCallback(async () => {
    if (!selectedReported) return;
    setRestoreState({ open: true, submitting: true, error: false });
    try {
      const res = await fetch(`/api/admin/actividades/${selectedReported.activityId}/restaurar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (!res.ok) throw new Error('restore_failed');
      setReported((prev) => prev.filter((item) => item.activityId !== selectedReported.activityId));
      setSelectedId(null);
      setRestoreState(CONFIRM_IDLE);
    } catch {
      setRestoreState({ open: true, submitting: false, error: true });
    }
  }, [selectedReported]);

  const remove = useCallback(async () => {
    if (!selectedReported) return;
    setRemoveState({ open: true, submitting: true, error: false });
    try {
      const res = await fetch(`/api/admin/actividades/${selectedReported.activityId}/restaurar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove' }),
      });
      if (!res.ok) throw new Error('remove_failed');
      setReported((prev) => prev.filter((item) => item.activityId !== selectedReported.activityId));
      setSelectedId(null);
      setRemoveState(CONFIRM_IDLE);
    } catch {
      setRemoveState({ open: true, submitting: false, error: true });
    }
  }, [selectedReported]);

  const blocksToShow = selectedPending
    ? versionView === 'published' && selectedPending.publishedBlocks
      ? selectedPending.publishedBlocks
      : selectedPending.blocks
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-2 border-b border-border">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          data-testid="moderation-tab-pending"
          onClick={() => selectTab('pending')}
          className={cn(
            'px-3 py-2 text-sm font-medium',
            tab === 'pending' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground',
          )}
        >
          {t.tabPending} ({pending.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reported'}
          data-testid="moderation-tab-reported"
          onClick={() => selectTab('reported')}
          className={cn(
            'px-3 py-2 text-sm font-medium',
            tab === 'reported' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground',
          )}
        >
          {t.tabReported} ({reported.length})
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <div data-testid="moderation-list" className="flex flex-col gap-2">
          {tab === 'pending' &&
            (pending.length === 0 ? (
              <p data-testid="moderation-empty" className="text-sm text-muted-foreground">
                {t.empty}
              </p>
            ) : (
              pending.map((item) => (
                <button
                  key={item.revisionId}
                  type="button"
                  data-testid={`moderation-item-${item.revisionId}`}
                  onClick={() => select(item.revisionId)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-md border border-border p-2 text-left text-sm hover:bg-muted',
                    selectedId === item.revisionId && 'bg-muted',
                  )}
                >
                  <span className="font-medium text-foreground">{item.activityTitle}</span>
                  <span className="text-xs text-muted-foreground">{item.author.email ?? item.author.id}</span>
                </button>
              ))
            ))}

          {tab === 'reported' &&
            (reported.length === 0 ? (
              <p data-testid="moderation-empty" className="text-sm text-muted-foreground">
                {t.emptyReported}
              </p>
            ) : (
              reported.map((item) => (
                <button
                  key={item.activityId}
                  type="button"
                  data-testid={`moderation-item-${item.activityId}`}
                  onClick={() => select(item.activityId)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-md border border-border p-2 text-left text-sm hover:bg-muted',
                    selectedId === item.activityId && 'bg-muted',
                  )}
                >
                  <span className="font-medium text-foreground">{item.activityTitle}</span>
                  <span className="text-xs text-muted-foreground">{item.reports.length}</span>
                </button>
              ))
            ))}
        </div>

        <div data-testid="moderation-detail" className="flex flex-col gap-4">
          {tab === 'pending' && !selectedPending && (
            <p className="text-sm text-muted-foreground">{t.selectPrompt}</p>
          )}
          {tab === 'reported' && !selectedReported && (
            <p className="text-sm text-muted-foreground">{t.selectPrompt}</p>
          )}

          {selectedPending && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selectedPending.activityTitle}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t.byAuthor}: {selectedPending.author.email ?? selectedPending.author.id}
                    {selectedPending.submittedAt && ` · ${t.submittedAt}: ${formatDate(selectedPending.submittedAt)}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedPending.isEdit ? t.editOfLive : t.firstPublication}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="moderation-toggle-answers"
                    onClick={() => setShowAnswers((v) => !v)}
                  >
                    {showAnswers ? t.hideAnswers : t.showAnswers}
                  </Button>
                  {selectedPending.isEdit && selectedPending.publishedBlocks && (
                    <div role="group" className="flex overflow-hidden rounded-md border border-border text-xs">
                      <button
                        type="button"
                        data-testid="moderation-version-published"
                        onClick={() => setVersionView('published')}
                        className={cn('px-2 py-1', versionView === 'published' ? 'bg-muted font-medium' : '')}
                      >
                        {t.publishedVersion}
                      </button>
                      <button
                        type="button"
                        data-testid="moderation-version-new"
                        onClick={() => setVersionView('new')}
                        className={cn('px-2 py-1', versionView === 'new' ? 'bg-muted font-medium' : '')}
                      >
                        {t.newVersion}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {(blocksToShow ?? []).map((block) => (
                  <ModerationBlockPreview
                    key={block.id}
                    lang={lang}
                    block={block}
                    resolveImageUrl={resolveImageUrl}
                    showAnswers={showAnswers}
                  />
                ))}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  data-testid="moderation-reject-open"
                  onClick={() => {
                    setRejectNote('');
                    setRejectError(null);
                    setRejectOpen(true);
                  }}
                >
                  {t.reject}
                </Button>
                <Button
                  type="button"
                  data-testid="moderation-approve-open"
                  onClick={() => setApproveState({ open: true, submitting: false, error: false })}
                >
                  {t.approve}
                </Button>
              </div>
            </>
          )}

          {selectedReported && (
            <>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedReported.activityTitle}</h2>
                <p className="text-sm text-muted-foreground">
                  {t.byAuthor}: {selectedReported.author.email ?? selectedReported.author.id}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-foreground">{t.reportsLabel}</h3>
                <ul className="flex flex-col gap-2">
                  {selectedReported.reports.map((report) => (
                    <li key={report.id} data-testid={`moderation-report-${report.id}`} className="rounded-md border border-border p-2 text-sm">
                      <p className="font-medium text-foreground">{reportReasonLabels[report.reason]}</p>
                      <p className="text-muted-foreground">{report.details || t.reportDetailsNone}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  data-testid="moderation-remove-open"
                  onClick={() => setRemoveState({ open: true, submitting: false, error: false })}
                >
                  {t.remove}
                </Button>
                <Button
                  type="button"
                  data-testid="moderation-restore-open"
                  onClick={() => setRestoreState({ open: true, submitting: false, error: false })}
                >
                  {t.restore}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Approve confirmation */}
      <Dialog open={approveState.open} onOpenChange={(next) => !next && !approveState.submitting && setApproveState(CONFIRM_IDLE)}>
        <DialogContent data-testid="moderation-approve-dialog">
          <DialogHeader>
            <DialogTitle>{t.approveConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.approveConfirmBody}</p>
          {approveState.error && (
            <p data-testid="moderation-approve-error" className="text-sm text-destructive">
              {t.approveError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setApproveState(CONFIRM_IDLE)} disabled={approveState.submitting}>
              {t.confirmCancel}
            </Button>
            <Button
              type="button"
              data-testid="moderation-approve-confirm"
              onClick={() => void approve()}
              disabled={approveState.submitting}
              loading={approveState.submitting}
            >
              {t.confirmAccept}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(next) => !next && !rejectSubmitting && setRejectOpen(false)}>
        <DialogContent data-testid="moderation-reject-dialog">
          <DialogHeader>
            <DialogTitle>{t.rejectDialogTitle}</DialogTitle>
          </DialogHeader>
          <div>
            <p className="text-sm font-medium text-foreground">{t.rejectQuickPicksLabel}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(t.rejectQuickPicks).map(([key, phrase]) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`moderation-reject-quickpick-${key}`}
                  onClick={() => setRejectNote((prev) => (prev ? `${prev} ${phrase}` : phrase))}
                  className="rounded-full border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
            <span>{t.rejectNoteLabel}</span>
            <Textarea
              data-testid="moderation-reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={t.rejectNotePlaceholder}
              maxLength={500}
              rows={4}
            />
          </label>
          {rejectError && (
            <p data-testid="moderation-reject-error" className="text-sm text-destructive">
              {rejectError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)} disabled={rejectSubmitting}>
              {t.confirmCancel}
            </Button>
            <Button
              type="button"
              data-testid="moderation-reject-confirm"
              onClick={() => void reject()}
              disabled={rejectSubmitting}
              loading={rejectSubmitting}
            >
              {t.reject}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <Dialog open={restoreState.open} onOpenChange={(next) => !next && !restoreState.submitting && setRestoreState(CONFIRM_IDLE)}>
        <DialogContent data-testid="moderation-restore-dialog">
          <DialogHeader>
            <DialogTitle>{t.restoreConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.restoreConfirmBody}</p>
          {restoreState.error && (
            <p data-testid="moderation-restore-error" className="text-sm text-destructive">
              {t.restoreError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setRestoreState(CONFIRM_IDLE)} disabled={restoreState.submitting}>
              {t.confirmCancel}
            </Button>
            <Button
              type="button"
              data-testid="moderation-restore-confirm"
              onClick={() => void restore()}
              disabled={restoreState.submitting}
              loading={restoreState.submitting}
            >
              {t.confirmAccept}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <Dialog open={removeState.open} onOpenChange={(next) => !next && !removeState.submitting && setRemoveState(CONFIRM_IDLE)}>
        <DialogContent data-testid="moderation-remove-dialog">
          <DialogHeader>
            <DialogTitle>{t.removeConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.removeConfirmBody}</p>
          {removeState.error && (
            <p data-testid="moderation-remove-error" className="text-sm text-destructive">
              {t.removeError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setRemoveState(CONFIRM_IDLE)} disabled={removeState.submitting}>
              {t.confirmCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="moderation-remove-confirm"
              onClick={() => void remove()}
              disabled={removeState.submitting}
              loading={removeState.submitting}
            >
              {t.confirmAccept}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
