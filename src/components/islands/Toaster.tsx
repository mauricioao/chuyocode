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
 */
import { useEffect, useState } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';

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

  return (
    <SonnerToaster
      theme="dark"
      position={position}
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
