/**
 * Upload task state machine for a multi-step worksheet upload (a PDF's
 * selected pages, or a single image): `idle -> running -> done | error |
 * cancelled`, with `running` carrying its own `stage` (`preparing` for a
 * PDF only, then `converting`/`uploading` once per item). Drives the
 * `TaskProgress` panel (`src/components/ui/task-progress.tsx`) that
 * REPLACES `WorksheetUploader.tsx`'s empty drop zone while a task runs, so
 * the creator always sees the stage and page, never a bare "Cargando…" and
 * never the drop zone again until the task finishes, fails, or is
 * cancelled.
 *
 * Zero I/O of its own: `convertItem`/`uploadBlob` are supplied by the
 * caller (the real ones call into `imagePipeline.ts` / `fetch`; tests
 * supply fakes) — same shape as `autosave.ts`'s `createAutosaveScheduler`.
 *
 * CANCEL/RETRY POLICY: a page already uploaded when cancel or a later
 * page's failure happens STAYS uploaded. There is no DELETE verb on
 * `/api/actividades/imagen` (see that route's own header): every upload
 * lands in the private, pre-moderation `activity-uploads` bucket, counted
 * against the uploader's 100-upload quota, and simply unreferenced unless
 * the worksheet block is actually created from it — cleaning it up would
 * need a new endpoint for no real benefit. `retry()` therefore RESUMES at
 * the failed item: earlier successes are never re-converted or
 * re-uploaded, and their results stay in `results`.
 */

/**
 * `'stitch'` (one-sheet redesign): several images/PDF pages combined
 * client-side into one sheet BEFORE this task ever starts — always a
 * single-item run (`items.length === 1`), same shape as a plain `'image'`
 * run, just a different stage label (`WorksheetUploader.tsx`'s own
 * `stageLabel`).
 */
export type UploadTaskKind = 'pdf' | 'image' | 'stitch';
export type UploadTaskStage = 'preparing' | 'converting' | 'uploading';
export type UploadTaskStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface UploadTaskItemResult {
  path: string;
  width: number;
  height: number;
}

export interface UploadTaskState {
  status: UploadTaskStatus;
  kind: UploadTaskKind | null;
  /** How many items this task has — pages for a PDF, always 1 for an image. */
  total: number;
  /** The 1-based page/item number shown for each index ("página i de N"). */
  pageNumbers: number[];
  /** 0-based index of the item currently being processed (or last touched, once stopped). */
  index: number;
  /** `pageNumbers[index]`, kept alongside it for convenient display. */
  pageNumber: number | null;
  stage: UploadTaskStage | null;
  /** 0..1 overall determinate progress — see {@link computeProgress}. */
  progress: number;
  /** Completed uploads, in order — kept across a retry. */
  results: UploadTaskItemResult[];
  errorMessage: string | null;
}

export const initialUploadTaskState: UploadTaskState = {
  status: 'idle',
  kind: null,
  total: 0,
  pageNumbers: [],
  index: 0,
  pageNumber: null,
  stage: null,
  progress: 0,
  results: [],
  errorMessage: null,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Overall progress for `index` (0-based) out of `total` items, at `stage`.
 * Each item is worth `1/total` of the bar, split in half between
 * `converting` (its first half) and `uploading` (its second half);
 * `preparing` (PDF only, before the first item starts) is worth nothing yet,
 * and `item_done` counts the just-finished item's full share.
 */
export function computeProgress(
  total: number,
  index: number,
  stage: UploadTaskStage | 'item_done' | null,
): number {
  if (total <= 0) return 0;
  if (stage === 'preparing') return 0;
  if (stage === 'uploading') return clamp01((index + 0.5) / total);
  if (stage === 'item_done') return clamp01((index + 1) / total);
  // 'converting' or null
  return clamp01(index / total);
}

export type UploadTaskEvent =
  | { type: 'start'; kind: UploadTaskKind; pageNumbers: number[] }
  | { type: 'prepared' }
  | { type: 'converting'; index: number }
  | { type: 'uploading'; index: number }
  | { type: 'item_done'; index: number; result: UploadTaskItemResult }
  | { type: 'error'; index: number; message: string }
  | { type: 'retry' }
  | { type: 'cancel' }
  | { type: 'reset' };

export function uploadTaskReducer(state: UploadTaskState, event: UploadTaskEvent): UploadTaskState {
  switch (event.type) {
    case 'start': {
      const total = event.pageNumbers.length;
      return {
        ...initialUploadTaskState,
        status: 'running',
        kind: event.kind,
        total,
        pageNumbers: event.pageNumbers,
        index: 0,
        pageNumber: event.pageNumbers[0] ?? null,
        stage: event.kind === 'pdf' ? 'preparing' : 'converting',
        progress: computeProgress(total, 0, event.kind === 'pdf' ? 'preparing' : 'converting'),
      };
    }

    case 'prepared': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        stage: 'converting',
        progress: computeProgress(state.total, state.index, 'converting'),
      };
    }

    case 'converting': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        index: event.index,
        pageNumber: state.pageNumbers[event.index] ?? null,
        stage: 'converting',
        progress: computeProgress(state.total, event.index, 'converting'),
        errorMessage: null,
      };
    }

    case 'uploading': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        index: event.index,
        pageNumber: state.pageNumbers[event.index] ?? null,
        stage: 'uploading',
        progress: computeProgress(state.total, event.index, 'uploading'),
        errorMessage: null,
      };
    }

    case 'item_done': {
      if (state.status !== 'running') return state;
      const results = [...state.results, event.result];
      if (results.length >= state.total) {
        return { ...state, results, status: 'done', stage: null, progress: 1, errorMessage: null };
      }
      return { ...state, results, progress: computeProgress(state.total, event.index, 'item_done') };
    }

    case 'error': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        status: 'error',
        index: event.index,
        pageNumber: state.pageNumbers[event.index] ?? null,
        stage: null,
        errorMessage: event.message,
      };
    }

    case 'retry': {
      if (state.status !== 'error') return state;
      return {
        ...state,
        status: 'running',
        stage: 'converting',
        errorMessage: null,
        progress: computeProgress(state.total, state.index, 'converting'),
      };
    }

    case 'cancel': {
      if (state.status !== 'running') return state;
      return { ...state, status: 'cancelled', stage: null };
    }

    case 'reset':
      return { ...initialUploadTaskState };

    default:
      return state;
  }
}

