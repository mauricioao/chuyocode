'use client';

/**
 * Toaster — one `<Toaster />` island, mounted once in `BaseLayout.astro`
 * (`client:load`, same as `ScrollToTop`), backing every `toast()` call
 * site-wide (autosave error, "Enlace copiado", "Enviado a revisión",
 * "Actividad duplicada", "Reporte enviado" — see each feature's own island).
 *
 * Dark theme; bottom-center on phones, bottom-right on desktop (owner spec)
 * — sonner's own `position` prop is static, so the breakpoint is read via
 * `matchMedia` in an effect (client-only, like `ScrollToTop`'s reduced-motion
 * check) rather than during render, to avoid an SSR/client mismatch. A
 * success toast gets the accent-colored `CheckCircle` (filled), matching the
 * editor's own autosave "saved" icon (`SaveStatusIndicator.tsx`) instead of
 * sonner's default green check.
 *
 * PENDING TOAST (account deletion's own "redirect to home with a
 * confirmation toast"): a success that is immediately followed by a HARD
 * navigation (`window.location.assign`, `DeleteAccountDialog`) tears this
 * whole tree down before any toast fired just before it could ever render.
 * `readAndClearPendingToast` (`@/lib/pendingToast`) is the one-shot
 * `sessionStorage` relay the WRITER uses instead — this is the one, global
 * place that relay is read back, on every mount, so it fires on whichever
 * page the navigation actually landed on.
 */
import { useEffect, useState } from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { readAndClearPendingToast } from '@/lib/pendingToast';

const NARROW_QUERY = '(max-width: 640px)';

export default function Toaster() {
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right'>('bottom-right');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const update = () => setPosition(mq.matches ? 'bottom-center' : 'bottom-right');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const message = readAndClearPendingToast();
    if (message) toast.success(message);
  }, []);

  return (
    <SonnerToaster
      theme="dark"
      position={position}
      // UI round 2 (visual pass): the default edge offset put a bottom-
      // anchored toast right on top of the activity stage's own floating
      // "Comprobar"/"Reintentar" bar and the desk's minimized-windows tray
      // — both also fixed to the bottom-right corner
      // (`FLOATING_CHECK_BAR_CLASS`/`MinimizedWindowsTray.astro`). A bigger
      // bottom offset only (top is unused) clears both regardless of which
      // page/position is showing. Sonner uses a SEPARATE `mobileOffset`
      // below its own 600px breakpoint — `offset` alone left a phone-width
      // toast overlapping the floating Comprobar bar (verified: both boxes
      // shared the same y-range at 390x844), so both must be set.
      offset={{ bottom: '88px' }}
      mobileOffset={{ bottom: '88px' }}
      icons={{
        success: <CheckCircleIcon weight="fill" className="text-success" aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'rounded-(--radius-card) border border-border bg-popover text-popover-foreground shadow-(--shadow-floating)',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}
