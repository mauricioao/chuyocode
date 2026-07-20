// @vitest-environment jsdom
/**
 * ThemeToggle island tests (spec 6: theme-system).
 *
 * Verifies the interactive write-side of the theme system:
 *  - initial icon reflects the resolved theme (sun in light, moon in dark),
 *  - the resolved theme reads localStorage first, then `prefers-color-scheme`,
 *  - clicking toggles the `dark` class on <html> and persists to localStorage.
 *
 * Runs under jsdom (per-file environment override) with Testing Library.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';

/** Install a matchMedia stub returning the given `prefers-color-scheme: dark` result. */
function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? prefersDark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the sun icon when the resolved theme is light', () => {
    window.localStorage.setItem('theme', 'light');
    render(<ThemeToggle lang="es" />);

    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
    expect(screen.queryByTestId('theme-icon-moon')).toBeNull();
  });

  it('renders the moon icon when localStorage says dark', () => {
    window.localStorage.setItem('theme', 'dark');
    render(<ThemeToggle lang="es" />);

    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
    expect(screen.queryByTestId('theme-icon-sun')).toBeNull();
  });

  it('falls back to prefers-color-scheme when localStorage is empty', () => {
    stubMatchMedia(true);
    render(<ThemeToggle lang="en" />);

    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
  });

  it('adds the dark class and persists on click (light -> dark)', () => {
    window.localStorage.setItem('theme', 'light');
    render(<ThemeToggle lang="es" />);

    // Initial state: light -> no dark class.
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(screen.getByRole('button'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
  });

  it('removes the dark class and persists on click (dark -> light)', () => {
    window.localStorage.setItem('theme', 'dark');
    render(<ThemeToggle lang="es" />);

    // Effect applies the dark class on mount for the stored dark theme.
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(screen.getByRole('button'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
  });

  it('uses a localized aria-label per lang', () => {
    render(<ThemeToggle lang="es" />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Cambiar tema',
    );

    cleanup();
    render(<ThemeToggle lang="en" />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Toggle theme',
    );
  });
});
