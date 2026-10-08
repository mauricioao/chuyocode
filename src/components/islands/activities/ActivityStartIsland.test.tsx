// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ActivityStartIsland from './ActivityStartIsland';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toastErrorMock.mockClear();
});

describe('ActivityStartIsland', () => {
  // "First block visible" (creator polish round 4, owner feedback #2): the
  // activity is created with one EMPTY worksheet block already in it — no
  // image yet, rendered as the block's own drop-zone empty state once the
  // editor opens — in the SAME `POST /api/actividades` call, not a second
  // best-effort save.
  it('creates an activity with one empty worksheet block already in it, and navigates to its editor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-1'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/actividades');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.lang).toBe('es');
    expect(body.blocks).toEqual([
      expect.objectContaining({ type: 'worksheet', rotation: 0, zones: [] }),
    ]);
  });

  it('marks the worksheet card busy (aria-busy) while the request is in flight, with no inline "creating" text', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityStartIsland lang="es" navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    await waitFor(() => expect(screen.getByTestId('picker-worksheet').getAttribute('aria-busy')).toBe('true'));
    expect((screen.getByTestId('picker-questions') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('start-creating')).toBeNull();

    resolveFetch({ ok: true, json: async () => ({ id: 'x' }) });
  });

  it('shows an error toast and restores the cards when the request fails (non-ok response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect((screen.getByTestId('picker-worksheet') as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTestId('picker-questions') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('shows an error toast when fetch itself throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<ActivityStartIsland lang="es" navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
  });

  it('creates an activity with one empty quiz block already in it, and navigates to its editor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-2' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-questions'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-2'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/actividades');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.lang).toBe('es');
    expect(body.blocks).toEqual([
      expect.objectContaining({ type: 'quiz', payload: { pools: {}, slots: [] } }),
    ]);
  });

  it('marks the questions card busy while its request is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityStartIsland lang="es" navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-questions'));

    await waitFor(() => expect(screen.getByTestId('picker-questions').getAttribute('aria-busy')).toBe('true'));
    expect((screen.getByTestId('picker-worksheet') as HTMLButtonElement).disabled).toBe(true);

    resolveFetch({ ok: true, json: async () => ({ id: 'x' }) });
  });

  // "Une las parejas" (start-gallery redesign, build items 3/4).
  it('creates an activity with one empty, "match"-templated quiz block, and navigates to its editor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-3' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-match'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-3'));

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.blocks).toEqual([
      expect.objectContaining({ type: 'quiz', template: 'match', payload: { pools: {}, slots: [] } }),
    ]);
  });

  it('marks the match card busy while its request is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityStartIsland lang="es" navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-match'));

    await waitFor(() => expect(screen.getByTestId('picker-match').getAttribute('aria-busy')).toBe('true'));
    expect((screen.getByTestId('picker-worksheet') as HTMLButtonElement).disabled).toBe(true);

    resolveFetch({ ok: true, json: async () => ({ id: 'x' }) });
  });
});
