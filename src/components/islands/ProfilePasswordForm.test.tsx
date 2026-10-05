// @vitest-environment jsdom
/**
 * ProfilePasswordForm tests (Perfil page, T3). Drives `fetch` directly
 * (mocked), same posture as `DuplicateActivityButton.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import ProfilePasswordForm from './ProfilePasswordForm';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

describe('ProfilePasswordForm — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <ProfilePasswordForm lang="es" />);
    expect(recoverableErrors).toEqual([]);
  });
});
