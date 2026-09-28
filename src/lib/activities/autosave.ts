/**
 * Autosave scheduler (creator polish round 2, owner request #8): debounce a
 * stream of "something changed" notifications into a single save call ~3s
 * after the last one, NEVER run two saves in flight (a save that finishes
 * while a newer value is waiting immediately re-runs with that latest value,
 * rather than dropping it or overlapping requests), and skip a save whose
 * value is unchanged from what is already saved.
 *
 * Zero I/O of its own: `save` is supplied by the caller (the real one hits
 * `POST /api/actividades/:id/guardar`; a test supplies a fake). This module
 * only owns the TIMING and IN-FLIGHT bookkeeping, driven by real
 * `setTimeout`/`clearTimeout` — a test using `vi.useFakeTimers()` drives it
 * deterministically, the same way this project already tests debounced code
 * elsewhere.
 */

export type AutosaveStatus = 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveSchedulerOptions<T> {
  /** Delay after the last change before a save fires. Defaults to 3000ms. */
  delayMs?: number;
  /** Persist `value`. Rejecting/throwing is reported as the `'error'` status. */
  save: (value: T) => Promise<void>;
  /** Called on every status transition — drives the save-status icon. */
  onStatusChange: (status: AutosaveStatus) => void;
  /** Equality check used to skip a no-op save. Defaults to `Object.is`. */
  isEqual?: (a: T, b: T) => boolean;
}

export interface AutosaveScheduler<T> {
  /** Report that the editor's value changed to `value` — (re)starts the debounce timer. */
  notifyChange(value: T): void;
  /** Save now: flushes a pending debounce, or retries after an error. No-op if there is nothing to save. */
  flushNow(): void;
  /**
   * Force-save `value` right now, regardless of whether it differs from
   * what's already saved — a manual save action (the save button, Ctrl/⌘+S,
   * or "Reintentar") always attempts a real round trip, unlike the
   * skip-if-unchanged rule `notifyChange` applies for AUTOsaves. Still
   * single-flight: an already-in-flight save is not overlapped, this is
   * queued to run immediately after it.
   */
  saveNow(value: T): void;
  /** Stop the scheduler — no further timers fire and no in-flight result is reported. Call on unmount. */
  dispose(): void;
}

export function createAutosaveScheduler<T>(
  options: AutosaveSchedulerOptions<T>,
): AutosaveScheduler<T> {
  const delayMs = options.delayMs ?? 3000;
  const isEqual = options.isEqual ?? Object.is;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSaved: T | undefined;
  let hasSavedOnce = false;
  let latestValue: T | undefined;
  let hasPendingValue = false;
  let saving = false;
  let disposed = false;
  let rerunAfterSave = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function runSave(): void {
    if (disposed || !hasPendingValue) return;
    if (saving) {
      // A save is already in flight: queue the latest rather than starting
      // a second, overlapping request.
      rerunAfterSave = true;
      return;
    }

    const valueToSave = latestValue as T;
    hasPendingValue = false;
    saving = true;
    options.onStatusChange('saving');

    options.save(valueToSave).then(
      () => {
        saving = false;
        if (disposed) return;
        lastSaved = valueToSave;
        hasSavedOnce = true;
        options.onStatusChange('saved');
        if (rerunAfterSave) {
          rerunAfterSave = false;
          runSave();
        }
      },
      () => {
        saving = false;
        if (disposed) return;
        // Put the value back so a later notifyChange/flushNow can retry it.
        latestValue = valueToSave;
        hasPendingValue = true;
        rerunAfterSave = false;
        options.onStatusChange('error');
      },
    );
  }

  return {
    notifyChange(value: T) {
      if (disposed) return;

      if (hasSavedOnce && !saving && isEqual(lastSaved as T, value)) {
        // Back to exactly what is already saved (e.g. undone) — nothing to
        // do; drop any stale pending save for an intermediate value.
        hasPendingValue = false;
        clearTimer();
        options.onStatusChange('saved');
        return;
      }

      latestValue = value;
      hasPendingValue = true;
      clearTimer();
      options.onStatusChange('pending');
      timer = setTimeout(() => {
        timer = null;
        runSave();
      }, delayMs);
    },

    flushNow() {
      if (disposed || !hasPendingValue) return;
      clearTimer();
      runSave();
    },

    saveNow(value: T) {
      if (disposed) return;
      clearTimer();
      latestValue = value;
      hasPendingValue = true;
      runSave();
    },

    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
