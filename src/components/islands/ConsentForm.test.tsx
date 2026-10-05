// @vitest-environment jsdom
/**
 * ConsentForm tests — the standalone consent screen's form
 * (`POST /api/auth/consentimiento`), Login step 2 (Ley N° 29733).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UI_LABELS } from '@lib/i18n';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

import ConsentForm from './ConsentForm';

// jsdom has no ResizeObserver; `Checkbox` (Radix, via `AgeConsentCheckbox`)
// reads one via `@radix-ui/react-use-size` — same stub precedent as
// `LessonForm.test.tsx`/`WorksheetZoneEditor.test.tsx`.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stubFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok });
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

function checkbox(): HTMLElement {
  return screen.getByTestId('consent-checkbox');
}

function submitButton(): HTMLElement {
  return screen.getByTestId('consent-submit');
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ConsentForm', () => {
  it('starts with the submit button disabled and a hint shown', () => {
    render(<ConsentForm lang="es" next="/es/ingles" />);

    expect(submitButton().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(UI_LABELS.es.auth.consent.checkboxHint)).toBeTruthy();
  });

  it('enables the submit button once the checkbox is checked, and hides the hint', () => {
    render(<ConsentForm lang="es" next="/es/ingles" />);
    fireEvent.click(checkbox());

    expect(submitButton().hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(UI_LABELS.es.auth.consent.checkboxHint)).toBeNull();
  });

  it('POSTs {consent:true} as application/json and redirects to next on success', async () => {
    const fetchMock = stubFetch(true);
    const assign = stubLocation();
    render(<ConsentForm lang="es" next="/es/ingles" />);
    fireEvent.click(checkbox());
    fireEvent.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/consentimiento', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consent: true }),
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/es/ingles'));
  });

  it('shows a generic error and keeps the form when the response is not ok', async () => {
    stubFetch(false);
    render(<ConsentForm lang="es" next="/es/ingles" />);
    fireEvent.click(checkbox());
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(UI_LABELS.es.auth.consent.genericError),
    );
    expect(toastErrorMock).toHaveBeenCalledWith(UI_LABELS.es.auth.consent.genericError);
    expect(submitButton().hasAttribute('disabled')).toBe(false);
  });

  it('shows the same error when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ConsentForm lang="es" next="/es/ingles" />);
    fireEvent.click(checkbox());
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(UI_LABELS.es.auth.consent.genericError),
    );
  });

  it('disables the checkbox and button while the request is in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true }); })),
    );
    stubLocation();
    render(<ConsentForm lang="es" next="/es/ingles" />);
    fireEvent.click(checkbox());
    fireEvent.click(submitButton());

    expect(submitButton().hasAttribute('disabled')).toBe(true);
    expect(checkbox().hasAttribute('disabled')).toBe(true);
    await act(async () => {
      release?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('renders the en sentence/links for lang="en"', () => {
    render(<ConsentForm lang="en" next="/en/ingles" />);
    expect(screen.getByText(UI_LABELS.en.auth.consent.termsLinkText)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.en.auth.consent.continue)).toBeTruthy();
  });
});
