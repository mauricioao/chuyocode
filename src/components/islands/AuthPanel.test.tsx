// @vitest-environment jsdom
/**
 * AuthPanel tests — the sign-in page's wrapper around `PasswordAuthForm`.
 *
 * The magic-link toggle/form is hidden (see `AuthPanel.tsx`'s file header),
 * so this suite only proves the password form always renders and that
 * `next`/`initialMode` reach it — the magic-link behavior itself stays
 * covered by `SignInForm.test.tsx`, untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AuthPanel from './AuthPanel';
import { COPY as PASSWORD_COPY } from './PasswordAuthForm';

// jsdom has no ResizeObserver; sign-up mode renders `AgeConsentCheckbox`'s
// `Checkbox` (Radix), which reads one via `@radix-ui/react-use-size` — same
// stub precedent as `LessonForm.test.tsx`/`WorksheetZoneEditor.test.tsx`.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthPanel — password form only (magic link hidden)', () => {
  it('renders the password form', () => {
    render(<AuthPanel lang="es" />);
    expect(screen.getByTestId('password-auth-form')).toBeTruthy();
  });

  it('does not render the magic-link toggle or its form', () => {
    render(<AuthPanel lang="es" />);
    expect(screen.queryByTestId('auth-panel-toggle')).toBeNull();
    expect(screen.queryByTestId('signin-form')).toBeNull();
  });
});

describe('AuthPanel — forwards props to the password form', () => {
  it('forwards next', () => {
    render(<AuthPanel lang="es" next="/es/ingles" />);
    expect(screen.getByTestId('password-auth-form')).toBeTruthy();
  });

  it('forwards initialMode="signup" (header create-account button)', () => {
    render(<AuthPanel lang="es" initialMode="signup" />);
    expect(screen.getByText(PASSWORD_COPY.es.signUpSubmit)).toBeTruthy();
    expect(screen.queryByText(PASSWORD_COPY.es.signInSubmit)).toBeNull();
  });
});
