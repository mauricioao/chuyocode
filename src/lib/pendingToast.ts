/**
 * pendingToast — per-tab `sessionStorage` relay for a success toast that
 * must survive a HARD navigation (account deletion's own "redirect to home
 * with a confirmation toast": `window.location.assign` tears down the
 * current page, including whatever `<Toaster />` was showing, before a
 * toast fired just before the navigation could ever be seen).
 *
 * The WRITER already knows the fully-resolved, localized message (it reads
 * `UI_LABELS[lang]` itself) — this module stores that literal string, never
 * a key/lang pair to resolve later, so the READER (`Toaster.tsx`, mounted
 * once, globally, with no `lang` prop of its own) needs no i18n dictionary
 * at all.
 *
 * `sessionStorage`, not `localStorage`, same reasoning as `meCache.ts`: this
 * is a one-shot, tab-scoped relay for the very next page load, never state
 * meant to survive the browser closing. Every access is wrapped in
 * try/catch — see that module's header for why a storage failure must never
 * be allowed to crash the page it is merely decorating.
 */

const STORAGE_KEY = 'chuyocode:pendingToast:v1';

/** Resolve `sessionStorage`, or `undefined` if unreachable (SSR, a throwing accessor, a locked-down embed). */
function getStorage(explicit?: Storage): Storage | undefined {
  if (explicit) return explicit;
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Stash a success-toast message to show on the NEXT page load. Silently no-ops on a storage failure. */
export function writePendingToast(message: string, storage?: Storage): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, message);
  } catch {
    // Ignored — see file header.
  }
}

/**
 * Read and CLEAR the pending toast message, if any — a one-shot read: a
 * later page load (or a refresh of the same one) never sees it again.
 * `undefined` means "nothing pending", not "empty string pending".
 */
export function readAndClearPendingToast(storage?: Storage): string | undefined {
  const store = getStorage(storage);
  if (!store) return undefined;
  try {
    const value = store.getItem(STORAGE_KEY);
    if (value === null) return undefined;
    store.removeItem(STORAGE_KEY);
    return value;
  } catch {
    return undefined;
  }
}
