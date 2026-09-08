// @vitest-environment jsdom
/**
 * LikeButton tests — the optimistic TOGGLE and, above all, its undo.
 *
 * The behaviour worth proving is the honesty rule, now in both directions: the
 * button may GUESS while the request is in flight, but it must never keep a
 * number the server did not confirm, and it must never DROP one the server did
 * not remove. So each direction gets the guess, the confirmation, and every
 * shape of "the counter did not move" — a failed write, a non-ok response and a
 * thrown fetch.
 *
 * Appearance is deliberately NOT asserted (no class checks): what matters is the
 * number shown, the pressed state, the name the control announces, and whether a
 * request was sent at all.
 *
 * Assertions are plain DOM — this repo ships no `jest-dom`, so the accessible
 * name is checked through `getByRole({ name })`, which computes it properly
 * rather than string-matching `textContent`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import LikeButton, { COPY, likeEndpoint } from './LikeButton';

const ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

/** Install a `fetch` stub that resolves to `body` with the given ok-ness. */
function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function button(): HTMLElement {
  return screen.getByTestId('exercise-like');
}

/** The rendered number, read from the element that holds only the count. */
function shownCount(): string {
  return button().querySelector('.tabular-nums')?.textContent ?? '';
}

function pressed(): string | null {
  return button().getAttribute('aria-pressed');
}

/**
 * Wait until the in-flight request has settled.
 *
 * Not politeness: a test that ends while the fetch promise is still pending gets
 * its final state update applied outside `act(...)`, which React reports as a
 * warning and which leaves the assertions checking a half-finished state.
 */
