// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import { UI_LABELS } from '@/lib/i18n';
import { writeMeCache, readMeCache } from '@/lib/meCache';
import { readAndClearPendingToast } from '@/lib/pendingToast';
import DeleteAccountDialog from './DeleteAccountDialog';

const esLabels = UI_LABELS.es.auth.userMenu;
const enLabels = UI_LABELS.en.auth.userMenu;

/** A minimal trigger: a plain button, same shape every call site supplies. */
function trigger(onClick: () => void) {
  return (
    <button type="button" data-testid="open-trigger" onClick={onClick}>
      {esLabels.deleteAccount}
    </button>
  );
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

function openDialog() {
  fireEvent.click(screen.getByTestId('open-trigger'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('DeleteAccountDialog — closed by default', () => {
  it('shows only the trigger, no dialog', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    expect(screen.queryByTestId('open-trigger')).not.toBeNull();
    expect(screen.queryByTestId('delete-account-dialog')).toBeNull();
  });
});

describe('DeleteAccountDialog — the confirmation word', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('opens on the trigger, with confirm disabled until the exact word is typed', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();

    expect(screen.queryByTestId('delete-account-dialog')).not.toBeNull();
    expect((screen.getByTestId('delete-account-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('stays disabled for a near-miss (lowercase, partial, or extra text)', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();
    const input = screen.getByTestId('delete-account-confirm-input');
    const confirm = () => screen.getByTestId('delete-account-confirm') as HTMLButtonElement;

    fireEvent.change(input, { target: { value: 'eliminar' } });
    expect(confirm().disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'ELIMINA' } });
    expect(confirm().disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'ELIMINAR ' } });
    expect(confirm().disabled).toBe(true);
  });

  it('enables confirm once the exact word (ELIMINAR) is typed', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'ELIMINAR' } });
    expect((screen.getByTestId('delete-account-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('requires DELETE (not ELIMINAR) for lang="en"', () => {
    render(<DeleteAccountDialog lang="en" labels={enLabels} renderTrigger={trigger} />);
    openDialog();
    const input = screen.getByTestId('delete-account-confirm-input');
    const confirm = () => screen.getByTestId('delete-account-confirm') as HTMLButtonElement;

    fireEvent.change(input, { target: { value: 'ELIMINAR' } });
    expect(confirm().disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(confirm().disabled).toBe(false);
  });

  it('resets the typed word and status every time it re-opens', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'ELIMINAR' } });
    fireEvent.click(screen.getByTestId('delete-account-cancel'));

    openDialog();
    expect((screen.getByTestId('delete-account-confirm-input') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('delete-account-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes on cancel without calling fetch', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();
    fireEvent.click(screen.getByTestId('delete-account-cancel'));
    expect(screen.queryByTestId('delete-account-dialog')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountDialog — submitting', () => {
  function typeAndSubmit(word = 'ELIMINAR') {
    openDialog();
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: word } });
    fireEvent.click(screen.getByTestId('delete-account-confirm'));
  }

  it('shows the confirm button as loading/aria-busy and disables both buttons while in flight', async () => {
    let resolveFetch!: (value: { ok: boolean }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    stubLocation();

    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    typeAndSubmit();

    const confirm = screen.getByTestId('delete-account-confirm') as HTMLButtonElement;
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.disabled).toBe(true);
    expect((screen.getByTestId('delete-account-cancel') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('delete-account-confirm-input') as HTMLInputElement).disabled).toBe(true);

    await waitFor(() => resolveFetch({ ok: true }));
  });

  it('POSTs the typed word as { confirm }', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();

    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    typeAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cuenta/eliminar',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirm: 'ELIMINAR' }),
      }),
    );
  });

  it('on success: clears the /api/me cache, stashes the confirmation toast, and navigates home', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const assign = stubLocation();
    writeMeCache({ profile: null });

    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    typeAndSubmit();

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/es/'));
    expect(readMeCache()).toBeUndefined();
    expect(readAndClearPendingToast()).toBe(esLabels.deleteAccountSuccessToast);
  });

  it('navigates to the English home for lang="en"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const assign = stubLocation();

    render(<DeleteAccountDialog lang="en" labels={enLabels} renderTrigger={trigger} />);
    openDialog();
    fireEvent.change(screen.getByTestId('delete-account-confirm-input'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByTestId('delete-account-confirm'));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/en/'));
  });

  it('on a non-ok response: shows the generic error, never navigates, dialog stays open', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: 'purge_failed' }) }));
    const assign = stubLocation();

    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    typeAndSubmit();

    await waitFor(() => expect(screen.queryByTestId('delete-account-error')).not.toBeNull());
    expect(screen.getByTestId('delete-account-error').textContent).toBe(esLabels.deleteAccountErrorGeneric);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-account-dialog')).not.toBeNull();
  });

  it('on a network failure: falls back to the generic error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    stubLocation();

    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    typeAndSubmit();

    await waitFor(() => expect(screen.queryByTestId('delete-account-error')).not.toBeNull());
    expect(screen.getByTestId('delete-account-error').textContent).toBe(esLabels.deleteAccountErrorGeneric);
  });

  it('never calls fetch at all if submit is somehow triggered without the exact word', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();
    // The button is disabled in this state, so this proves the submit guard
    // itself (not just the DOM `disabled` attribute) refuses a bad word.
    fireEvent.click(screen.getByTestId('delete-account-confirm'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountDialog — copy', () => {
  it('renders the owner-authored Spanish warning verbatim', () => {
    render(<DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />);
    openDialog();
    expect(screen.getByTestId('delete-account-dialog').textContent).toContain(
      'Tus actividades publicadas seguirán disponibles para la comunidad a nombre de ChuyoCode',
    );
  });

  it('renders English copy for lang="en"', () => {
    render(<DeleteAccountDialog lang="en" labels={enLabels} renderTrigger={trigger} />);
    openDialog();
    expect(screen.getByTestId('delete-account-dialog').textContent).toContain('Delete your account');
  });
});

describe('DeleteAccountDialog — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => (
      <DeleteAccountDialog lang="es" labels={esLabels} renderTrigger={trigger} />
    ));
    expect(recoverableErrors).toEqual([]);
  });
});
