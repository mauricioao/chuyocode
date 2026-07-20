/**
 * AdModal — rewarded-ads unlock island (spec 4: rewarded-ads).
 *
 * Rendered on obscured (pass-less) gated pages. It shows an ad placeholder and a
 * "Watch ad to unlock" CTA. The flow (design decision #7, simplified for v1):
 *
 *   1. User clicks Watch Ad -> a simulated ad "plays" (3s countdown). The modal
 *      cannot be dismissed while the ad is playing.
 *   2. On completion the island POSTs `{ timestamp: Date.now() }` to
 *      `/api/validar-anuncio`. The SECRET never touches the client — the server
 *      validates freshness and mints the signed pass cookie.
 *   3. On `{ ok: true }` it shows a success state and reloads the page, so the
 *      next SSR render picks up the new cookie and reveals the full content.
 *   4. On a non-ok response (or network error) it shows an error state with a
 *      retry affordance.
 *
 * Hydrated with `client:load` so the CTA is interactive immediately. All
 * user-facing text is localized (es/en). Accessibility: `role="dialog"` +
 * `aria-modal`, labelled title, Escape dismisses (except during playback).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Endpoint that validates the ad and issues the pass cookie. */
const VALIDATE_URL = '/api/validar-anuncio';

/** Simulated ad duration before validation fires: 3 seconds. */
export const AD_DURATION_SECONDS = 3;

export interface AdModalProps {
  /** Active locale; drives all copy. Falls back to English for unknown values. */
  lang: string;
}

type Phase = 'idle' | 'playing' | 'validating' | 'success' | 'error';

interface Copy {
  title: string;
  placeholder: string;
  watch: string;
  playing: (secondsLeft: number) => string;
  validating: string;
  success: string;
  error: string;
  retry: string;
  close: string;
}

const COPY: Record<'es' | 'en', Copy> = {
  es: {
    title: 'Contenido premium',
    placeholder: 'Tu anuncio aquí',
    watch: 'Ver anuncio para desbloquear',
    playing: (s) => `Reproduciendo anuncio… ${s}s`,
    validating: 'Validando…',
    success: '¡Desbloqueado! Redirigiendo…',
    error: 'No se pudo validar el anuncio. Intentá de nuevo.',
    retry: 'Reintentar',
    close: 'Cerrar',
  },
  en: {
    title: 'Premium content',
    placeholder: 'Your ad here',
    watch: 'Watch ad to unlock',
    playing: (s) => `Playing ad… ${s}s`,
    validating: 'Validating…',
    success: 'Unlocked! Redirecting…',
    error: 'Could not validate the ad. Please try again.',
    retry: 'Retry',
    close: 'Close',
  },
};

/** Resolve copy for a locale, defaulting to English. */
function copyFor(lang: string): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

export default function AdModal({ lang }: AdModalProps) {
  const t = copyFor(lang);

  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(AD_DURATION_SECONDS);

  // Interval handle for the countdown, so we can clear it on unmount.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  /** POST the completion timestamp; the server mints the pass cookie. */
  const validate = useCallback(async () => {
    setPhase('validating');
    try {
      const res = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now() }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (res.ok && data.ok === true) {
        setPhase('success');
        // Reload so SSR re-renders the now-unlocked content with the new cookie.
        window.location.reload();
        return;
      }
      setPhase('error');
    } catch {
      setPhase('error');
    }
  }, []);

  /** Start the simulated ad: a 3s countdown, then validation. */
  const startAd = useCallback(() => {
    setPhase('playing');
    setSecondsLeft(AD_DURATION_SECONDS);
    clearTimer();
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          void validate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer, validate]);

  // Escape dismisses the modal — but never while the ad is playing or validating.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') {
        return;
      }
      if (phase === 'playing' || phase === 'validating' || phase === 'success') {
        return;
      }
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (!open) {
    return null;
  }

  const dismissable = phase === 'idle' || phase === 'error';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-modal-title"
      data-testid="ad-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4"
      onClick={(e) => {
        // Backdrop click dismisses only when safe (not mid-ad).
        if (e.target === e.currentTarget && dismissable) {
          setOpen(false);
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-accent/30 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="ad-modal-title"
            className="text-lg font-semibold text-zinc-100"
          >
            {t.title}
          </h2>
          {dismissable && (
            <button
              type="button"
              aria-label={t.close}
              onClick={() => setOpen(false)}
              className="text-zinc-400 transition-colors hover:text-zinc-200"
            >
              &times;
            </button>
          )}
        </div>

        {/* Ad placeholder — swapped for a real ad unit in a later iteration. */}
        <div
          data-testid="ad-placeholder"
          className="mb-5 flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 text-sm font-medium text-zinc-500"
        >
          {t.placeholder}
        </div>

        {phase === 'idle' && (
          <button
            type="button"
            onClick={startAd}
            className="w-full rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-500"
          >
            {t.watch}
          </button>
        )}

        {phase === 'playing' && (
          <p
            data-testid="ad-status"
            className="text-center text-sm font-medium text-zinc-300"
          >
            {t.playing(secondsLeft)}
          </p>
        )}

        {phase === 'validating' && (
          <p
            data-testid="ad-status"
            className="text-center text-sm font-medium text-zinc-300"
          >
            {t.validating}
          </p>
        )}

        {phase === 'success' && (
          <p
            data-testid="ad-success"
            className="text-center text-sm font-semibold text-green-400"
          >
            {t.success}
          </p>
        )}

        {phase === 'error' && (
          <div className="flex flex-col gap-3">
            <p
              data-testid="ad-error"
              className="text-center text-sm font-medium text-red-400"
            >
              {t.error}
            </p>
            <button
              type="button"
              onClick={startAd}
              className="w-full rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-500"
            >
              {t.retry}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
