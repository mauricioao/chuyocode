/**
 * ThemeToggle — interactive light/dark theme switch (spec 6: theme-system).
 *
 * This is the ONLY interactive half of the theme system. The no-flash read
 * (localStorage -> `dark` class before first paint) already lives as an inline
 * script in BaseLayout.astro (design decision #9); this island owns the WRITE
 * side: on click it flips the theme, toggles the `dark` class on
 * `document.documentElement`, and persists the choice to `localStorage`.
 *
 * Hydrated with `client:load` so the button is interactive immediately. It is
 * dropped into the Header's `theme-toggle` slot by each page.
 *
 * Initial state resolution (must match the BaseLayout no-flash script):
 *   1. Explicit `localStorage.theme` ('dark' | 'light') wins.
 *   2. Otherwise fall back to the OS `prefers-color-scheme: dark`.
 * Reading these in a lazy `useState` initializer keeps the first render aligned
 * with what the no-flash script already painted, so the icon never mismatches.
 */
import { useEffect, useState } from 'react';

/** localStorage key shared with the BaseLayout no-flash script. */
const STORAGE_KEY = 'theme';

type Theme = 'light' | 'dark';

export interface ThemeToggleProps {
  /** Active locale, used only to localize the accessible label. */
  lang: string;
}

/** Localized aria-labels. Falls back to English for any unknown locale. */
const ARIA_LABELS: Record<string, string> = {
  es: 'Cambiar tema',
  en: 'Toggle theme',
};

/**
 * Resolve the initial theme the same way the no-flash script does:
 * persisted choice first, then the OS preference, then light.
 *
 * Guarded for SSR / private-mode where `window` or `localStorage` may be
 * unavailable — defaults to `light` so the server render stays deterministic.
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    /* localStorage may throw in private mode; fall through to system pref. */
  }
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export default function ThemeToggle({ lang }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Keep the DOM class + persisted value in sync whenever the theme changes.
  // This also corrects any drift between the no-flash script's result and the
  // hydrated initial state on the very first commit.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* Persistence is best-effort; ignore private-mode failures. */
    }
  }, [theme]);

  const toggle = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const label = ARIA_LABELS[lang] ?? ARIA_LABELS.en;
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 transition-theme duration-theme hover:text-accent"
    >
      {isDark ? (
        // Moon icon: shown while dark mode is active.
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="theme-icon-moon"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun icon: shown while light mode is active.
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="theme-icon-sun"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
