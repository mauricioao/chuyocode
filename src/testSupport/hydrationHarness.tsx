/**
 * hydrationHarness — shared SSR-then-hydrate mismatch detector (Bug 1,
 * "React error #418 on the practice page").
 *
 * Renders a component tree with `renderToString` while real browser globals
 * are UNAVAILABLE — `window` itself is deleted from `globalThis` for the
 * duration of that call, exactly matching Astro's real Node SSR (no DOM at
 * all) rather than jsdom's own always-present `window` — then `hydrateRoot`s
 * the SAME element against configurable browser-like globals (`matchMedia`,
 * `sessionStorage`, `localStorage`, `speechSynthesis`, `location.search`),
 * capturing every `onRecoverableError` React reports. A production React
 * error #418 IS exactly a reported recoverable hydration error, so a test
 * built on this fails the instant any component's first client render
 * disagrees with what the server actually sent — the same signal the owner
 * saw duplicated in the browser console.
 *
 * Every component in this codebase that reads a browser API guards it with
 * `typeof window === 'undefined'` (see `useIsDesktop`/`usePrefersReducedMotion`/
 * `meCache`'s own headers) — deleting `window` here relies on exactly that
 * existing convention rather than introducing a new one.
 */
import { act } from 'react';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';

export interface BrowserGlobalsOptions {
  /** `matchMedia(query).matches` for the client/hydration pass. Defaults to always `false` (narrow viewport, no reduced-motion preference) when omitted. */
  matches?: (query: string) => boolean;
  /** Seeded `sessionStorage` entries, present only for the client/hydration pass. */
  sessionStorage?: Record<string, string>;
  /** Seeded `localStorage` entries, present only for the client/hydration pass. */
  localStorage?: Record<string, string>;
  /** Whether the client/hydration pass simulates a browser that ships the Web Speech API (jsdom itself has none). Defaults to `false`. */
  speechSynthesisSupported?: boolean;
  /** `location.search` for the client/hydration pass (e.g. `?auth=signed-in`). */
  locationSearch?: string;
}

function installClientGlobals(options: BrowserGlobalsOptions): void {
  const matches = options.matches ?? (() => false);
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  window.sessionStorage.clear();
  for (const [key, value] of Object.entries(options.sessionStorage ?? {})) {
    window.sessionStorage.setItem(key, value);
  }
  window.localStorage.clear();
  for (const [key, value] of Object.entries(options.localStorage ?? {})) {
    window.localStorage.setItem(key, value);
  }

  if (options.speechSynthesisSupported) {
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        cancel: () => {},
        speak: () => {},
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: function SpeechSynthesisUtterance() {},
      configurable: true,
      writable: true,
    });
  } else {
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  }

  const url = new URL(window.location.href);
  url.search = options.locationSearch ?? '';
  window.history.replaceState(null, '', url);
}

export interface HydrationCheckResult {
  /** Every error React's `onRecoverableError` reported while hydrating — empty means a clean hydration (no #418). */
  recoverableErrors: unknown[];
  /** The server-rendered HTML, for assertions on what the server actually sent. */
  html: string;
  container: HTMLDivElement;
}

/**
 * Renders `element()` like real Node SSR (no `window` at all), then hydrates
 * that exact markup against `clientGlobals`, returning every recoverable
 * hydration error React reported. `element` is a factory (not a bare
 * element) so the same tree can be constructed twice independently — once
 * for the server pass, once for the client pass — the way two separate
 * requests/processes genuinely would.
 */
export async function renderThenHydrate(
  element: () => ReactElement,
  clientGlobals: BrowserGlobalsOptions = {},
): Promise<HydrationCheckResult> {
  const savedWindow = globalThis.window;
  // @ts-expect-error -- deliberately simulating "no window" (real server), restored below
  delete globalThis.window;
  let html: string;
  try {
    html = renderToString(element());
  } finally {
    globalThis.window = savedWindow;
  }

  installClientGlobals(clientGlobals);

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const recoverableErrors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, element(), {
      onRecoverableError: (error) => {
        recoverableErrors.push(error);
      },
    });
  });

  // Detach right away (a caller can still inspect the returned `container`
  // node itself, just no longer attached to `document`) — this harness is
  // called repeatedly across many tests in the same file, and an attached
  // leftover container (plus whatever `id`s/portals it mounted, e.g.
  // `UserMenu`'s mobile-menu slot) would otherwise leak into every test
  // after it in the same run.
  container.remove();

  return { recoverableErrors, html, container };
}
