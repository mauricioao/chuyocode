/**
 * The editor title bar's ONE primary action (UX doc `UX-INGLES.md` 6.1 rule
 * 1, "one primary button per screen"; 6.4 "Paso 3, Comparte"). Before this,
 * the button was a fixed "Enviar a revisión" regardless of the activity's
 * own state — once an activity was sent, published or rejected, the author
 * had no idea what to do next.
 *
 * INPUTS are exactly the two status columns the editor already reads:
 * `activities.status` (`draft`/`pending_review`/`live`/`rejected` —
 * `removed` never reaches the editor, see `getActivityForEdit`'s own
 * header) and the activity's LATEST `activity_revisions.status`
 * (`draft`/`pending_review`/`approved`/`rejected`/`superseded` —
 * `enviar.ts`/`guardar.ts`'s own vocabulary, `activities.ts`'s own
 * `EditableActivity.revisionStatus`). `superseded` never actually reaches
 * this function either: it only ever marks an OLDER revision once a newer
 * one exists, and the editor always reads the latest one
 * (`getActivityForEdit`'s own `order('created_at', desc).limit(1)`).
 *
 * `live` is checked FIRST: a published activity's own `status` never flips
 * while a fresh edit is drafted or even already resubmitted (`enviar.ts`'s
 * own "`live` stays live" comment) — so for a live activity, only the
 * REVISION's status decides between "there is something new, saved, not
 * sent yet" (`draft`) and "the published version is the whole story right
 * now" (`approved` — no edit since publish, OR `pending_review` — a
 * resubmitted edit awaiting a moderator while the PUBLISHED revision keeps
 * serving; both stay shareable exactly the same).
 *
 * Outside `live`, a `pending_review` revision means "awaiting its very
 * first publication" — checked before `status` so the one documented
 * broken-invariant case (`enviar.ts`'s own step 14 comment: the revision
 * write succeeds, the activity's own status write fails right after,
 * leaving `status` stuck on `draft`/`rejected` while the revision is
 * already `pending_review`) still resolves to the state that is actually
 * true of the content. `rejected` and everything else (`draft`, or any
 * value this editor has never seen) fall back to "send it".
 */

export type EditorPrimaryActionKind =
  | 'submitForReview'
  | 'submitChangesForReview'
  | 'resubmitForReview'
  | 'useInClass'
  | 'share';

export interface EditorPrimaryActionInput {
  /** `activities.status`. */
  status: string;
  /** The activity's LATEST `activity_revisions.status`. */
  revisionStatus: string;
}

export function editorPrimaryAction({ status, revisionStatus }: EditorPrimaryActionInput): EditorPrimaryActionKind {
  if (status === 'live') {
    return revisionStatus === 'draft' ? 'submitChangesForReview' : 'share';
  }
  if (revisionStatus === 'pending_review') return 'useInClass';
  if (status === 'rejected') return 'resubmitForReview';
  return 'submitForReview';
}

/**
 * The editor's status pill (bottom-left) — same two inputs as
 * `editorPrimaryAction` above, but answering a DIFFERENT question: not "what
 * should the button do" but "what does the pill say". The gap this closes:
 * once a PUBLISHED activity's edits are saved or resubmitted, `status` itself
 * never moves off `live` (`enviar.ts`'s own "`live` stays live" comment,
 * also quoted above) — only the latest revision's status does — so the pill
 * kept reading "Publicada" forever and the author had no way to tell their
 * changes were saved or already awaiting review.
 *
 * `status` outside `live` is unchanged: `draft`/`pending_review`/`rejected`
 * (and any unrecognized value, defensively) map to their own existing key,
 * exactly like the editor's old `STATUS_LABEL_KEYS` map did — the revision
 * status plays no part there, same posture as `editorPrimaryAction`'s own
 * `live`-first check.
 */
export type EditorStatusPillKey =
  | 'statusDraft'
  | 'statusPendingReview'
  | 'statusLive'
  | 'statusRejected'
  | 'statusLivePendingChanges'
  | 'statusLiveUnsentChanges';

const STATUS_PILL_KEYS: Record<string, EditorStatusPillKey> = {
  draft: 'statusDraft',
  pending_review: 'statusPendingReview',
  live: 'statusLive',
  rejected: 'statusRejected',
};

export function editorStatusPillKey({ status, revisionStatus }: EditorPrimaryActionInput): EditorStatusPillKey {
  if (status === 'live') {
    if (revisionStatus === 'pending_review') return 'statusLivePendingChanges';
    if (revisionStatus === 'draft') return 'statusLiveUnsentChanges';
    return 'statusLive';
  }
  return STATUS_PILL_KEYS[status] ?? 'statusDraft';
}
