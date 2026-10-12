/**
 * myActivityStatusNotice — the desk's own DOM/`localStorage`/`sonner` glue
 * for the "Mis actividades" status-change toast (N4, resolves
 * `UX-INGLES.md`'s F3: "el autor no se entera de la aprobación o del
 * rechazo"). The actual diff is pure
 * (`@lib/ingles/myActivityStatusToasts#diffMyActivityStatusSnapshot`); this
 * module is just the thin DOM-facing shell around it — same "pure reducer in
 * `@lib/`, DOM glue in `@lib/ui/`" split every other desk script already
 * uses.
 *
 * Mounted once per HOST page by `DeskHost.astro`'s own init script, fed the
 * author's CURRENT `{id, title, status}` list straight from
 * `loadDeskSceneData` (`DeskSceneData.myActivitiesStatuses`) — `null` there
 * (an anonymous visitor, the TEMP local-dev screenshot override only) skips
 * this module entirely; `DeskHost.astro` never even renders its data
 * attributes in that case, so there is nothing for a fresh HOST page to
 * read.
 *
 * STORAGE FAILURES NEVER BREAK THE DESK (owner spec): every `localStorage`
 * access is wrapped in its own `try/catch` — a private-browsing mode, a
 * blocked/full storage, or a disabled API all just silently skip the notice
 * for that load, same posture `deskWindowsPersistence.ts`'s own
 * `sessionStorage` wrapper already has.
 */
import { toast } from 'sonner';
import {
  diffMyActivityStatusSnapshot,
  MY_ACTIVITY_STATUS_STORAGE_KEY,
  type MyActivityStatusEntry,
  type MyActivityStatusSnapshot,
} from '../ingles/myActivityStatusToasts';

export interface MyActivityStatusNoticeLabels {
  lang: string;
  /** "Tu actividad «{title}» ya está publicada" — `{title}` is replaced here. */
  published: string;
  /** "Tu actividad «{title}» necesita cambios" — `{title}` is replaced here. */
  rejected: string;
  viewLabel: string;
  fixLabel: string;
}

function readSnapshot(storage: Storage): MyActivityStatusSnapshot | null {
  try {
    const raw = storage.getItem(MY_ACTIVITY_STATUS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as MyActivityStatusSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(storage: Storage, snapshot: MyActivityStatusSnapshot): void {
  try {
    storage.setItem(MY_ACTIVITY_STATUS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Full/blocked/disabled storage — the notice itself still ran this load
    // (see this module's own header); just nothing to persist for next time.
  }
}

/**
 * @param current - The author's own list, exactly as `loadDeskSceneData`
 * read it THIS render — never re-fetched here.
 * @param win - Overridable for tests; defaults to the real `window`.
 */
export function initMyActivityStatusNotice(
  current: readonly MyActivityStatusEntry[],
  labels: MyActivityStatusNoticeLabels,
  win: Window = window,
): void {
  let storage: Storage | null = null;
  try {
    storage = win.localStorage;
  } catch {
    storage = null;
  }
  if (!storage) return;

  const previous = readSnapshot(storage);
  const { toasts, snapshot } = diffMyActivityStatusSnapshot(previous, current);

  for (const entry of toasts) {
    const template = entry.kind === 'published' ? labels.published : labels.rejected;
    const message = template.replace('{title}', entry.title);
    const href =
      entry.kind === 'published'
        ? `/${labels.lang}/ingles/actividades/${entry.id}`
        : `/${labels.lang}/crear/${entry.id}`;
    const actionLabel = entry.kind === 'published' ? labels.viewLabel : labels.fixLabel;
    toast(message, {
      action: {
        label: actionLabel,
        // No global hook into the desk's own window manager (see this
        // feature's own PR description) — a plain top-level navigation,
        // which every window route already host-renders itself from
        // (`@lib/ui/embeddedWindow`'s own header), same documented fallback
        // as "otherwise a normal link".
        onClick: () => {
          win.location.href = href;
        },
      },
    });
  }

  writeSnapshot(storage, snapshot);
}
