// @vitest-environment jsdom
/**
 * AdModal island tests (spec 4: rewarded-ads).
 *
 * Verifies the rewarded-ads unlock flow:
 *  - the modal + ad placeholder + Watch CTA render,
 *  - clicking Watch starts the 3s countdown,
 *  - completion POSTs to /api/validar-anuncio and shows the success state,
 *  - a non-ok response shows the error state with a retry,
 *  - copy is localized (es/en).
 *
 * Fake timers drive the countdown; fetch and location.reload are stubbed so the
 * flow is deterministic and does not actually navigate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import AdModal, { AD_DURATION_SECONDS, COPY } from './AdModal';

/** Stub window.location.reload so the success path does not navigate. */
function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  return reload;
}

/** Advance the fake countdown to completion, flushing pending microtasks. */
async function runCountdown() {
  for (let i = 0; i < AD_DURATION_SECONDS; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
  // Flush the fetch().then microtask chain.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AdModal', () => {
  it('renders the modal, ad placeholder, and Watch CTA (es)', () => {
    render(<AdModal lang="es" />);

    expect(screen.getByTestId('ad-modal')).toBeTruthy();
    expect(screen.getByTestId('ad-placeholder').textContent).toBe('Tu anuncio aquí');
    expect(screen.getByText('Ver anuncio para desbloquear')).toBeTruthy();
    // shadcn/Radix Dialog renders a role="dialog" and manages modal semantics
    // (focus trap, overlay) internally; assert the accessible dialog exists.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders localized English copy', () => {
    render(<AdModal lang="en" />);

    expect(screen.getByTestId('ad-placeholder').textContent).toBe('Your ad here');
    expect(screen.getByText('Watch ad to unlock')).toBeTruthy();
  });

  it('starts a countdown when Watch is clicked', () => {
    render(<AdModal lang="en" />);

    fireEvent.click(screen.getByText('Watch ad to unlock'));

    // Countdown begins at the full duration.
    expect(screen.getByTestId('ad-status').textContent).toContain(
      String(AD_DURATION_SECONDS),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('ad-status').textContent).toContain(
      String(AD_DURATION_SECONDS - 1),
    );
  });

  it('reaches the success state and reloads after a successful validation', async () => {
    const reload = stubReload();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdModal lang="es" />);
    fireEvent.click(screen.getByText('Ver anuncio para desbloquear'));

    await runCountdown();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/validar-anuncio',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByTestId('ad-success')).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the error state when validation returns non-ok', async () => {
    stubReload();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'Invalid token' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdModal lang="en" />);
    fireEvent.click(screen.getByText('Watch ad to unlock'));

    await runCountdown();

    expect(screen.getByTestId('ad-error')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('shows the error state on a network failure', async () => {
    stubReload();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdModal lang="en" />);
    fireEvent.click(screen.getByText('Watch ad to unlock'));

    await runCountdown();

    expect(screen.getByTestId('ad-error')).toBeTruthy();
  });
});

describe('AdModal — neutral Spanish', () => {
  it('writes the Spanish modal copy in neutral Spanish, with no voseo', () => {
    // STANDING PROJECT RULE, site-wide. Like `ExerciseIsland`, this island
    // keeps its copy LOCAL so the Astro-side i18n module never reaches the
    // client bundle — which also puts it out of reach of the `i18n.test.ts`
    // guard. Without this test the whole rewarded-ads flow is unguarded, and
    // that is where "Intentá de nuevo" survived the English-section sweep.

    // Triangulation: the detector fires on the copy this island used to ship.
    expect(voseoWords('No se pudo validar el anuncio. Intentá de nuevo.')).toEqual(
      ['Intentá'],
    );

    // `playing` is a FUNCTION, and `findVoseo` walks strings only — it would
    // skip that entry in silence. Calling it puts the rendered sentence back
    // into the guarded surface instead of leaving a hole the size of one state.
    const rendered = { ...COPY.es, playing: COPY.es.playing(3) };
    expect(rendered.playing).toContain('Reproduciendo');
    expect(findVoseo(rendered)).toEqual([]);
  });
});
