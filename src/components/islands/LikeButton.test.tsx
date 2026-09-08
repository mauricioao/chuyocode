// @vitest-environment jsdom
/**
 * LikeButton tests — the optimistic counter and, above all, its undo.
 *
 * The behaviour worth proving is the honesty rule: the button may GUESS while
 * the request is in flight, but it must never keep a number the server did not
 * confirm. So the cases are the guess, the confirmation, and every shape of
 * "the counter did not move" — a failed write, a non-ok response, a thrown
 * fetch, and a click that landed inside the server's dedup window.
 *
 * Appearance is deliberately NOT asserted (no class checks): what matters is the
 * number shown, the pressed state, and whether a request was sent at all.
 *
 * Assertions are plain DOM — this repo ships no `jest-dom`, so the accessible
 * name is checked through `getByRole({ name })`, which computes it properly
 * rather than string-matching `textContent`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LikeButton, { likeEndpoint } from './LikeButton';

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

describe('LikeButton', () => {
  it('renders the server-rendered count and is not pressed yet', () => {
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    expect(shownCount()).toBe('12');
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('names itself with the label the page resolved, plus the count', () => {
    // The count is part of the accessible name on purpose — an `aria-label`
    // would override the content and silence the only part that changes.
    render(<LikeButton exerciseId={ID} count={3} liked={false} label="Me gusta" />);
    expect(screen.getByRole('button', { name: 'Me gusta 3' })).toBeTruthy();
  });

  it('POSTs to the like endpoint for THIS exercise', async () => {
    const fetchMock = stubFetch({ count: 13 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(likeEndpoint(ID), { method: 'POST' });
    await settled();
  });

  it("adopts the server's number, not its own guess", async () => {
    // The guess is +1; the server says the real total is 99 (someone else liked
    // it meanwhile). The server wins — that is what "never lie" means here.
    stubFetch({ count: 99 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('99'));
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the optimistic +1 before the server answers', async () => {
    // Triangulation: without this, every "it reverted to 12" case below would
    // also pass on a button that never moved the number at all.
    let release: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = resolve; })),
    );
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    expect(shownCount()).toBe('13');
    release?.({ ok: true, json: async () => ({ count: 13 }) });
    await settled();
  });

  it('reverts the count AND the pressed state when the counter is unavailable', async () => {
    stubFetch({ count: null });
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    await waitFor(() =>
      expect(button().getAttribute('aria-pressed')).toBe('false'),
    );
    // Back to exactly what the server last confirmed — no lingering +1.
    expect(shownCount()).toBe('12');
  });

  it('reverts on a non-ok response', async () => {
    stubFetch({ count: 13 }, false);
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    await waitFor(() =>
      expect(button().getAttribute('aria-pressed')).toBe('false'),
    );
    expect(shownCount()).toBe('12');
  });

  it('reverts when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    await waitFor(() =>
      expect(button().getAttribute('aria-pressed')).toBe('false'),
    );
    expect(shownCount()).toBe('12');
  });

  it('undoes the guess when the click landed inside the dedup window', async () => {
    // The server did not count it and answers the UNCHANGED total, so adopting
    // that number is itself the undo — no special case in the component.
    stubFetch({ count: 12 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    fireEvent.click(button());
    await settled();
    expect(shownCount()).toBe('12');
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });

  it('sends nothing when this browser already liked it (SSR said so)', () => {
    const fetchMock = stubFetch({ count: 13 });
    render(<LikeButton exerciseId={ID} count={12} liked label="Me gusta" />);
    expect(button().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts a double click once', async () => {
    const fetchMock = stubFetch({ count: 13 });
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
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
    render(<LikeButton exerciseId={ID} count={12} liked={false} label="Me gusta" />);
    button().focus();
    fireEvent.click(button());
    await settled();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(button());
  });
});
