// @vitest-environment jsdom
/**
 * PasswordAuthForm tests — email + password sign-in, sign-up and reset
 * (`POST /api/auth/password`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

import PasswordAuthForm, { COPY } from './PasswordAuthForm';

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** `window.location.assign` throws "not implemented" in jsdom unless stubbed. */
function stubLocation() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  });
  return assign;
}

function emailInput(): HTMLInputElement {
  return screen.getByLabelText(COPY.es.emailLabel) as HTMLInputElement;
}

function passwordInput(): HTMLInputElement {
  return screen.getByLabelText(COPY.es.passwordLabel) as HTMLInputElement;
}

function submitButton(): HTMLElement {
  return screen.getByTestId('password-auth-submit');
}

function scriptTags(): NodeListOf<HTMLScriptElement> {
  return document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]');
}

/** The slice of `turnstile.render`'s options this test suite reads. */
interface FakeRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  theme: string;
  language: string;
}

/** Install a `window.turnstile` stub; the loader then skips the script tag. */
function stubTurnstileGlobal() {
  const render = vi.fn<(container: HTMLElement, options: FakeRenderOptions) => string>(
    () => 'widget-1',
  );
  const remove = vi.fn();
  const reset = vi.fn();
  (window as unknown as { turnstile?: unknown }).turnstile = { render, remove, reset };
  return { render, remove, reset };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  scriptTags().forEach((el) => el.remove());
});

describe('PasswordAuthForm — initialMode', () => {
  it('starts in sign-up mode when initialMode="signup" (the header create-account button)', () => {
    render(<PasswordAuthForm lang="es" initialMode="signup" />);
    expect(screen.getByText(COPY.es.signUpSubmit)).toBeTruthy();
    expect(screen.queryByText(COPY.es.signInSubmit)).toBeNull();
  });

  it('still defaults to sign-in mode when initialMode is omitted', () => {
    render(<PasswordAuthForm lang="es" />);
    expect(screen.getByText(COPY.es.signInSubmit)).toBeTruthy();
  });
});

describe('PasswordAuthForm — sign in (default mode)', () => {
  it('POSTs action=signin with email and password', async () => {
    const fetchMock = stubFetch({ ok: true });
    stubLocation();
    render(<PasswordAuthForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'signin',
        email: 'lector@example.com',
        lang: 'es',
        password: 'correcto-caballo-1',
      }),
    });
  });

  it('navigates to next on a successful sign-in', async () => {
    stubFetch({ ok: true });
    const assign = stubLocation();
    render(<PasswordAuthForm lang="es" next="/es/ingles" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/es/ingles'));
  });

  it('navigates home when no next was given', async () => {
    stubFetch({ ok: true });
    const assign = stubLocation();
    render(<PasswordAuthForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/es/'));
  });

  it('shows the generic invalid-credentials error on a 401, keeping the form', async () => {
    stubFetch({ ok: false, error: 'invalid_credentials' }, false);
    render(<PasswordAuthForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'wrong-password' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.signInError));
    expect(screen.getByTestId('password-auth-form')).toBeTruthy();
    expect(toastErrorMock).toHaveBeenCalledWith(COPY.es.signInError);
  });

  it('shows the same error when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<PasswordAuthForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'wrong-password' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.signInError));
  });

  it('disables the control while the request is in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({ ok: true }) }); })),
    );
    stubLocation();
    render(<PasswordAuthForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    expect(submitButton().hasAttribute('disabled')).toBe(true);
    release?.();
  });

  it('shows the submit button as loading/aria-busy (stable width, label unchanged) while in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({ ok: true }) }); })),
    );
    stubLocation();
    render(<PasswordAuthForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    expect(submitButton().getAttribute('aria-busy')).toBe('true');
    expect(submitButton().textContent).toContain(COPY.es.signInSubmit);
    release?.();
  });
});

describe('PasswordAuthForm — switching to sign up', () => {
  it('shows the sign-up submit label after switching modes', () => {
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.switchToSignUp));

    expect(screen.getByRole('button', { name: COPY.es.signUpSubmit })).toBeTruthy();
  });

  it('rejects a too-short password locally, without a request', async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.switchToSignUp));
    fireEvent.change(emailInput(), { target: { value: 'nuevo@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.es.signUpSubmit }));

    expect(screen.getByRole('alert').textContent).toBe(COPY.es.tooShort);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs action=signup and shows the uniform confirmation message', async () => {
    const fetchMock = stubFetch({ ok: true, signedIn: false });
    render(<PasswordAuthForm lang="es" next="/es/ingles" />);
    fireEvent.click(screen.getByText(COPY.es.switchToSignUp));
    fireEvent.change(emailInput(), { target: { value: 'nuevo@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.es.signUpSubmit }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'signup',
          email: 'nuevo@example.com',
          lang: 'es',
          password: 'correcto-caballo-1',
          next: '/es/ingles',
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('password-auth-sent').textContent).toBe(COPY.es.signUpSent),
    );
  });

  it('navigates instead of showing the message when Supabase signs the visitor in immediately', async () => {
    stubFetch({ ok: true, signedIn: true });
    const assign = stubLocation();
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.switchToSignUp));
    fireEvent.change(emailInput(), { target: { value: 'nuevo@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.es.signUpSubmit }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/es/'));
  });
});

