/**
 * deskHelperQueue — the "Otro tip" no-repeat order (owner spec PART 7: "sin
 * repetir hasta que salgan los 100, y ahí se vuelve a mezclar"). A shuffled
 * queue of tip ids, persisted in `sessionStorage` (every access in
 * `try`/`catch`, same posture as `@lib/ui/minimizedWindows`) so a reload
 * mid-session keeps the same unseen order instead of reshuffling on every
 * page load.
 *
 * Split the same way `minimizedWindows.ts` is: pure, zero-DOM list
 * operations ({@link shuffle}, {@link takeNextTipId}) that are fully
 * unit-testable, plus thin Storage-reading/writing wrappers.
 */

export const DESK_HELPER_QUEUE_STORAGE_KEY = 'ingles-desk-helper-tip-queue';

/** Fisher-Yates — `random` is injectable so a test can pin the shuffle instead of stubbing the global `Math.random`. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface TakeNextTipIdOptions {
  /**
   * Excluded ONLY when a fresh shuffle has to be generated (the queue was
   * empty) — the tip already on screen, so clicking "Otro tip" can never
   * immediately re-show it. Ignored once a queue is already running; a tip
   * can reappear next to its own earlier self across a reshuffle boundary
   * exactly once, by design (true "no repeat until all 100 were shown" is
   * about the whole cycle, not about two consecutive views at the seam).
   */
  excludeOnReshuffle?: string | null;
  random?: () => number;
}

/**
 * Pure: pop the next id either off `queue` (if it still has any) or off a
 * fresh shuffle of `allIds` (when `queue` is empty — the end of a cycle, or
 * the very first call). Returns `{ id: null, queue: [] }` for an empty
 * `allIds` instead of throwing.
 */
export function takeNextTipId(
  queue: readonly string[],
  allIds: readonly string[],
  options: TakeNextTipIdOptions = {},
): { id: string | null; queue: string[] } {
  if (allIds.length === 0) return { id: null, queue: [] };

  if (queue.length > 0) {
    const [id, ...rest] = queue;
    return { id, queue: rest };
  }

  const { excludeOnReshuffle, random } = options;
  const pool =
    excludeOnReshuffle != null ? allIds.filter((candidateId) => candidateId !== excludeOnReshuffle) : allIds;
  // If excluding the on-screen tip would empty the pool (a single-tip list),
  // fall back to the unfiltered set rather than getting stuck with no id.
  const shuffled = shuffle(pool.length > 0 ? pool : allIds, random);
  const [id, ...rest] = shuffled;
  return { id, queue: rest };
}

/** Read the queue, `try`/`catch`-guarded. Malformed storage (corrupted JSON, a non-array, non-string entries) degrades to the empty queue — the next "Otro tip" click just reshuffles. */
export function readTipQueue(storage: Pick<Storage, 'getItem'> = sessionStorage): string[] {
  try {
    const raw = storage.getItem(DESK_HELPER_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

/** Persist the queue, `try`/`catch`-guarded. */
export function writeTipQueue(queue: readonly string[], storage: Pick<Storage, 'setItem'> = sessionStorage): void {
  try {
    storage.setItem(DESK_HELPER_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort — a visitor who blocks storage just loses the queue across reloads (every click reshuffles instead).
  }
}
