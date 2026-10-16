import { describe, expect, it } from 'vitest';
import { editorPrimaryAction, editorStatusPillKey } from './editorPrimaryAction';

describe('editorPrimaryAction', () => {
  it('draft, never sent — "Enviar a revisión"', () => {
    expect(editorPrimaryAction({ status: 'draft', revisionStatus: 'draft' })).toBe('submitForReview');
  });

  it('in review, first publication — "Usar en clase"', () => {
    expect(editorPrimaryAction({ status: 'pending_review', revisionStatus: 'pending_review' })).toBe('useInClass');
  });

  it('published, no unsent edits — "Compartir"', () => {
    expect(editorPrimaryAction({ status: 'live', revisionStatus: 'approved' })).toBe('share');
  });

  it('published, with saved edits not yet sent — "Enviar cambios a revisión"', () => {
    expect(editorPrimaryAction({ status: 'live', revisionStatus: 'draft' })).toBe('submitChangesForReview');
  });

  it('edits of a live activity already in review — "Compartir" (published version stays shareable)', () => {
    expect(editorPrimaryAction({ status: 'live', revisionStatus: 'pending_review' })).toBe('share');
  });

  it('rejected — "Enviar de nuevo a revisión"', () => {
    expect(editorPrimaryAction({ status: 'rejected', revisionStatus: 'rejected' })).toBe('resubmitForReview');
  });

  it('rejected, edited again since (a fresh draft revision opened by guardar.ts) — still "Enviar de nuevo a revisión"', () => {
    expect(editorPrimaryAction({ status: 'rejected', revisionStatus: 'draft' })).toBe('resubmitForReview');
  });

  // Edge: the one broken-invariant window `enviar.ts`'s own step 14 comment
  // documents — the revision write succeeds, the activity's own status
  // write fails right after, so `status` is still `draft`/`rejected` while
  // the revision is already `pending_review`. The revision is the more
  // truthful signal: something really is awaiting its first review.
  it('broken invariant: status stuck on draft while the revision is already pending_review — still "Usar en clase"', () => {
    expect(editorPrimaryAction({ status: 'draft', revisionStatus: 'pending_review' })).toBe('useInClass');
  });

  it('broken invariant: status stuck on rejected while the revision is already pending_review — still "Usar en clase"', () => {
    expect(editorPrimaryAction({ status: 'rejected', revisionStatus: 'pending_review' })).toBe('useInClass');
  });

  // `superseded` never reaches this function for the LATEST revision (it
  // only ever marks an older one) — defensively falls back like any other
  // unrecognized value: "send it" outside `live`, "share" while `live`.
  it('defensive: an unrecognized revision status outside live falls back to "Enviar a revisión"', () => {
    expect(editorPrimaryAction({ status: 'draft', revisionStatus: 'superseded' })).toBe('submitForReview');
  });

  it('defensive: an unrecognized revision status while live falls back to "Compartir"', () => {
    expect(editorPrimaryAction({ status: 'live', revisionStatus: 'superseded' })).toBe('share');
  });
});

// The status PILL's own derivation (gap fix: a published activity's edits
// used to leave the pill stuck on "Publicada" forever, since `status` itself
// never moves off `live`). Every (status, revisionStatus) combination this
// editor can show, same table shape as `editorPrimaryAction`'s own tests
// above.
describe('editorStatusPillKey', () => {
  it('draft status, draft revision — "Borrador"', () => {
    expect(editorStatusPillKey({ status: 'draft', revisionStatus: 'draft' })).toBe('statusDraft');
  });

  it('pending_review status — "En revisión", whatever the revision status', () => {
    expect(editorStatusPillKey({ status: 'pending_review', revisionStatus: 'pending_review' })).toBe(
      'statusPendingReview',
    );
  });

  it('rejected status — "Rechazada", whatever the revision status', () => {
    expect(editorStatusPillKey({ status: 'rejected', revisionStatus: 'rejected' })).toBe('statusRejected');
    expect(editorStatusPillKey({ status: 'rejected', revisionStatus: 'draft' })).toBe('statusRejected');
    expect(editorStatusPillKey({ status: 'rejected', revisionStatus: 'pending_review' })).toBe('statusRejected');
  });

  it('live, no unsent edits (approved revision) — "Publicada"', () => {
    expect(editorStatusPillKey({ status: 'live', revisionStatus: 'approved' })).toBe('statusLive');
  });

  it('live, saved edits not sent yet (draft revision) — "Publicada · cambios sin enviar"', () => {
    expect(editorStatusPillKey({ status: 'live', revisionStatus: 'draft' })).toBe('statusLiveUnsentChanges');
  });

  it('THE GAP: live, edits already resubmitted (pending_review revision) — "Cambios en revisión"', () => {
    expect(editorStatusPillKey({ status: 'live', revisionStatus: 'pending_review' })).toBe(
      'statusLivePendingChanges',
    );
  });

  it('defensive: an unrecognized revision status while live falls back to "Publicada"', () => {
    expect(editorStatusPillKey({ status: 'live', revisionStatus: 'superseded' })).toBe('statusLive');
  });

  it('defensive: an unrecognized status outside live falls back to "Borrador"', () => {
    expect(editorStatusPillKey({ status: 'unknown', revisionStatus: 'draft' })).toBe('statusDraft');
  });
});
