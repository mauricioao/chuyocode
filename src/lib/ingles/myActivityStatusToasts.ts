/**
 * myActivityStatusToasts — pure snapshot-diff for the desk's own
 * status-change notice (N4, resolves `UX-INGLES.md`'s F3: "el autor no se
 * entera de la aprobación o del rechazo").
 *
 * Compares the author's CURRENT `{id, title, status}` list (as
 * `loadDeskSceneData` already reads it from `getActivitiesByAuthor`) against
 * the LAST snapshot the desk's own init script stored in `localStorage`
 * ({@link MY_ACTIVITY_STATUS_STORAGE_KEY}) and returns the toasts to show
 * plus the fresh snapshot to persist — zero DOM/storage access here, same
 * pure-reducer posture as `@lib/deskWindowsState`.
 *
 * - No previous snapshot (the first visit this browser has ever recorded):
 *   nothing "changed" from the visitor's point of view yet — no toasts, just
 *   the seed to store silently.
 * - An activity missing from the PREVIOUS snapshot (created since the last
 *   visit) is never a status CHANGE either — no toast, same reasoning.
 * - Only two transitions are ever worth announcing on the desk (owner
 *   spec): -> `'live'` ("ya está publicada") and -> `'rejected'` ("necesita
 *   cambios"). Every other transition (e.g. draft -> pending_review) stays
 *   silent.
 * - At most {@link MAX_TOASTS} toasts per load (owner spec) — in the
 *   author's own list order (newest-updated-first, same order
 *   `getActivitiesByAuthor` already returns), never re-sorted here.
 */

export interface MyActivityStatusEntry {
  id: string;
  title: string;
  status: string;
}

export type MyActivityStatusSnapshot = Record<string, { title: string; status: string }>;

export type MyActivityStatusToastKind = 'published' | 'rejected';

export interface MyActivityStatusToast {
  id: string;
  title: string;
  kind: MyActivityStatusToastKind;
}

/** The desk's own `localStorage` key for the last-seen snapshot — read/written by the init script this module feeds, never read here. */
export const MY_ACTIVITY_STATUS_STORAGE_KEY = 'ingles-my-activity-status-v1';

const MAX_TOASTS = 3;

export function diffMyActivityStatusSnapshot(
  previous: MyActivityStatusSnapshot | null,
  current: readonly MyActivityStatusEntry[],
): { toasts: MyActivityStatusToast[]; snapshot: MyActivityStatusSnapshot } {
  const snapshot: MyActivityStatusSnapshot = {};
  for (const entry of current) {
    snapshot[entry.id] = { title: entry.title, status: entry.status };
  }

  if (previous === null) {
    return { toasts: [], snapshot };
  }

  const toasts: MyActivityStatusToast[] = [];
  for (const entry of current) {
    if (toasts.length >= MAX_TOASTS) break;
    const before = previous[entry.id];
    if (!before || before.status === entry.status) continue;
    if (entry.status === 'live') {
      toasts.push({ id: entry.id, title: entry.title, kind: 'published' });
    } else if (entry.status === 'rejected') {
      toasts.push({ id: entry.id, title: entry.title, kind: 'rejected' });
    }
  }

  return { toasts, snapshot };
}
