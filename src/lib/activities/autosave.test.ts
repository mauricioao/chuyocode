import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosaveScheduler, type AutosaveStatus } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function statusRecorder() {
  const statuses: AutosaveStatus[] = [];
  return { statuses, onStatusChange: (s: AutosaveStatus) => statuses.push(s) };
}

describe('createAutosaveScheduler — debounce', () => {
  it('does not save before the delay elapses', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    vi.advanceTimersByTime(2999);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves ~3s after the last change', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledWith('a');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('restarts the debounce timer on every new change (only the LAST value is saved)', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    vi.advanceTimersByTime(2000);
    scheduler.notifyChange('b');
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled(); // only 2s since the last change
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('b');
  });

  it('reports pending then saving then saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { statuses, onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    expect(statuses).toEqual(['pending']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });
});

describe('createAutosaveScheduler — single flight, queue the latest', () => {
  it('never runs two saves concurrently: a change during a save is queued and runs right after', async () => {
    let resolveFirst: () => void = () => {};
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(undefined);
    const { statuses, onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000); // save('a') starts, still pending
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('saving');

    // A change arrives WHILE the first save is in flight.
    scheduler.notifyChange('b');
    await vi.advanceTimersByTimeAsync(3000); // debounce for 'b' elapses too
    // Still only one save call — the second is queued, not started, because one is in flight.
    expect(save).toHaveBeenCalledTimes(1);

    // The first save resolves: the queued 'b' runs immediately (no extra 3s wait).
    resolveFirst();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith('b');
  });
});

describe('createAutosaveScheduler — skip if nothing changed', () => {
  it('does not call save again for a value equal to what is already saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange, isEqual: (a, b) => a === b });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);

    // Same value again (e.g. an undo back to the saved state).
    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports "saved" immediately when a change reverts to the already-saved value', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { statuses, onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    statuses.length = 0;

    scheduler.notifyChange('b');
    expect(statuses).toEqual(['pending']);
    scheduler.notifyChange('a'); // back to what's saved — cancel the pending save
    expect(statuses).toEqual(['pending', 'saved']);

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1); // never saved 'b'
  });
});

describe('createAutosaveScheduler — errors', () => {
  it('reports "error" when save rejects, and never silently swallows it', async () => {
    const save = vi.fn().mockRejectedValue(new Error('network down'));
    const { statuses, onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(statuses).toEqual(['pending', 'saving', 'error']);
  });

  it('flushNow retries an errored save', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    const { statuses, onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(statuses).toEqual(['pending', 'saving', 'error']);

    scheduler.flushNow();
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('saved'));
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('createAutosaveScheduler — flushNow (manual save)', () => {
  it('saves immediately without waiting for the debounce', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    scheduler.flushNow();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith('a');
  });

  it('is a no-op when there is nothing pending', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });
    scheduler.flushNow();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('createAutosaveScheduler — dispose', () => {
  it('stops a pending debounce from ever firing', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it('ignores a result that resolves after dispose', async () => {
    let resolveSave: () => void = () => {};
    const save = vi.fn().mockImplementation(() => new Promise<void>((resolve) => (resolveSave = resolve)));
    const { statuses, onStatusChange } = statusRecorder();
    const scheduler = createAutosaveScheduler({ save, onStatusChange });

    scheduler.notifyChange('a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(statuses.at(-1)).toBe('saving');
    scheduler.dispose();
    resolveSave();
    await Promise.resolve();
    expect(statuses.at(-1)).toBe('saving'); // never reported 'saved' post-dispose
  });
});
