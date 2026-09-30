/**
 * meCache — per-tab `sessionStorage` cache for `GET /api/me`'s result
 * (navigation-without-flicker PR).
 *
 * `UserMenu` reads this SYNCHRONOUSLY on mount so it can render the correct
 * signed-in/signed-out chrome immediately instead of a loading placeholder
 * on every navigation. The `/api/me` fetch still always runs in the
 * background to revalidate — this is a cache, not a replacement for that
 * round trip.
 *
 * `sessionStorage`, not `localStorage`: signed-in state is tab-scoped by
 * design (matches Supabase's own session cookie posture) and never needs to
 * survive the browser closing.
 *
 * Versioned key (`v1`): bumping it invalidates every previously cached
 * value in one line — the same escape hatch `toolbarPosition.ts`'s shape
 * validation gives `EditorSideToolbar`.
 *
 * Every `sessionStorage` access (even just reaching the object itself) is
 * wrapped in try/catch — a locked-down embed, a full quota, or a browser
 * privacy mode can all throw on read or write, and a cache is never worth
 * crashing the header over.
 */
import type { Profile } from './profile';

const CACHE_KEY = 'chuyocode:me:v1';

/** The cached shape — `profile: null` means "cached signed-out", not "no cache". */
export interface CachedMe {
  profile: Profile | null;
}

function isProfile(value: unknown): value is Profile {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    typeof v.email === 'string' &&
    (v.avatarUrl === null || typeof v.avatarUrl === 'string') &&
    typeof v.initials === 'string' &&
    typeof v.plan === 'string' &&
    typeof v.isModerator === 'boolean' &&
    typeof v.moderationPendingCount === 'number'
  );
}

/** Validate an arbitrary parsed-JSON value into a real {@link CachedMe}, or `undefined` if malformed. */
export function parseCachedMe(raw: unknown): CachedMe | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const { profile } = raw as Record<string, unknown>;
  if (profile === null) return { profile: null };
  if (isProfile(profile)) return { profile };
  return undefined;
}

/** Resolve `sessionStorage`, or `undefined` if it is unreachable (SSR, a throwing accessor, a locked-down embed). */
function getStorage(explicit?: Storage): Storage | undefined {
  if (explicit) return explicit;
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Read the cached `/api/me` result. `undefined` means "no usable cache" — a fresh tab, a storage failure, or corrupt JSON. */
export function readMeCache(storage?: Storage): CachedMe | undefined {
  const store = getStorage(storage);
  if (!store) return undefined;
  try {
    const raw = store.getItem(CACHE_KEY);
    if (raw === null) return undefined;
    return parseCachedMe(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Write the current `/api/me` result to the cache. Silently no-ops on a storage failure. */
export function writeMeCache(value: CachedMe, storage?: Storage): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Ignored — see the file header.
  }
}

/** Clear the cache — sign-in, sign-out, and a 401 on a background refresh all call this. */
export function clearMeCache(storage?: Storage): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.removeItem(CACHE_KEY);
  } catch {
    // Ignored — see the file header.
  }
}
