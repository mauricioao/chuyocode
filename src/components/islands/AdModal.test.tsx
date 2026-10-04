// @vitest-environment jsdom
/**
 * AdModal island tests (spec 4: rewarded-ads).
 *
 * Verifies the rewarded-ads unlock flow:
 *  - the modal + ad placeholder + Watch CTA render,
 *  - clicking Watch first POSTs /api/anuncio/inicio (arms the start cookie),
 *    THEN starts the 3s countdown — never the other way around (see
 *    `AdModal.tsx`'s `startAd` header on the race a fire-and-forget start call
 *    would risk in production),
 *  - a failed/erroring start call goes straight to the error state, with no
 *    countdown and no call to /api/validar-anuncio,
 *  - countdown completion POSTs /api/validar-anuncio (no body) and shows the
 *    success state,
 *  - a non-ok validate response shows the error state with a retry,
 *  - copy is localized (es/en).
 *
 * Fake timers drive the countdown; fetch and location.reload are stubbed so the
 * flow is deterministic and does not actually navigate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import AdModal, { AD_DURATION_SECONDS, COPY } from './AdModal';

const START_URL = '/api/anuncio/inicio';
const VALIDATE_URL = '/api/validar-anuncio';

/** Stub window.location.reload so the success path does not navigate. */
function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  return reload;
}

/**
 * Stub global fetch to route by URL: `/api/anuncio/inicio` resolves with
 * `startOk`, `/api/validar-anuncio` resolves with `validateResult` (or
 * rejects, when `validateResult` is an Error).
 */
function stubFetch(options: {
  startOk?: boolean;
  startThrows?: boolean;
  validateResult?: { ok: boolean; body: { ok: boolean; error?: string } } | Error;
}) {
  const { startOk = true, startThrows = false, validateResult } = options;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === START_URL) {
      if (startThrows) {
        throw new Error('network down');
      }
      return { ok: startOk, json: async () => ({ ok: startOk }) };
    }
    if (url === VALIDATE_URL) {
      if (validateResult instanceof Error) {
        throw validateResult;
      }
      const result = validateResult ?? { ok: true, body: { ok: true } };
      return { ok: result.ok, json: async () => result.body };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Click the Watch CTA and flush the awaited `/inicio` call it fires first. */
async function clickWatch(label: string) {
  fireEvent.click(screen.getByText(label));
  // `startAd` awaits the start-call promise before arming the countdown —
  // flush that microtask chain so the interval actually exists afterward.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
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

  it('POSTs /api/anuncio/inicio before starting the countdown when Watch is clicked', async () => {
    const fetchMock = stubFetch({});
    render(<AdModal lang="en" />);

    await clickWatch('Watch ad to unlock');

    expect(fetchMock).toHaveBeenCalledWith(START_URL, { method: 'POST' });
    // Countdown begins at the full duration only AFTER the start call resolved.
    expect(screen.getByTestId('ad-status').textContent).toContain(
      String(AD_DURATION_SECONDS),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('ad-status').textContent).toContain(
      String(AD_DURATION_SECONDS - 1),
    );
    // The countdown completing is what triggers validate — not yet reached.
    expect(fetchMock).not.toHaveBeenCalledWith(VALIDATE_URL, expect.anything());
  });

  it('shows the error state immediately when the start call returns non-ok, with no countdown and no validate call', async () => {
    const fetchMock = stubFetch({ startOk: false });
    render(<AdModal lang="en" />);

    await clickWatch('Watch ad to unlock');

    expect(screen.getByTestId('ad-error')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(VALIDATE_URL, expect.anything());
  });

  it('shows the error state immediately when the start call rejects (network failure)', async () => {
    const fetchMock = stubFetch({ startThrows: true });
    render(<AdModal lang="en" />);

    await clickWatch('Watch ad to unlock');

    expect(screen.getByTestId('ad-error')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(VALIDATE_URL, expect.anything());
  });

  it('reaches the success state and reloads after a successful validation', async () => {
    const reload = stubReload();
    const fetchMock = stubFetch({ validateResult: { ok: true, body: { ok: true } } });

    render(<AdModal lang="es" />);
    await clickWatch('Ver anuncio para desbloquear');

    await runCountdown();

    expect(fetchMock).toHaveBeenCalledWith(VALIDATE_URL, { method: 'POST' });
    expect(screen.getByTestId('ad-success')).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the error state when validation returns non-ok', async () => {
    stubReload();
    stubFetch({ validateResult: { ok: false, body: { ok: false, error: 'Invalid ad session' } } });

    render(<AdModal lang="en" />);
    await clickWatch('Watch ad to unlock');

    await runCountdown();

    expect(screen.getByTestId('ad-error')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('shows the error state on a network failure during validation', async () => {
    stubReload();
    stubFetch({ validateResult: new Error('network down') });

    render(<AdModal lang="en" />);
    await clickWatch('Watch ad to unlock');

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
