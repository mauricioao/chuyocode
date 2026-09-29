/**
 * MisActividadesIsland — the author's own workspace (`/[lang]/mis-actividades`,
 * PR D "Activities practice"). SSR seeds the full list via
 * `getActivitiesByAuthor` (`src/lib/activities/activities.ts`); this island
 * owns only the one interactive action the page needs — deleting an
 * activity (soft delete, `POST /api/actividades/[id]/eliminar`) — behind a
 * confirmation dialog, same shape as `SubmitForReviewDialog`/
 * `UnsavedChangesModal`. A successful delete removes the row from local
 * state; the server round trip is the source of truth, this is just so the
 * page does not need a full reload to reflect it.
 */
import { useCallback, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Level } from '@/lib/exerciseTaxonomy';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface MisActividadesActivity {
  id: string;
  title: string;
  level: Level | null;
  status: string;
  blockCount: number;
  reviewNote: string | null;
  hasPendingRevision: boolean;
}

export interface MisActividadesIslandProps {
  lang: Lang;
  initialActivities: MisActividadesActivity[];
}

/** `activities.status` -> the `editor.status*` key that names it — reused verbatim, see file header. */
const STATUS_LABEL_KEYS = {
  draft: 'statusDraft',
  pending_review: 'statusPendingReview',
  live: 'statusLive',
  rejected: 'statusRejected',
} as const;

export default function MisActividadesIsland({ lang, initialActivities }: MisActividadesIslandProps) {
  const t = UI_LABELS[lang].activities.myActivities;
  const editorT = UI_LABELS[lang].activities.editor;
  const levelLabels = UI_LABELS[lang].english.levels;

  const [activities, setActivities] = useState(initialActivities);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    id: string | null;
    title: string;
    deleting: boolean;
    error: boolean;
  }>({ open: false, id: null, title: '', deleting: false, error: false });

  const openDelete = useCallback((id: string, title: string) => {
    setDeleteDialog({ open: true, id, title, deleting: false, error: false });
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteDialog((d) => (d.deleting ? d : { open: false, id: null, title: '', deleting: false, error: false }));
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = deleteDialog.id;
    if (!id) return;
    setDeleteDialog((d) => ({ ...d, deleting: true, error: false }));
    try {
      const res = await fetch(`/api/actividades/${id}/eliminar`, { method: 'POST' });
      if (!res.ok) throw new Error('delete_failed');
      setActivities((prev) => prev.filter((a) => a.id !== id));
      setDeleteDialog({ open: false, id: null, title: '', deleting: false, error: false });
    } catch {
      setDeleteDialog((d) => ({ ...d, deleting: false, error: true }));
    }
  }, [deleteDialog.id]);

  function statusLabel(status: string): string {
    const key = STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS] ?? 'statusDraft';
    return editorT[key];
  }

  function blockCountLabel(count: number): string {
    return `${count} ${count === 1 ? t.blockCountOne : t.blockCountMany}`;
  }

  if (activities.length === 0) {
    return (
      <div
        data-testid="mis-actividades-empty"
        className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface-soft p-6 text-zinc-300"
      >
        <p>{t.empty}</p>
        <a href={`/${lang}/crear`} className={buttonVariants({ variant: 'default' })}>
          {t.createCta}
        </a>
      </div>
    );
  }

  return (
    <div data-testid="mis-actividades-list" className="flex flex-col gap-3">
      {activities.map((activity) => (
        <div
          key={activity.id}
          data-testid={`activity-row-${activity.id}`}
          className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{activity.title}</span>
              <span
                data-testid={`activity-status-${activity.id}`}
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
              >
                {statusLabel(activity.status)}
              </span>
              {activity.hasPendingRevision && (
                <span data-testid={`activity-pending-${activity.id}`} className="text-xs text-muted-foreground">
                  {t.pendingChangesNote}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <span>{activity.level ? levelLabels[activity.level] : t.noLevel}</span>
              {' · '}
              <span>{blockCountLabel(activity.blockCount)}</span>
            </div>
            {activity.status === 'rejected' && activity.reviewNote && (
              <p data-testid={`activity-review-note-${activity.id}`} className="text-xs text-destructive">
                {editorT.reviewNoteLabel}: {activity.reviewNote}
              </p>
            )}
          </div>

          <div className="flex flex-none items-center gap-2">
            <a
              href={`/${lang}/crear/${activity.id}`}
              data-testid={`activity-edit-${activity.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t.edit}
            </a>
            {activity.status === 'live' && (
              <a
                href={`/${lang}/ingles/actividades/${activity.id}`}
                data-testid={`activity-view-${activity.id}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {t.view}
              </a>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid={`activity-delete-${activity.id}`}
              onClick={() => openDelete(activity.id, activity.title)}
            >
              {t.delete}
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={deleteDialog.open} onOpenChange={(next) => !next && closeDelete()}>
        <DialogContent data-testid="delete-activity-dialog">
          <DialogHeader>
            <DialogTitle>{t.deleteConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.deleteConfirmBody}</p>
          {deleteDialog.error && (
            <p data-testid="delete-activity-error" className="text-sm text-destructive">
              {t.deleteError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              data-testid="delete-dialog-cancel"
              onClick={closeDelete}
              disabled={deleteDialog.deleting}
            >
              {t.deleteConfirmCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="delete-dialog-confirm"
              onClick={() => void confirmDelete()}
              disabled={deleteDialog.deleting}
            >
              {t.deleteConfirmAccept}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
