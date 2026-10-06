// @vitest-environment jsdom
/**
 * ProfileNameForm tests (Perfil page, T3). Drives `fetch` directly (mocked),
 * same posture as `DuplicateActivityButton.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import ProfileNameForm from './ProfileNameForm';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetchOk(name = 'Juan Perez') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, name }) }),
  );
}

describe('ProfileNameForm — initial render', () => {
  it('pre-fills the input with the resolved display name', () => {
    stubFetchOk();
    render(<ProfileNameForm lang="es" initialName="lector" />);
    expect((screen.getByTestId('profile-name-input') as HTMLInputElement).value).toBe('lector');
  });

  it('wires name/autocomplete attributes and a visible label', () => {
    stubFetchOk();
    render(<ProfileNameForm lang="es" initialName="lector" />);
    const input = screen.getByTestId('profile-name-input');
    expect(input.getAttribute('name')).toBe('name');
    expect(input.getAttribute('autocomplete')).toBe('name');
    expect(screen.getByText('Nombre para mostrar')).toBeTruthy();
  });
});

describe('ProfileNameForm — client-side validation', () => {
  it('rejects an empty name without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileNameForm lang="es" initialName="lector" />);

    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ProfileNameForm — submit', () => {
  it('POSTs the trimmed/collapsed name as JSON, shows saving, then the server-confirmed name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, name: 'Juan Perez' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileNameForm lang="es" initialName="lector" />);

    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: '  Juan   Perez  ' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));

    expect(fetchMock).toHaveBeenCalledWith('/api/cuenta/nombre', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Juan Perez' }),
    });

    await waitFor(() =>
      expect((screen.getByTestId('profile-name-input') as HTMLInputElement).value).toBe('Juan Perez'),
    );
  });

  it('shows a generic error when the server answers ok:false, without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'update_failed' }) }),
    );
    render(<ProfileNameForm lang="es" initialName="lector" />);

    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Juan' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('shows the generic error message on a network failure too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ProfileNameForm lang="es" initialName="lector" />);

    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Juan' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('localizes to English', () => {
    stubFetchOk();
    render(<ProfileNameForm lang="en" initialName="reader" />);
    expect(screen.getByText('Display name')).toBeTruthy();
  });
});

describe('ProfileNameForm — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => (
      <ProfileNameForm lang="es" initialName="lector" />
    ));
    expect(recoverableErrors).toEqual([]);
  });
});
