// @vitest-environment jsdom
/**
 * ShareDialog tests — the two audiences the dialog serves.
 *
 * What is worth proving here is that BOTH halves are present and correct: the
 * QR for the phones in the room, and the same URL as selectable text for the
 * person holding the device that is displaying it. Plus the clipboard
 * behaviour, which has three outcomes (works / unavailable / refused) and only
 * one of them may claim success.
 *
 * Appearance is deliberately NOT asserted — no class checks, no QR geometry.
 * Whether the code encodes the URL correctly is `src/lib/qr.ts`'s contract and
 * is tested there; this file only proves the markup it produced reaches the DOM.
 *
 * Assertions are plain DOM: this repo ships no `jest-dom`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShareDialog, { COPIED_RESET_MS, type ShareLabels } from './ShareDialog';

const URL_UNDER_TEST =
  'https://chuyocode.com/es/ingles/A2/past-simple/refactor-the-legacy-module';

/** A stand-in for the server-generated code — this file does not test uqr. */
const QR = '<svg data-testid="qr-svg" viewBox="0 0 45 45"><path d="M4,4h1v1h-1z"/></svg>';

const labels: ShareLabels = {
  trigger: 'Compartir',
  title: 'Compartir este ejercicio',
  hint: 'Escanear el código para abrir el ejercicio en otro dispositivo.',
  link: 'Enlace',
  copy: 'Copiar',
  copied: 'Copiado',
  qrAlt: 'Código QR con el enlace a este ejercicio',
};

/** Install a clipboard, or remove it entirely when `writeText` is undefined. */
function stubClipboard(writeText?: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

/** Render and open the dialog, returning once its content is mounted. */
async function open() {
  render(<ShareDialog url={URL_UNDER_TEST} qr={QR} labels={labels} />);
  fireEvent.click(screen.getByTestId('exercise-share'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

afterEach(() => {
  cleanup();
  stubClipboard(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ShareDialog', () => {
  it('shows only a trigger until it is opened', () => {
    render(<ShareDialog url={URL_UNDER_TEST} qr={QR} labels={labels} />);
    expect(screen.getByTestId('exercise-share').textContent).toContain('Compartir');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the server-generated QR markup inside a named image region', async () => {
    await open();
    const region = screen.getByTestId('exercise-qr');
    // Named, because an inlined <svg> has no accessible name of its own and
    // would otherwise announce nothing at all.
    expect(region.getAttribute('role')).toBe('img');
    expect(region.getAttribute('aria-label')).toBe(labels.qrAlt);
    expect(region.querySelector('[data-testid="qr-svg"]')).toBeTruthy();
  });

  it('shows the SAME url as selectable text, not only as a code', async () => {
    // The reason this dialog is useful to the person who opened it: they cannot
    // scan the screen they are looking at.
    await open();
    const code = screen.getByText(URL_UNDER_TEST);
    expect(code.tagName).toBe('CODE');
  });

  it('labels the link region and titles the dialog from the props', async () => {
    // Proves the component carries no vocabulary of its own (RULE 1).
    await open();
    expect(screen.getByText(labels.title)).toBeTruthy();
    expect(screen.getByText(labels.hint)).toBeTruthy();
    expect(screen.getByText(labels.link)).toBeTruthy();
  });

  it('copies the url and acknowledges it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await open();
    const copyButton = await screen.findByTestId('exercise-share-copy');
    fireEvent.click(copyButton);
    await waitFor(() => expect(copyButton.textContent).toBe(labels.copied));
    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('stops claiming "copied" after the reset window', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    // Use real timers during async setup (open, findByTestId). This avoids a race
    // where the fake timer can fire before waitFor polls observe the "copied" label
    // under load. Once async setup is done, install controlled fake timers to test
    // the timer behavior deterministically.
    await open();
    const copyButton = await screen.findByTestId('exercise-share-copy');
    
    // NOW install fake timers — they do not advance with real time, so the
    // clipboard promise and button update complete without timer interference.
    vi.useFakeTimers();
    
    // Wrap click in act so the promise (writeText) and setState (copied=true)
    // complete before we check the assertion.
    await act(async () => {
      fireEvent.click(copyButton);
    });
    
    expect(copyButton.textContent).toBe(labels.copied);
    
    // Advance the timer and let React apply the state update via act.
    await act(async () => {
      vi.advanceTimersByTime(COPIED_RESET_MS + 1);
    });
    
    expect(copyButton.textContent).toBe(labels.copy);
  });

  it('hides the copy button where the clipboard API does not exist', async () => {
    // A button that silently does nothing is worse than no button — and the
    // selectable URL above it already covers this case.
    stubClipboard(undefined);
    await open();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.queryByTestId('exercise-share-copy')).toBeNull();
    // ...and the fallback is still there.
    expect(screen.getByText(URL_UNDER_TEST)).toBeTruthy();
  });

  it('does not claim success when the clipboard refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    await open();
    const copyButton = await screen.findByTestId('exercise-share-copy');
    fireEvent.click(copyButton);
    // Give the rejected promise a turn; the label must not have changed.
    await waitFor(() => expect(copyButton.textContent).toBe(labels.copy));
    expect(screen.getByText(URL_UNDER_TEST)).toBeTruthy();
  });
});
