import { describe, it, expect, vi } from 'vitest';
import {
  computeProgress,
  createUploadTask,
  initialUploadTaskState,
  uploadTaskReducer,
  type UploadTaskState,
} from './uploadTask';

describe('computeProgress — weighted stages', () => {
  it('is 0 at preparing, regardless of index', () => {
    expect(computeProgress(5, 0, 'preparing')).toBe(0);
  });

  it('is index/total while converting', () => {
    expect(computeProgress(4, 0, 'converting')).toBe(0);
    expect(computeProgress(4, 2, 'converting')).toBe(0.5);
  });

  it('is (index+0.5)/total while uploading — the second half of that item\'s share', () => {
    expect(computeProgress(4, 0, 'uploading')).toBe(0.125);
    expect(computeProgress(4, 2, 'uploading')).toBe(0.625);
  });

  it('is (index+1)/total once an item is done', () => {
    expect(computeProgress(4, 3, 'item_done')).toBe(1);
  });

  it('never exceeds 1 or drops below 0, and is 0 for a non-positive total', () => {
    expect(computeProgress(0, 0, 'converting')).toBe(0);
    expect(computeProgress(2, 5, 'uploading')).toBe(1);
  });
});

describe('uploadTaskReducer — pure transitions', () => {
  it('start on a PDF begins at "preparing" with 0 progress', () => {
    const state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'pdf',
      pageNumbers: [2, 5, 7],
    });
    expect(state.status).toBe('running');
    expect(state.stage).toBe('preparing');
    expect(state.total).toBe(3);
    expect(state.pageNumber).toBe(2);
    expect(state.progress).toBe(0);
  });

  it('start on a single image skips preparing and begins converting', () => {
    const state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'image',
      pageNumbers: [1],
    });
    expect(state.stage).toBe('converting');
  });

  it('prepared moves a pdf from preparing to converting item 0', () => {
    let state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'pdf',
      pageNumbers: [1, 2],
    });
    state = uploadTaskReducer(state, { type: 'prepared' });
    expect(state.stage).toBe('converting');
    expect(state.progress).toBe(0);
  });

  it('converting/uploading/item_done walk progress and pageNumber across items', () => {
    let state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'pdf',
      pageNumbers: [3, 6],
    });
    state = uploadTaskReducer(state, { type: 'prepared' });

    state = uploadTaskReducer(state, { type: 'converting', index: 0 });
    expect(state.pageNumber).toBe(3);
    expect(state.progress).toBe(0);

    state = uploadTaskReducer(state, { type: 'uploading', index: 0 });
    expect(state.progress).toBe(0.25);

    state = uploadTaskReducer(state, {
      type: 'item_done',
      index: 0,
      result: { path: 'a', width: 1, height: 1 },
    });
    expect(state.status).toBe('running');
    expect(state.results).toHaveLength(1);
    expect(state.progress).toBe(0.5);

    state = uploadTaskReducer(state, { type: 'converting', index: 1 });
    expect(state.pageNumber).toBe(6);

    state = uploadTaskReducer(state, { type: 'uploading', index: 1 });
    state = uploadTaskReducer(state, {
      type: 'item_done',
      index: 1,
      result: { path: 'b', width: 2, height: 2 },
    });
    expect(state.status).toBe('done');
    expect(state.progress).toBe(1);
    expect(state.results.map((r) => r.path)).toEqual(['a', 'b']);
  });

  it('error freezes the task on the failed item, keeping prior results', () => {
    let state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'pdf',
      pageNumbers: [1, 2, 3],
    });
    state = uploadTaskReducer(state, { type: 'prepared' });
    state = uploadTaskReducer(state, { type: 'converting', index: 0 });
    state = uploadTaskReducer(state, { type: 'uploading', index: 0 });
    state = uploadTaskReducer(state, {
      type: 'item_done',
      index: 0,
      result: { path: 'a', width: 1, height: 1 },
    });
    state = uploadTaskReducer(state, { type: 'converting', index: 1 });
    state = uploadTaskReducer(state, { type: 'error', index: 1, message: 'network' });

    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('network');
    expect(state.index).toBe(1);
    expect(state.pageNumber).toBe(2);
    expect(state.results).toHaveLength(1);
  });

  it('retry resumes converting at the failed index, clearing the error', () => {
    let state: UploadTaskState = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'pdf',
      pageNumbers: [1, 2, 3],
    });
    state = uploadTaskReducer(state, { type: 'error', index: 1, message: 'boom' });
    state = uploadTaskReducer(state, { type: 'retry' });

    expect(state.status).toBe('running');
    expect(state.stage).toBe('converting');
    expect(state.index).toBe(1);
    expect(state.errorMessage).toBeNull();
  });

  it('retry is a no-op outside the error status', () => {
    const state = uploadTaskReducer(initialUploadTaskState, { type: 'retry' });
    expect(state).toBe(initialUploadTaskState);
  });

  it('cancel stops a running task, keeping any results already in', () => {
    let state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'pdf',
      pageNumbers: [1, 2],
    });
    state = uploadTaskReducer(state, { type: 'prepared' });
    state = uploadTaskReducer(state, { type: 'converting', index: 0 });
    state = uploadTaskReducer(state, { type: 'uploading', index: 0 });
    state = uploadTaskReducer(state, {
      type: 'item_done',
      index: 0,
      result: { path: 'a', width: 1, height: 1 },
    });
    state = uploadTaskReducer(state, { type: 'converting', index: 1 });
    state = uploadTaskReducer(state, { type: 'cancel' });

    expect(state.status).toBe('cancelled');
    expect(state.results).toHaveLength(1);
  });

  it('reset returns to the initial idle state', () => {
    let state = uploadTaskReducer(initialUploadTaskState, {
      type: 'start',
      kind: 'image',
      pageNumbers: [1],
    });
    state = uploadTaskReducer(state, { type: 'reset' });
    expect(state).toEqual(initialUploadTaskState);
  });
});