async function settled(): Promise<void> {
  await waitFor(() => expect(button().getAttribute('aria-busy')).toBe('false'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LikeButton — liking', () => {
  it('renders the server-rendered count and is not pressed yet', () => {
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    expect(shownCount()).toBe('12');
    expect(pressed()).toBe('false');
  });

  it('POSTs to the like endpoint for THIS exercise', async () => {
    const fetchMock = stubFetch({ count: 13 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(likeEndpoint(ID), { method: 'POST' });
    await settled();
  });

  it("adopts the server's number, not its own guess", async () => {
    // The guess is +1; the server says the real total is 99 (someone else liked
    // it meanwhile). The server wins — that is what "never lie" means here.
    stubFetch({ count: 99 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('99'));
    expect(pressed()).toBe('true');
  });

  it('shows the optimistic +1 before the server answers', async () => {
    // Triangulation: without this, every "it reverted to 12" case below would
    // also pass on a button that never moved the number at all.
    let release: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = resolve; })),
    );
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    expect(shownCount()).toBe('13');
    release?.({ ok: true, json: async () => ({ count: 13 }) });
    await settled();
  });

  it('reverts the count AND the pressed state when the counter is unavailable', async () => {
    stubFetch({ count: null });
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(pressed()).toBe('false'));
    // Back to exactly what the server last confirmed — no lingering +1.
    expect(shownCount()).toBe('12');
  });

  it('reverts on a non-ok response', async () => {
    stubFetch({ count: 13 }, false);
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(pressed()).toBe('false'));
    expect(shownCount()).toBe('12');
  });

  it('reverts when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(pressed()).toBe('false'));
    expect(shownCount()).toBe('12');
  });

  it('counts a double click once', async () => {
    const fetchMock = stubFetch({ count: 13 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    fireEvent.click(button());
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('13'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays focusable while it works instead of being disabled', async () => {
    // Disabling the element that was just clicked drops focus to <body> — the
    // browser's rule for disabled elements, already documented on the stepper.
    // `aria-disabled` states the same thing without moving focus.
    stubFetch({ count: 13 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} lang="es" />);
    button().focus();
    fireEvent.click(button());
    await settled();
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(button());
  });
});

/**
 * The half this component did not have. Liking used to be one-way: a press while
 * already liked returned early and sent nothing. Being liked is now precisely
 * the state in which a press is most meaningful, so every case below would have
 * passed vacuously against the previous version — the request it asserts was
 * never sent at all.
 */
describe('LikeButton — un-liking', () => {
  it('starts pressed when SSR says this browser already liked it', () => {
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    expect(pressed()).toBe('true');
    expect(shownCount()).toBe('12');
  });

  it('SENDS a request when already liked, instead of refusing', async () => {
    const fetchMock = stubFetch({ count: 11 });
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(likeEndpoint(ID), { method: 'POST' });
    await settled();
  });

  it('shows the optimistic -1 before the server answers', async () => {
    let release: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = resolve; })),
    );
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    expect(shownCount()).toBe('11');
    expect(pressed()).toBe('false');
    release?.({ ok: true, json: async () => ({ count: 11 }) });
    await settled();
  });

  it('adopts the server total and ends up unpressed', async () => {
    stubFetch({ count: 40 });
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('40'));
    expect(pressed()).toBe('false');
  });

  it('never shows a negative number, even guessing from a stale zero', async () => {
    // The real floor is in the RPC and a CHECK constraint behind it; this is
    // about the one paint between the click and the answer, where a naive
    // `count - 1` would render "-1" on a counter that was already at zero.
    let release: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = resolve; })),
    );
    render(<LikeButton exerciseId={ID} count={0} liked lang="es" />);
    fireEvent.click(button());
    expect(shownCount()).toBe('0');
    release?.({ ok: true, json: async () => ({ count: 0 }) });
    await settled();
    expect(shownCount()).toBe('0');
  });

  /**
   * 🔴 THE SYMMETRIC UNDO. Reverting a failed like is "drop the +1"; reverting a
   * failed un-like has to put the like BACK — both the number and the pressed
   * state. A component that only knew how to roll back to "not liked" would
   * quietly tell the visitor their like was removed when nothing happened.
   */
  it('restores the like when the counter is unavailable', async () => {
    stubFetch({ count: null });
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    await settled();
    expect(shownCount()).toBe('12');
    expect(pressed()).toBe('true');
  });

  it('restores the like on a non-ok response', async () => {
    stubFetch({ count: 11 }, false);
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    await settled();
    expect(shownCount()).toBe('12');
    expect(pressed()).toBe('true');
  });

  it('restores the like when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    await settled();
    expect(shownCount()).toBe('12');
    expect(pressed()).toBe('true');
  });

  it('sends one request for a double click, not two', async () => {
    const fetchMock = stubFetch({ count: 11 });
    render(<LikeButton exerciseId={ID} count={12} liked lang="es" />);
    fireEvent.click(button());
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('11'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('LikeButton — what it announces', () => {
  it('names the action a press will perform, plus the count', () => {
    // The count is part of the accessible name on purpose — an `aria-label`
    // would override the content and silence the only part that changes.
    render(<LikeButton exerciseId={ID} count={3} liked={false} lang="es" />);
    expect(screen.getByRole('button', { name: 'Me gusta 3' })).toBeTruthy();
  });

  it('names the OPPOSITE action once the exercise is liked', () => {
    render(<LikeButton exerciseId={ID} count={3} liked lang="es" />);
    expect(screen.getByRole('button', { name: 'Quitar me gusta 3' })).toBeTruthy();
  });

  it('follows the state across a press, name and pressed together', async () => {
    stubFetch({ count: 4 });
    render(<LikeButton exerciseId={ID} count={3} liked={false} lang="es" />);
    fireEvent.click(button());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Quitar me gusta 4' })).toBeTruthy(),
    );
    expect(pressed()).toBe('true');
  });

  it('localizes both names', () => {
    render(<LikeButton exerciseId={ID} count={3} liked={false} lang="en" />);
    expect(screen.getByRole('button', { name: 'Like 3' })).toBeTruthy();
    cleanup();

    render(<LikeButton exerciseId={ID} count={3} liked lang="en" />);
    expect(screen.getByRole('button', { name: 'Remove like 3' })).toBeTruthy();
  });

  it('falls back to English for an unknown locale', () => {
    render(<LikeButton exerciseId={ID} count={3} liked={false} lang="fr" />);
    expect(screen.getByRole('button', { name: 'Like 3' })).toBeTruthy();
  });

  it('writes its Spanish in neutral Spanish, with no voseo', () => {
    // 🔴 THIS SWEEP IS WHY `COPY` IS EXPORTED. The site-wide guard in
    // `i18n.test.ts` walks `UI_LABELS`, and this island's copy deliberately does
    // not live there (a toggle's name depends on state the page cannot see), so
    // that guard structurally cannot reach it. Same arrangement as `AdModal`.
    //
    // The detector is the SHARED one, never re-implemented inline: a second
    // implementation is how one guard silently ends up laxer than the other.

    // Triangulation: the detector does fire on copy that IS voseo.
    expect(voseoWords('Quitá el me gusta')).toEqual(['Quitá']);

    expect(Object.keys(COPY.es)).toEqual(['like', 'unlike']);
    expect(findVoseo(COPY.es)).toEqual([]);
  });
});
