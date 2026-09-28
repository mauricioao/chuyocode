// @vitest-environment jsdom
/**
 * HeartButton tests — mirrors `LikeButton.test.tsx`'s style: the optimistic
 * toggle, its undo in every failure shape, and what the control announces.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HeartButton from './HeartButton';

const ACTIVITY_ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function button(): HTMLElement {
  return screen.getByTestId('activity-heart-button');
}

function shownCount(): string {
  return button().querySelector('.tabular-nums')?.textContent ?? '';
}

function pressed(): string | null {
  return button().getAttribute('aria-pressed');
}

async function settled(): Promise<void> {
  await waitFor(() => expect(button().getAttribute('aria-busy')).toBe('false'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HeartButton — hearting', () => {
  it('renders the server-rendered count and is not pressed yet', () => {
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    expect(shownCount()).toBe('5');
    expect(pressed()).toBe('false');
  });

  it('POSTs to the corazon endpoint for THIS activity', async () => {
    const fetchMock = stubFetch({ hearted: true, heartCount: 6 });
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(`/api/actividades/${ACTIVITY_ID}/corazon`, { method: 'POST' });
    await settled();
  });

  it("adopts the server's numbers, not its own guess", async () => {
    stubFetch({ hearted: true, heartCount: 40 });
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('40'));
    expect(pressed()).toBe('true');
  });

  it('shows the optimistic +1 before the server answers', async () => {
    let release: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = resolve; })),
    );
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    expect(shownCount()).toBe('6');
    expect(pressed()).toBe('true');
    release?.({ ok: true, json: async () => ({ hearted: true, heartCount: 6 }) });
    await settled();
  });

  it('reverts count and pressed state on a malformed response', async () => {
    stubFetch({});
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    await waitFor(() => expect(pressed()).toBe('false'));
    expect(shownCount()).toBe('5');
  });

  it('reverts on a non-ok response', async () => {
    stubFetch({ hearted: true, heartCount: 6 }, false);
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    await waitFor(() => expect(pressed()).toBe('false'));
    expect(shownCount()).toBe('5');
  });

  it('reverts when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    await waitFor(() => expect(pressed()).toBe('false'));
    expect(shownCount()).toBe('5');
  });

  it('counts a double click once', async () => {
    const fetchMock = stubFetch({ hearted: true, heartCount: 6 });
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    fireEvent.click(button());
    fireEvent.click(button());
    await waitFor(() => expect(shownCount()).toBe('6'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays focusable while it works instead of being disabled', async () => {
    stubFetch({ hearted: true, heartCount: 6 });
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted={false} />);
    button().focus();
    fireEvent.click(button());
    await settled();
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(button());
  });
});

describe('HeartButton — un-hearting', () => {
  it('starts pressed when the SSR lookup says this caller already hearted it', () => {
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted />);
    expect(pressed()).toBe('true');
    expect(shownCount()).toBe('5');
  });

  it('sends a request when already hearted, instead of refusing', async () => {
    const fetchMock = stubFetch({ hearted: false, heartCount: 4 });
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted />);
    fireEvent.click(button());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settled();
  });

  it('never shows a negative number, even guessing from a stale zero', async () => {
    let release: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = resolve; })),
    );
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={0} hearted />);
    fireEvent.click(button());
    expect(shownCount()).toBe('0');
    release?.({ ok: true, json: async () => ({ hearted: false, heartCount: 0 }) });
    await settled();
  });

  it('restores the heart (count and pressed state) on a malformed response', async () => {
    stubFetch({});
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={5} hearted />);
    fireEvent.click(button());
    await settled();
    expect(shownCount()).toBe('5');
    expect(pressed()).toBe('true');
  });
});

describe('HeartButton — what it announces', () => {
  it('names the action a press will perform, plus the count, in Spanish', () => {
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={3} hearted={false} />);
    expect(screen.getByRole('button', { name: 'Dar corazón 3' })).toBeTruthy();
  });

  it('names the OPPOSITE action once hearted', () => {
    render(<HeartButton lang="es" activityId={ACTIVITY_ID} heartCount={3} hearted />);
    expect(screen.getByRole('button', { name: 'Quitar corazón 3' })).toBeTruthy();
  });

  it('localizes both names in English', () => {
    render(<HeartButton lang="en" activityId={ACTIVITY_ID} heartCount={3} hearted={false} />);
    expect(screen.getByRole('button', { name: 'Heart 3' })).toBeTruthy();
    cleanup();

    render(<HeartButton lang="en" activityId={ACTIVITY_ID} heartCount={3} hearted />);
    expect(screen.getByRole('button', { name: 'Remove heart 3' })).toBeTruthy();
  });
});
