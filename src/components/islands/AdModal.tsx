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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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

/**
 * REGISTER (standing project rule): neutral Spanish, no voseo. Instructions use
 * the infinitive — `Intentar`, not `Intentá` — and nothing addresses the reader
 * with a second-person verb, which removes the tú/vos fork instead of picking a
 * side of it. The site is not Argentina-specific.
 *
 * Exported for that guard: like `ExerciseIsland`, this island deliberately
 * keeps its copy local rather than importing `UI_LABELS`, so the Astro-side
 * i18n module never reaches the client bundle. That makes this map the only
 * place `AdModal.test.tsx` can read the Spanish it ships.
 */
export const COPY: Record<'es' | 'en', Copy> = {
  es: {
    title: 'Contenido premium',
    placeholder: 'Tu anuncio aquí',
    watch: 'Ver anuncio para desbloquear',
    playing: (s) => `Reproduciendo anuncio… ${s}s`,
    validating: 'Validando…',
    success: '¡Desbloqueado! Redirigiendo…',
    // Statement + infinitive instruction, the same shape the English section
    // already uses ("Todavía no hay ejercicios … Probar con otro tema.").
    error: 'No se pudo validar el anuncio. Intentar de nuevo.',
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

  // The modal is non-dismissable mid-ad: only 'idle'/'error' phases may close.
  const dismissable = phase === 'idle' || phase === 'error';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Ignore close requests (Escape, overlay, X) while the ad is running.
        if (!next && !dismissable) return;
        setOpen(next);
      }}
    >
      <DialogContent
        data-testid="ad-modal"
        showCloseButton={dismissable}
        onEscapeKeyDown={(e) => {
          if (!dismissable) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (!dismissable) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>

        {/* Ad placeholder — swapped for a real ad unit in a later iteration. */}
        <div
          data-testid="ad-placeholder"
          className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 text-sm font-medium text-muted-foreground"
        >
          {t.placeholder}
        </div>

        {phase === 'idle' && (
          <Button type="button" onClick={startAd} className="w-full">
            {t.watch}
          </Button>
        )}

        {(phase === 'playing' || phase === 'validating') && (
          <p
            data-testid="ad-status"
            className="text-center text-sm font-medium text-muted-foreground"
          >
            {phase === 'playing' ? t.playing(secondsLeft) : t.validating}
          </p>
        )}

        {phase === 'success' && (
          <p
            data-testid="ad-success"
            className="text-center text-sm font-semibold text-emerald-400"
          >
            {t.success}
          </p>
        )}

        {phase === 'error' && (
          <div className="flex flex-col gap-3">
            <p
              data-testid="ad-error"
              className="text-center text-sm font-medium text-destructive"
            >
              {t.error}
            </p>
            <Button type="button" onClick={startAd} className="w-full">
              {t.retry}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
