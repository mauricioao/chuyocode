/**
 * Tiny feature-flag helper over PostHog (`src/lib/posthog.ts`,
 * `src/lib/posthogClient.ts`). Client-side only — PostHog itself is never
 * loaded server-side (see `posthogClient.ts`'s own header) — so every call
 * site must tolerate `window.posthog` not existing yet (flags have not
 * loaded) or not existing at all (PostHog is inert or this ran during SSR).
 *
 * Returning `defaultValue` in every one of those cases is the point: a
 * feature flag must never crash, flicker to a wrong state, or block
 * rendering while PostHog is unconfigured, loading, or simply absent from
 * the server-rendered pass.
 */

/** Minimal shape of the global `posthog-js` client this file actually uses. */
interface PosthogGlobal {
  isFeatureEnabled?: (flag: string) => boolean | undefined;
  getFeatureFlag?: (flag: string) => boolean | string | undefined;
}

function getGlobalPosthog(): PosthogGlobal | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as unknown as { posthog?: PosthogGlobal }).posthog;
}

/**
 * Is boolean flag `flag` enabled? Returns `defaultValue` while PostHog is
 * inert, not yet loaded, or the flag itself is unset/unknown.
 */
export function isFeatureEnabled(flag: string, defaultValue: boolean): boolean {
  const client = getGlobalPosthog();
  const result = client?.isFeatureEnabled?.(flag);
  return typeof result === 'boolean' ? result : defaultValue;
}

/**
 * The value of a (possibly multivariate) flag, or `defaultValue` under the
 * same unloaded/inert/unknown conditions as {@link isFeatureEnabled}.
 */
export function getFeatureFlag<T extends boolean | string>(flag: string, defaultValue: T): T {
  const client = getGlobalPosthog();
  const result = client?.getFeatureFlag?.(flag);
  return (result ?? defaultValue) as T;
}
