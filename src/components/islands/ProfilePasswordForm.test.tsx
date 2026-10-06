// @vitest-environment jsdom
/**
 * ProfilePasswordForm tests (Perfil page, T3). Drives `fetch` directly
 * (mocked), same posture as `DuplicateActivityButton.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import ProfilePasswordForm from './ProfilePasswordForm';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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

function fillAndSubmit(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByTestId('profile-current-password'), { target: { value: current } });
  fireEvent.change(screen.getByTestId('profile-new-password'), { target: { value: next } });
  fireEvent.change(screen.getByTestId('profile-confirm-password'), { target: { value: confirm } });
  fireEvent.click(screen.getByTestId('profile-password-save'));
}

describe('ProfilePasswordForm — fields', () => {
  it('wires type=password and the current-password/new-password autocomplete attributes', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<ProfilePasswordForm lang="es" />);

    const current = screen.getByTestId('profile-current-password');
    const next = screen.getByTestId('profile-new-password');
    const confirm = screen.getByTestId('profile-confirm-password');

    expect(current.getAttribute('type')).toBe('password');
    expect(current.getAttribute('autocomplete')).toBe('current-password');
    expect(next.getAttribute('autocomplete')).toBe('new-password');
    expect(confirm.getAttribute('autocomplete')).toBe('new-password');

    expect(screen.getByText('Contraseña actual')).toBeTruthy();
    expect(screen.getByText('Contraseña nueva')).toBeTruthy();
    expect(screen.getByText('Confirmar contraseña nueva')).toBeTruthy();
  });
});

describe('ProfilePasswordForm — client-side validation', () => {
  it('rejects mismatched new/confirm passwords without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfilePasswordForm lang="es" />);

    fillAndSubmit('old-password1', 'new-password1', 'different1');

    expect(await screen.findByTestId('profile-password-error')).toHaveProperty(
      'textContent',
      'Las contraseñas nuevas no coinciden.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a new password shorter than the minimum without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfilePasswordForm lang="es" />);

    fillAndSubmit('old-password1', 'short', 'short');

    expect(await screen.findByTestId('profile-password-error')).toHaveProperty(
      'textContent',
      'Usa al menos 8 caracteres.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ProfilePasswordForm — submit', () => {
  it('POSTs currentPassword/newPassword as JSON and clears the fields on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfilePasswordForm lang="es" />);

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    expect(fetchMock).toHaveBeenCalledWith('/api/cuenta/contrasena', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old-password1', newPassword: 'new-password1' }),
    });

    await waitFor(() =>
      expect((screen.getByTestId('profile-current-password') as HTMLInputElement).value).toBe(''),
    );
    expect((screen.getByTestId('profile-new-password') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('profile-confirm-password') as HTMLInputElement).value).toBe('');
  });

  it.each([
    ['invalid_current_password', 'La contraseña actual no es correcta.'],
    ['reauthentication_needed', 'Por tu seguridad, vuelve a iniciar sesión y prueba de nuevo.'],
    ['same_password', 'La contraseña nueva debe ser diferente de la actual.'],
    ['weak_password', 'Usa al menos 8 caracteres.'],
    ['no_password_identity', 'No se pudo cambiar tu contraseña. Inténtalo de nuevo.'],
    ['some_unrecognized_code', 'No se pudo cambiar tu contraseña. Inténtalo de nuevo.'],
  ])('maps the %s server error to its own message, never the raw code', async (code, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: code }) }),
    );
    render(<ProfilePasswordForm lang="es" />);

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    const error = await screen.findByTestId('profile-password-error');
    expect(error.textContent).toBe(expected);
  });

  it('shows the generic error message on a network failure too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ProfilePasswordForm lang="es" />);

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    expect(await screen.findByTestId('profile-password-error')).toBeTruthy();
  });
});

describe('ProfilePasswordForm — Turnstile, no site key configured', () => {
  it('renders no widget and submits with no captchaToken field, exactly as before', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfilePasswordForm lang="es" />);

    expect(screen.queryByTestId('turnstile-widget')).toBeNull();
    expect(scriptTags()).toHaveLength(0);
    expect(screen.getByTestId('profile-password-save').hasAttribute('disabled')).toBe(false);

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('captchaToken');
  });
});

describe('ProfilePasswordForm — Turnstile, site key configured', () => {
  it('renders the widget, holds submit disabled until a token arrives, and sends the token', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfilePasswordForm lang="es" />);

    expect(scriptTags()).toHaveLength(1);
    expect(screen.getByTestId('profile-password-save').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Esperando verificación…')).toBeTruthy();

    const { render: renderMock } = stubTurnstileGlobal();
    scriptTags()[0].dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));

    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() =>
      expect(screen.getByTestId('profile-password-save').hasAttribute('disabled')).toBe(false),
    );

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).captchaToken).toBe('tok-abc');
  });

  it('resets the widget after a failed attempt (tokens are single-use)', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'invalid_current_password' }) }),
    );
    render(<ProfilePasswordForm lang="es" />);

    const { render: renderMock, reset: resetMock } = stubTurnstileGlobal();
    scriptTags()[0].dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() =>
      expect(screen.getByTestId('profile-password-save').hasAttribute('disabled')).toBe(false),
    );

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    expect(await screen.findByTestId('profile-password-error')).toHaveProperty(
      'textContent',
      'La contraseña actual no es correcta.',
    );
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith('widget-1'));
    // Re-armed: submit is disabled again until a fresh token arrives.
    expect(screen.getByTestId('profile-password-save').hasAttribute('disabled')).toBe(true);
  });

  it('maps a captcha_failed server response to its own message, distinct from a wrong current password', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'captcha_failed' }) }),
    );
    render(<ProfilePasswordForm lang="es" />);

    const { render: renderMock } = stubTurnstileGlobal();
    scriptTags()[0].dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() =>
      expect(screen.getByTestId('profile-password-save').hasAttribute('disabled')).toBe(false),
    );

    fillAndSubmit('old-password1', 'new-password1', 'new-password1');

    expect(await screen.findByTestId('profile-password-error')).toHaveProperty(
      'textContent',
      'No pudimos verificar que eres una persona. Inténtalo de nuevo.',
    );
  });
});

describe('ProfilePasswordForm — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <ProfilePasswordForm lang="es" />);
    expect(recoverableErrors).toEqual([]);
  });
});
