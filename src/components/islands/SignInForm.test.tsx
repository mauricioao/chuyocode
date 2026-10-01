// @vitest-environment jsdom
/**
 * SignInForm tests — the enumeration-proofing has to survive into the UI.
 *
 * `src/pages/api/auth/signin.ts` answers the SAME 200 whether or not the
 * submitted address has an account (T3 in the confirm route's threat matrix).
 * A form that showed a different message for a 200 with `ok:true` vs one with
 * some other shape, or that retried a "no account" case differently, would
 * reopen the oracle the endpoint was built to close. So every case below that
 * completes the request — known address, unknown address, whatever the
 * server actually returns for either — must render the identical neutral
 * message. Only a genuine failure to complete the request (non-ok status,
 * thrown fetch) gets a different, retryable state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

import SignInForm, { COPY } from './SignInForm';

/** Install a `fetch` stub that resolves with the given ok-ness. */
function stubFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => ({ ok }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function emailInput(): HTMLInputElement {
  return screen.getByLabelText(COPY.es.emailLabel) as HTMLInputElement;
}

/**
 * Queried by test id, not by accessible name: the label itself switches from
 * `submit` to `submitting` while the request is in flight, and several tests
 * below click it more than once across that transition.
 */
function submitButton(): HTMLElement {
  return screen.getByTestId('signin-submit');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SignInForm — submitting', () => {
  it('POSTs the email as JSON to /api/auth/signin', async () => {
    const fetchMock = stubFetch();
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'lector@example.com', lang: 'es' }),
    });
  });

  it('forwards `next` when the page was given one', async () => {
    const fetchMock = stubFetch();
    render(<SignInForm lang="es" next="/es/mis-libros" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/signin',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'lector@example.com',
          lang: 'es',
          next: '/es/mis-libros',
        }),
      }),
    );
  });

  it('omits `next` entirely rather than sending it empty', async () => {
    const fetchMock = stubFetch();
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('next');
  });

  it('disables the control while the request is in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({}) }); })),
    );
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    expect(submitButton().hasAttribute('disabled')).toBe(true);
    release?.();
    await waitFor(() => expect(screen.queryByTestId('signin-form')).toBeNull());
  });

  it('shows the submit button as loading/aria-busy (stable width, label unchanged) while in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({}) }); })),
    );
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    expect(submitButton().getAttribute('aria-busy')).toBe('true');
    expect(submitButton().textContent).toContain(COPY.es.submit);
    release?.();
    await waitFor(() => expect(screen.queryByTestId('signin-form')).toBeNull());
  });

  it('ignores a second submit while the first is still in flight', async () => {
    const fetchMock = stubFetch();
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.queryByTestId('signin-form')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('SignInForm — the neutral outcome (enumeration-proofing)', () => {
  it('shows the same neutral message on an ok response', async () => {
    stubFetch(true);
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'conocido@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByTestId('signin-success').textContent).toBe(COPY.es.success),
    );
  });

  it('shows the identical message for an address the caller has no way to know exists or not', async () => {
    // The endpoint never reveals which is which, and neither may this form:
    // the ONLY signal available to it is "the request completed".
    stubFetch(true);
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'desconocido@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByTestId('signin-success').textContent).toBe(COPY.es.success),
    );
  });

  it('replaces the form with the message rather than showing both', async () => {
    stubFetch(true);
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.queryByTestId('signin-form')).toBeNull());
    expect(screen.getByTestId('signin-success')).toBeTruthy();
  });
});

describe('SignInForm — genuine failures', () => {
  it('shows a retryable error on a non-ok response', async () => {
    stubFetch(false);
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(COPY.es.error),
    );
    // The form stays, so the visitor can try again without retyping.
    expect(screen.getByTestId('signin-form')).toBeTruthy();
    expect(toastErrorMock).toHaveBeenCalledWith(COPY.es.error);
  });

  it('shows the same retryable error when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(COPY.es.error),
    );
  });

  it('lets a retry after a failure succeed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SignInForm lang="es" />);
    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByTestId('signin-success')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('SignInForm — localization', () => {
  it('localizes the form to English', () => {
    render(<SignInForm lang="en" />);
    expect(screen.getByLabelText(COPY.en.emailLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.en.submit })).toBeTruthy();
  });

  it('falls back to Spanish for an unknown locale', () => {
    render(<SignInForm lang="fr" />);
    expect(screen.getByLabelText(COPY.es.emailLabel)).toBeTruthy();
  });

  it('writes its Spanish in neutral Spanish, with no voseo', () => {
    // Triangulation: the detector does fire on copy that IS voseo.
    expect(voseoWords('Revisá tu correo, vas a recibir un enlace.')).toEqual([
      'Revisá',
      'vas',
    ]);
    expect(findVoseo(COPY.es)).toEqual([]);
  });
});