/** A never-resolving promise, for pausing a run mid-item to exercise cancel. */
function pending<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createUploadTask — orchestration', () => {
  it('runs a pdf task end to end, uploading every page in order', async () => {
    const states: UploadTaskState[] = [];
    const task = createUploadTask({ onStateChange: (s) => states.push(s) });
    const items = [{ page: 1 }, { page: 2 }];

    task.start({
      kind: 'pdf',
      items,
      pageNumberFor: (item) => item.page,
      convertItem: async (item) => new Blob([`page-${item.page}`]),
      uploadBlob: async (blob) => ({ path: await blob.text(), width: 10, height: 10 }),
    });

    await vi.waitFor(() => expect(task.getState().status).toBe('done'));
    expect(task.getState().results.map((r) => r.path)).toEqual(['page-1', 'page-2']);
    // Never silently returns to idle mid-flight — every reported state while
    // running stays 'running' until the final 'done'.
    expect(states.slice(0, -1).every((s) => s.status === 'running')).toBe(true);
  });

  it('a single image task skips the preparing stage', async () => {
    const task = createUploadTask({ onStateChange: () => {} });
    task.start({
      kind: 'image',
      items: [{}],
      pageNumberFor: () => 1,
      convertItem: async () => new Blob(['x']),
      uploadBlob: async () => ({ path: 'x.webp', width: 10, height: 10 }),
    });
    await vi.waitFor(() => expect(task.getState().status).toBe('done'));
  });

  it('cancelling mid-upload stops the task as cancelled and keeps earlier results', async () => {
    const task = createUploadTask({ onStateChange: () => {} });
    const secondUpload = pending<{ path: string; width: number; height: number }>();
    let uploadCalls = 0;

    task.start({
      kind: 'pdf',
      items: [{ page: 1 }, { page: 2 }, { page: 3 }],
      pageNumberFor: (item) => item.page,
      convertItem: async (item) => new Blob([`page-${item.page}`]),
      uploadBlob: async (blob, signal) => {
        uploadCalls += 1;
        if (uploadCalls === 2) {
          signal.addEventListener('abort', () => secondUpload.reject(new DOMException('aborted', 'AbortError')));
          return secondUpload.promise;
        }
        return { path: await blob.text(), width: 10, height: 10 };
      },
    });

    await vi.waitFor(() => expect(uploadCalls).toBe(2));
    task.cancel();

    await vi.waitFor(() => expect(task.getState().status).toBe('cancelled'));
    expect(task.getState().results.map((r) => r.path)).toEqual(['page-1']);
  });

  it('a failure on page 3 stops the task in error, and retry resumes at page 3 without re-uploading 1-2', async () => {
    const task = createUploadTask({ onStateChange: () => {} });
    let attempt = 0;

    task.start({
      kind: 'pdf',
      items: [{ page: 1 }, { page: 2 }, { page: 3 }],
      pageNumberFor: (item) => item.page,
      convertItem: async (item) => new Blob([`page-${item.page}`]),
      uploadBlob: async (blob) => {
        const page = await blob.text();
        if (page === 'page-3') {
          attempt += 1;
          if (attempt === 1) throw new Error('network');
        }
        return { path: page, width: 10, height: 10 };
      },
    });

    await vi.waitFor(() => expect(task.getState().status).toBe('error'));
    expect(task.getState().pageNumber).toBe(3);
    expect(task.getState().results.map((r) => r.path)).toEqual(['page-1', 'page-2']);

    task.retry();
    await vi.waitFor(() => expect(task.getState().status).toBe('done'));
    expect(task.getState().results.map((r) => r.path)).toEqual(['page-1', 'page-2', 'page-3']);
    expect(attempt).toBe(2); // page 3 was converted/uploaded twice (fail, then retry) — pages 1-2 only once each
  });

  it('maps a thrown error through errorMessageFor', async () => {
    const task = createUploadTask({
      onStateChange: () => {},
      errorMessageFor: (err) => (err instanceof Error ? `mapped:${err.message}` : 'mapped:unknown'),
    });
    task.start({
      kind: 'image',
      items: [{}],
      pageNumberFor: () => 1,
      convertItem: async () => {
        throw new Error('too_big');
      },
      uploadBlob: async () => {
        throw new Error('unreachable');
      },
    });

    await vi.waitFor(() => expect(task.getState().status).toBe('error'));
    expect(task.getState().errorMessage).toBe('mapped:too_big');
  });
});
