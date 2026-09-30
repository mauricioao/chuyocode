/**
 * `voicePreferenceStore` — the one remembered choice behind the voice
 * settings popover (`VoiceSettingsButton`): accent (US/UK) and an optional
 * explicit `voiceURI`. Persisted to `localStorage` so it survives reloads,
 * and broadcast to every OTHER mounted `useSpeech`/`VoiceSettingsButton`
 * instance on the page (an in-page `CHANGE_EVENT`) and every OTHER open TAB
 * (the native `storage` event) — "every button updates instantly" without
 * any of them needing to know the others exist.
 *
 * Every `localStorage` access is wrapped in `try/catch`: private browsing,
 * a full quota, or a disabled storage API must never throw through a
 * `speak()` call. Missing or invalid stored data silently resolves to
 * {@link DEFAULT_VOICE_PREFERENCE} (automatic best voice, no explicit pick)
 * rather than surfacing an error to the caller.
 */
import { useSyncExternalStore } from 'react';

export interface VoicePreference {
  accent: 'US' | 'GB';
  /** An explicit remembered voice, or `null` for "pick the best one automatically". */
  voiceURI: string | null;
}

export const DEFAULT_VOICE_PREFERENCE: VoicePreference = { accent: 'US', voiceURI: null };

const STORAGE_KEY = 'chuyocode:speech-voice-preference';
const CHANGE_EVENT = 'chuyocode:speech-voice-preference-change';

function isAccent(value: unknown): value is VoicePreference['accent'] {
  return value === 'US' || value === 'GB';
}

/** Parses a raw (possibly `null`/malformed) stored value into a valid preference — never throws. */
export function parseVoicePreference(raw: string | null): VoicePreference {
  if (!raw) return DEFAULT_VOICE_PREFERENCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_VOICE_PREFERENCE;
    const candidate = parsed as Record<string, unknown>;
    const accent = isAccent(candidate.accent) ? candidate.accent : DEFAULT_VOICE_PREFERENCE.accent;
    const voiceURI = typeof candidate.voiceURI === 'string' && candidate.voiceURI.length > 0 ? candidate.voiceURI : null;
    return { accent, voiceURI };
  } catch {
    return DEFAULT_VOICE_PREFERENCE;
  }
}

// `useSyncExternalStore` requires `getSnapshot` to return a REFERENTIALLY
// STABLE value between calls whose underlying data hasn't changed — parsing
// a fresh object on every call (even to an equal-by-value result) makes
// React see "the snapshot changed" on every render and re-render forever.
// Caching here, keyed on the raw stored string, is what keeps repeated calls
// (React calls `getSnapshot` on every render to check for tearing) cheap AND
// stable, while still noticing a real change the moment the raw value does.
const UNSET = Symbol('unset');
let cachedRaw: string | null | typeof UNSET = UNSET;
let cachedPreference: VoicePreference = DEFAULT_VOICE_PREFERENCE;

/** Current preference, straight from `localStorage` — `DEFAULT_VOICE_PREFERENCE` on SSR, a storage error, or nothing stored yet. */
export function getVoicePreference(): VoicePreference {
  if (typeof window === 'undefined') return DEFAULT_VOICE_PREFERENCE;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPreference = parseVoicePreference(raw);
  }
  return cachedPreference;
}

/** Persists `preference` and notifies every other listener on this page. A no-op (still notifies same-page listeners) if `localStorage` itself throws. */
export function setVoicePreference(preference: VoicePreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Private mode / full quota: this tab's own listeners still update via
    // the in-page event dispatched below; only cross-reload persistence is
    // lost, which is an acceptable degrade rather than a thrown error.
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // No-op: a `CustomEvent`/`dispatchEvent` failure here must not break the
    // caller (e.g. the settings popover saving a selection).
  }
}

/** Subscribes to both cross-tab (`storage`) and same-tab (`CHANGE_EVENT`) changes. Returns the unsubscribe function; a no-op subscription on SSR. */
export function subscribeVoicePreference(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === STORAGE_KEY) onChange();
  }

  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The live preference plus a setter, wired through `useSyncExternalStore` so every mounted instance re-renders the instant any of them calls the setter. */
export function useVoicePreference(): [VoicePreference, (next: VoicePreference) => void] {
  const preference = useSyncExternalStore(subscribeVoicePreference, getVoicePreference, () => DEFAULT_VOICE_PREFERENCE);
  return [preference, setVoicePreference];
}