export interface UploadTaskRunDeps<Item> {
  kind: UploadTaskKind;
  items: Item[];
  /** The 1-based page/item number shown for `item` at `index` — e.g. the PDF's own page number. */
  pageNumberFor: (item: Item, index: number) => number;
  convertItem: (item: Item, signal: AbortSignal) => Promise<Blob>;
  uploadBlob: (blob: Blob, signal: AbortSignal) => Promise<UploadTaskItemResult>;
}

export interface UploadTask {
  getState(): UploadTaskState;
  /** Starts a fresh run over `deps.items`, item 0 first. */
  start<Item>(deps: UploadTaskRunDeps<Item>): void;
  /** Resumes at the failed item — a no-op unless the task is in `error`. */
  retry(): void;
  /** Aborts conversion/upload in flight — items already uploaded are kept, see this file's header. */
  cancel(): void;
  /** Back to `idle` — e.g. after the panel is dismissed post-done/cancel. */
  reset(): void;
}

export interface CreateUploadTaskOptions {
  onStateChange: (state: UploadTaskState) => void;
  /** Maps a thrown conversion/upload error to a message — defaults to `err.message ?? 'upload_failed'`. */
  errorMessageFor?: (err: unknown) => string;
}

/** `createAutosaveScheduler`'s own pattern (`autosave.ts`): an options-based factory returning a small imperative API, driven by real async work supplied by the caller. */
export function createUploadTask(options: CreateUploadTaskOptions): UploadTask {
  let state: UploadTaskState = initialUploadTaskState;
  let controller: AbortController | null = null;
  let currentDeps: UploadTaskRunDeps<unknown> | null = null;

  function dispatch(event: UploadTaskEvent): void {
    state = uploadTaskReducer(state, event);
    options.onStateChange(state);
  }

  function messageFor(err: unknown): string {
    if (options.errorMessageFor) return options.errorMessageFor(err);
    return err instanceof Error ? err.message : 'upload_failed';
  }

  async function run(fromIndex: number): Promise<void> {
    const deps = currentDeps;
    if (!deps || !controller) return;
    const signal = controller.signal;

    if (deps.kind === 'pdf' && fromIndex === 0) {
      // Let the "Preparando el PDF…" stage actually paint for a tick before
      // the first page starts converting — a resolved microtask rather than
      // a real timer, so callers (and tests) never need fake timers.
      await Promise.resolve();
      if (signal.aborted) {
        dispatch({ type: 'cancel' });
        return;
      }
      dispatch({ type: 'prepared' });
    }

    for (let i = fromIndex; i < deps.items.length; i++) {
      if (signal.aborted) {
        dispatch({ type: 'cancel' });
        return;
      }
      dispatch({ type: 'converting', index: i });

      let blob: Blob;
      try {
        blob = await deps.convertItem(deps.items[i], signal);
      } catch (err) {
        if (signal.aborted) {
          dispatch({ type: 'cancel' });
          return;
        }
        dispatch({ type: 'error', index: i, message: messageFor(err) });
        return;
      }

      if (signal.aborted) {
        dispatch({ type: 'cancel' });
        return;
      }
      dispatch({ type: 'uploading', index: i });

      let result: UploadTaskItemResult;
      try {
        result = await deps.uploadBlob(blob, signal);
      } catch (err) {
        if (signal.aborted) {
          dispatch({ type: 'cancel' });
          return;
        }
        dispatch({ type: 'error', index: i, message: messageFor(err) });
        return;
      }

      dispatch({ type: 'item_done', index: i, result });
    }
  }

  return {
    getState: () => state,

    start(deps) {
      controller = new AbortController();
      currentDeps = deps as UploadTaskRunDeps<unknown>;
      const pageNumbers = deps.items.map((item, i) => deps.pageNumberFor(item, i));
      dispatch({ type: 'start', kind: deps.kind, pageNumbers });
      void run(0);
    },

    retry() {
      if (state.status !== 'error' || !currentDeps) return;
      if (!controller || controller.signal.aborted) controller = new AbortController();
      const resumeFrom = state.index;
      dispatch({ type: 'retry' });
      void run(resumeFrom);
    },

    cancel() {
      controller?.abort();
    },

    reset() {
      controller = null;
      currentDeps = null;
      dispatch({ type: 'reset' });
    },
  };
}
