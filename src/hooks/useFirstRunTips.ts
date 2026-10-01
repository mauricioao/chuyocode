/**
 * useFirstRunTips — a small sequential onboarding tour's state (owner build
 * item 6, "first-run anchored tooltips"): which step is active (or `null`,
 * meaning "not showing"), and the `next`/`dismiss` actions that advance or
 * end it, persisting "already seen" to `localStorage` so the tour shows only
 * once per browser.
 *
 * HYDRATION-SAFE BY CONSTRUCTION (`src/testSupport/hydrationHarness.tsx`'s
 * own convention): `localStorage` is read ONLY inside the mount `useEffect`
 * below, never during render, so the server render and the client's FIRST
 * paint both start at `step: null` (nothing shown) — identical markup, no
 * recoverable hydration error. The tour only ever appears a tick after
 * mount, once the effect has actually read the flag.
 *
 * `try`/`catch` around every `localStorage` access: a private-browsing tab,
 * a blocked storage API, or a full quota must never throw past this hook —
 * the tour simply does not persist its "seen" state for that visit (shown
 * again next time) rather than crashing the whole editor.
 */
import { useEffect, useState } from 'react';

export interface FirstRunTips {
  /** The active 0-based step, or `null` while inactive (already seen, not yet determined, or dismissed/finished). */
  step: number | null;
  /** Advance to the next step, or end the tour (and persist "seen") once the last step is passed. */
  next: () => void;
  /** End the tour right away and persist "seen" — the explicit "skip" action. */
  dismiss: () => void;
}

function readSeen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

function markSeen(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Storage unavailable — the tour just shows again next visit; never throw.
  }
}

export function useFirstRunTips(storageKey: string, totalSteps: number): FirstRunTips {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (readSeen(storageKey)) return;
    setStep(0);
    // Only on mount — re-running this on a later `storageKey`/`totalSteps`
    // change is not a real scenario for this hook's one caller per tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setStep(null);
    markSeen(storageKey);
  }

  function next() {
    setStep((current) => {
      if (current === null) return current;
      const upcoming = current + 1;
      if (upcoming >= totalSteps) {
        markSeen(storageKey);
        return null;
      }
      return upcoming;
    });
  }

  return { step, next, dismiss };
}
