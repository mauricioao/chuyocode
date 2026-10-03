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
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
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

describe('SignInForm — Turnstile, no site key configured', () => {
  it('renders no widget, loads no script, and submits exactly as before', async () => {
    const fetchMock = stubFetch();
    render(<SignInForm lang="es" />);

    expect(screen.queryByTestId('turnstile-widget')).toBeNull();
    expect(scriptTags()).toHaveLength(0);
    expect(submitButton().hasAttribute('disabled')).toBe(false);

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('captchaToken');
  });
});

describe('SignInForm — Turnstile, site key configured', () => {
  it('loads the script once, renders the widget, holds submit disabled until a token arrives, and sends the token', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const fetchMock = stubFetch();
    render(<SignInForm lang="es" />);

    expect(scriptTags()).toHaveLength(1);
    expect(submitButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(COPY.es.captchaPending)).toBeTruthy();

    const { render: renderMock, remove: removeMock } = stubTurnstileGlobal();
    scriptTags()[0].dispatchEvent(new Event('load'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    expect(renderMock.mock.calls[0][1].sitekey).toBe('1x00000000000000000000AA');

    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).captchaToken).toBe('tok-abc');
    // A successful request replaces the form (and the widget inside it) with
    // the neutral success message — `remove`, not `reset`, is what cleans
    // this widget instance up; there is no continuing instance to reset.
    await waitFor(() => expect(screen.getByTestId('signin-success')).toBeTruthy());
    expect(removeMock).toHaveBeenCalledWith('widget-1');
  });

  it('resets the widget after a failed (non-captcha) submit, so the form can be retried', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    stubFetch(false);
    const { render: renderMock, reset: resetMock } = stubTurnstileGlobal();
    render(<SignInForm lang="es" />);

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.error));
    // The form stays (a genuine failure is retryable), and the now-consumed
    // token's widget is reset so a retry cannot resend it.
    expect(screen.getByTestId('signin-form')).toBeTruthy();
    expect(resetMock).toHaveBeenCalledWith('widget-1');
    expect(submitButton().hasAttribute('disabled')).toBe(true);
  });

  it('shows the captcha-specific error and keeps the form when the server reports captcha_failed', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: 'captcha_failed' }) }),
    );
    const { render: renderMock } = stubTurnstileGlobal();
    render(<SignInForm lang="es" />);

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.captchaError));
    expect(screen.getByTestId('signin-form')).toBeTruthy();
  });

  it('resets the widget and re-arms the captcha gate when fetch throws (offline)', async () => {
    vi.stubEnv('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { render: renderMock, reset: resetMock } = stubTurnstileGlobal();
    render(<SignInForm lang="es" />);

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0][1].callback('tok-abc');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));

    fireEvent.change(emailInput(), { target: { value: 'lector@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.es.error));
    expect(screen.getByTestId('signin-form')).toBeTruthy();
    expect(resetMock).toHaveBeenCalledWith('widget-1');
    expect(submitButton().hasAttribute('disabled')).toBe(true);

    act(() => {
      renderMock.mock.calls[0][1].callback('tok-def');
    });
    await waitFor(() => expect(submitButton().hasAttribute('disabled')).toBe(false));
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
