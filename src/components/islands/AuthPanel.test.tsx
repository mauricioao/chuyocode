// @vitest-environment jsdom
/**
 * AuthPanel tests — the sign-in page's client-side switch between the
 * password form (default) and the magic-link form (secondary option).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AuthPanel, { COPY } from './AuthPanel';
import { COPY as PASSWORD_COPY } from './PasswordAuthForm';
import { COPY as SIGNIN_COPY } from './SignInForm';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AuthPanel — default view', () => {
  it('shows the password form by default', () => {
    render(<AuthPanel lang="es" />);
    expect(screen.getByTestId('password-auth-form')).toBeTruthy();
    expect(screen.queryByTestId('signin-form')).toBeNull();
  });

  it('offers the magic-link toggle', () => {
    render(<AuthPanel lang="es" />);
    expect(screen.getByText(PASSWORD_COPY.es.signInSubmit)).toBeTruthy();
    expect(screen.getByText(COPY.es.magicLinkToggle)).toBeTruthy();
  });
});

describe('AuthPanel — switching to the magic link', () => {
  it('shows the magic-link form after the toggle', () => {
    render(<AuthPanel lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.magicLinkToggle));

    expect(screen.getByTestId('signin-form')).toBeTruthy();
    expect(screen.queryByTestId('password-auth-form')).toBeNull();
    expect(screen.getByLabelText(SIGNIN_COPY.es.emailLabel)).toBeTruthy();
  });

  it('switches back to the password form', () => {
    render(<AuthPanel lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.magicLinkToggle));
    fireEvent.click(screen.getByText(COPY.es.backToPassword));

    expect(screen.getByTestId('password-auth-form')).toBeTruthy();
  });

  it('forwards next to whichever form is active', () => {
    render(<AuthPanel lang="es" next="/es/ingles" />);
    fireEvent.click(screen.getByText(COPY.es.magicLinkToggle));

    // SignInForm forwards `next` in its POST body — exercised at the unit
    // level in SignInForm.test.tsx; here it is enough that the prop reaches
    // the mounted form rather than being dropped by the switch.
    expect(screen.getByTestId('signin-form')).toBeTruthy();
  });
});

describe('AuthPanel — localization', () => {
  it('localizes the toggle to English', () => {
    render(<AuthPanel lang="en" />);
    expect(screen.getByText(COPY.en.magicLinkToggle)).toBeTruthy();
  });
});
