/**
 * TurnstileWidget — thin React wrapper around Cloudflare Turnstile's
 * `explicit` rendering API, shared by every email/password auth form
 * (`PasswordAuthForm`, `SignInForm`).
 *
 * ONLY ever mounted by a caller that already confirmed
 * `@lib/turnstile`'s `getTurnstileSiteKey()` returned a usable key — see
 * that module's header. This component itself does not read the env var, so
 * there is no key to be absent/blank from its own point of view; a caller
 * that mounts it unconditionally would defeat the whole point.
 *
 * Renders a STABLE container on every render, server or client
 * (`<div ref={...} />`, no conditional markup, no `window`/`document` read
 * during render) — the hydration rule this codebase enforces the hard way
 * (React #418): all browser work happens in effects, never in render.
 *
 * The widget script is loaded at most ONCE per page load, through a single
 * module-level promise shared by every instance, so mounting this component
 * twice (e.g. a future page with two forms) never injects a second
 * `<script>` tag.
 */
import { useEffect, useRef } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The slice of Turnstile's `render` options this wrapper actually sets. */
interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  theme: 'light' | 'dark' | 'auto';
  language: string;
}

/** The slice of the global `window.turnstile` object this wrapper calls. */
interface TurnstileGlobal {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

/** Shared across every mount on the page, so the script tag is injected once. */
let scriptLoadPromise: Promise<void> | null = null;

/** Load Turnstile's script exactly once per page and resolve once it is ready. */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject(new Error('Failed to load the Turnstile script')));
      document.head.appendChild(script);
    });
  }
  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  /** Non-empty Turnstile site key — see the file header. */
  siteKey: string;
  /** Widget UI language; the auth islands pass the page's own `lang`. */
  language: string;
  /** Called with the token on success, and with `null` on expiry or error. */
  onToken: (token: string | null) => void;
  /**
   * Bump this (e.g. a counter incremented on every submit attempt) to reset
   * the widget and force a fresh token — Turnstile tokens are single-use.
   * Only a CHANGE triggers a reset; the initial value never does.
   */
  resetSignal: number;
}

export default function TurnstileWidget({
  siteKey,
  language,
  onToken,
  resetSignal,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Kept current without re-running the mount effect below on every parent
  // render — only `siteKey`/`language` ever justify re-rendering the widget.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          // The site ships `<html class="dark">` unconditionally — see
          // `src/layouts/BaseLayout.astro`'s header — so there is no light
          // mode to match here.
          theme: 'dark',
          language,
        });
      })
      .catch(() => {
        // Script failed to load (offline, blocked, …). Treated exactly like
        // an `error-callback`: no token, submit stays disabled, rather than
        // throwing inside an effect.
        onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, language]);

  const isFirstResetRef = useRef(true);
  useEffect(() => {
    if (isFirstResetRef.current) {
      // The initial value must never trigger a reset — only a later change
      // (a submit attempt) does. See the prop doc above.
      isFirstResetRef.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  return <div ref={containerRef} data-testid="turnstile-widget" />;
}
