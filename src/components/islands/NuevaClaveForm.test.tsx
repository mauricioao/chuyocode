// @vitest-environment jsdom
/**
 * NuevaClaveForm tests — the client half of the password-reset flow
 * (`/[lang]/auth/nueva-clave.astro`, `POST /api/auth/nueva-clave`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import NuevaClaveForm, { COPY } from './NuevaClaveForm';

function stubFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => ({ ok }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function passwordInput(): HTMLInputElement {
  return screen.getByLabelText(COPY.es.passwordLabel) as HTMLInputElement;
}

function submitButton(): HTMLElement {
  return screen.getByTestId('nueva-clave-submit');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NuevaClaveForm — submitting', () => {
  it('POSTs the password as JSON to /api/auth/nueva-clave', async () => {
    const fetchMock = stubFetch();
    render(<NuevaClaveForm lang="es" />);
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/nueva-clave', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correcto-caballo-1' }),
    });
  });

  it('rejects a too-short password locally, without a request', async () => {
    const fetchMock = stubFetch();
    render(<NuevaClaveForm lang="es" />);
    fireEvent.change(passwordInput(), { target: { value: 'short' } });
    fireEvent.click(submitButton());

    expect(screen.getByRole('alert').textContent).toBe(COPY.es.tooShort);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the control while the request is in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({}) }); })),
    );
    render(<NuevaClaveForm lang="es" />);
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    expect(submitButton().hasAttribute('disabled')).toBe(true);
    release?.();
    await waitFor(() => expect(screen.queryByTestId('nueva-clave-form')).toBeNull());
  });
});

describe('NuevaClaveForm — outcomes', () => {
  it('shows the success message and replaces the form on an ok response', async () => {
    stubFetch(true);
    render(<NuevaClaveForm lang="es" />);
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByTestId('nueva-clave-success').textContent).toBe(COPY.es.success),
    );
    expect(screen.queryByTestId('nueva-clave-form')).toBeNull();
  });

  it('shows a retryable error on a non-ok response, keeping the form', async () => {
    stubFetch(false);
    render(<NuevaClaveForm lang="es" />);
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.error));
    expect(screen.getByTestId('nueva-clave-form')).toBeTruthy();
  });

  it('shows the same retryable error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<NuevaClaveForm lang="es" />);
    fireEvent.change(passwordInput(), { target: { value: 'correcto-caballo-1' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.error));
  });
});

describe('NuevaClaveForm — localization', () => {
  it('localizes the form to English', () => {
    render(<NuevaClaveForm lang="en" />);
    expect(screen.getByLabelText(COPY.en.passwordLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.en.submit })).toBeTruthy();
  });

  it('falls back to Spanish for an unknown locale', () => {
    render(<NuevaClaveForm lang="fr" />);
    expect(screen.getByLabelText(COPY.es.passwordLabel)).toBeTruthy();
  });

  it('writes its Spanish in neutral Spanish, with no voseo', () => {
    expect(voseoWords('Revisá tu correo, vas a recibir un enlace.')).toEqual([
      'Revisá',
      'vas',
    ]);
    expect(findVoseo(COPY.es)).toEqual([]);
  });
});
