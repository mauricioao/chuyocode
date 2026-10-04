/**
 * `chuyocode:placement:v1` — the ONE thing the placement-test draft persists:
 * the learner's last result, on THIS DEVICE only. No answers, no per-item
 * detail, nothing sent to the server — the whole test runs client-side
 * (`PlacementIsland.tsx`) and this is purely a "welcome back" convenience
 * (show the last estimate, offer a retake).
 *
 * Every `localStorage` access is wrapped in try/catch: private browsing, a
 * full quota, or a disabled storage API must never throw through the quiz —
 * same posture as `@/lib/speech/voicePreferenceStore.ts`. Read it only from a
 * mount `useEffect`, never a `useState` initializer or during render (that
 * caused React #418 hydration mismatches in this repo before).
 */
import type { PlacementLevel } from '@/content/placement/items';

export const STORAGE_KEY = 'chuyocode:placement:v1';

export interface StoredPlacementResult {
  version: 1;
  estimatedLevel: PlacementLevel | null;
  recommendedLevel: PlacementLevel;
  /** ISO timestamp of when the test was taken. */
  takenAt: string;
}

const PLACEMENT_LEVELS = new Set<string>(['A1', 'A2', 'B1', 'B2']);

function isPlacementLevel(value: unknown): value is PlacementLevel {
  return typeof value === 'string' && PLACEMENT_LEVELS.has(value);
}

/** Parses a raw (possibly `null`/malformed) stored value into a result — never throws. `null` for anything invalid. */
export function parseStoredPlacementResult(raw: string | null): StoredPlacementResult | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== 1) return null;
    if (candidate.estimatedLevel !== null && !isPlacementLevel(candidate.estimatedLevel)) return null;
    if (!isPlacementLevel(candidate.recommendedLevel)) return null;
    if (typeof candidate.takenAt !== 'string' || candidate.takenAt.length === 0) return null;

    return {
      version: 1,
      estimatedLevel: candidate.estimatedLevel,
      recommendedLevel: candidate.recommendedLevel,
      takenAt: candidate.takenAt,
    };
  } catch {
    return null;
  }
}

/** Current stored result, straight from `localStorage` — `null` on SSR, a storage error, nothing stored, or malformed data. */
export function readStoredPlacementResult(): StoredPlacementResult | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStoredPlacementResult(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persists `result`. A silent no-op if `localStorage` itself throws (private mode / full quota). */
export function writeStoredPlacementResult(result: StoredPlacementResult): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // Private window / blocked storage: the result still shows for this
    // session: only cross-reload persistence is lost.
  }
}