describe('PasswordAuthForm — forgot password', () => {
  it('hides the password field in reset mode', () => {
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.forgotPassword));

    expect(screen.queryByLabelText(COPY.es.passwordLabel)).toBeNull();
  });

  it('POSTs action=reset and shows a confirmation card with the typed email', async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.forgotPassword));
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.es.resetSubmit }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password',
      expect.objectContaining({
        body: JSON.stringify({ action: 'reset', email: 'lector@example.com', lang: 'es' }),
      }),
    );

    const card = await screen.findByTestId('password-reset-sent');
    expect(card.getAttribute('role')).toBe('status');
    expect(screen.getByText(COPY.es.resetSentHeading)).toBeTruthy();
    expect(card.textContent).toContain('lector@example.com');
    expect(screen.getByRole('button', { name: COPY.es.backToSignInFromReset })).toBeTruthy();
  });

  it('shows the identical card regardless of whether the address has an account (anti-enumeration)', async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.forgotPassword));
    fireEvent.change(emailInput(), { target: { value: 'sin-cuenta@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.es.resetSubmit }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const card = await screen.findByTestId('password-reset-sent');
    expect(screen.getByText(COPY.es.resetSentHeading)).toBeTruthy();
    expect(card.textContent).toContain('sin-cuenta@example.com');
  });

  it('returns to sign-in mode with the email prefilled from the reset confirmation card', async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.forgotPassword));
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.es.resetSubmit }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: COPY.es.backToSignInFromReset }));

    expect(screen.getByRole('button', { name: COPY.es.signInSubmit })).toBeTruthy();
    expect(emailInput().value).toBe('lector@example.com');
  });

  it('returns to sign-in mode from the back link', () => {
    render(<PasswordAuthForm lang="es" />);
    fireEvent.click(screen.getByText(COPY.es.forgotPassword));
    fireEvent.click(screen.getByText(COPY.es.backToSignIn));

    expect(screen.getByRole('button', { name: COPY.es.signInSubmit })).toBeTruthy();
  });
});

describe('PasswordAuthForm — Turnstile, no site key configured', () => {
  it('renders no widget, loads no script, and submits exactly as before', async () => {
    const fetchMock = stubFetch({ ok: true });
    stubLocation();
    render(<PasswordAuthForm lang="es" />);

    expect(screen.queryByTestId('turnstile-widget')).toBeNull();
    expect(scriptTags()).toHaveLength(0);
    expect(submitButton().hasAttribute('disabled')).toBe(false);

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('captchaToken');
  });
});

describe('PasswordAuthForm — Turnstile, site key configured', () => {
  it('loads the script once, renders the widget, holds submit disabled until a token arrives, sends the token, and resets after submit', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const fetchMock = stubFetch({ ok: true });
    stubLocation();
    render(<PasswordAuthForm lang="es" />);

    expect(scriptTags()).toHaveLength(1);
    expect(submitButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(COPY.es.captchaPending)).toBeTruthy();

    const { render: renderMock, reset: resetMock } = stubTurnstileGlobal();
    scriptTags()[0].dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    expect(renderMock.mock.calls[0][1].sitekey).toBe('1x00000000000000000000AA');

    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).captchaToken).toBe('tok-abc');
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith('widget-1'));
  });

  it('shows the captcha-specific error and keeps the form when the server reports captcha_failed', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    stubFetch({ ok: false, error: 'captcha_failed' }, false);
    const { render: renderMock } = stubTurnstileGlobal();
    render(<PasswordAuthForm lang="es" />);

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.captchaError));
    expect(screen.getByTestId('password-auth-form')).toBeTruthy();
  });

  it('resets the widget and re-arms the captcha gate when fetch throws (offline)', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { render: renderMock, reset: resetMock } = stubTurnstileGlobal();
    render(<PasswordAuthForm lang="es" />);

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.signInError));
    expect(resetMock).toHaveBeenCalledWith('widget-1');
    expect(submitButton().hasAttribute('disabled')).toBe(true);

    act(() => {
      renderMock.mock.calls[0][1].callback('tok-def');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));
  });
});

describe('PasswordAuthForm — localization', () => {
  it('localizes the form to English', () => {
    render(<PasswordAuthForm lang="en" />);
    expect(screen.getByLabelText(COPY.en.emailLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.en.signInSubmit })).toBeTruthy();
  });

  it('falls back to Spanish for an unknown locale', () => {
    render(<PasswordAuthForm lang="fr" />);
    expect(screen.getByLabelText(COPY.es.emailLabel)).toBeTruthy();
  });

  it('writes its Spanish in neutral Spanish, with no voseo', () => {
    // `vas` is valid tuteo (identical to its voseo form), so only `Revisá`
    // fires.
    expect(voseoWords('Revisá tu correo, vas a recibir un enlace.')).toEqual([
      'Revisá',
    ]);
    expect(findVoseo(COPY.es)).toEqual([]);
  });
});
