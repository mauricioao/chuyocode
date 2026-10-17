/**
 * Client-side PostHog bootstrap — imported ONLY from the client `<script>`
 * in `src/layouts/BaseLayout.astro`, never from server code (the `posthog-js`
 * package assumes a browser `window`). Inert, by construction, exactly like
 * `getPosthogConfig` says: nothing here runs unless `PUBLIC_POSTHOG_KEY` is
 * set AND the visitor has not asked to be left alone (Do Not Track).
 *
 * Privacy posture (owner decision, minors use this site):
 *  - `person_profiles: 'identified_only'` — an anonymous visitor gets NO
 *    person profile; only `posthog.identify(...)` (not called anywhere in
 *    this codebase yet) would create one.
 *  - `disable_session_recording: true` — no session replay, at all, by
 *    default. The owner decides separately, later, whether to turn it on.
 *  - `mask_all_inputs: true` + `autocapture: { element_allowlist: [...] }`
 *    kept at its default (capture clicks on normal interactive elements)
 *    EXCEPT every `<input>`/`<textarea>`/`<select>` value, which is masked —
 *    satisfies "no autocapture of form inputs" without disabling click/
 *    pageview analytics entirely.
 *  - Do Not Track: `navigator.doNotTrack === '1'` (the one DNT signal every
 *    browser that implements it actually sets) skips `posthog.init`
 *    entirely — posthog-js has no built-in DNT switch, so this is checked
 *    before it is ever imported from the caller.
 */
import posthog from 'posthog-js';
import { getPosthogConfig } from './posthog';

/** True when the visitor's browser has asked sites not to be tracked. */
export function hasDoNotTrack(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator.doNotTrack === '1' || (navigator as { msDoNotTrack?: string }).msDoNotTrack === '1')
  );
}

let initialized = false;

/**
 * Initializes posthog-js once per page load, reading `PUBLIC_POSTHOG_KEY`/
 * `PUBLIC_POSTHOG_HOST` itself (inlined into THIS client bundle at build
 * time, same as `sentry.client.config.ts` reading `PUBLIC_SENTRY_DSN`
 * directly — see that file's header). A no-op while PostHog is inert, Do
 * Not Track is set, or this has already run (Astro's `<ClientRouter>` can
 * re-execute page scripts on client-side navigation; posthog-js's own
 * `init` is not meant to be called twice).
 */
export function initPosthog(): void {
  if (initialized || hasDoNotTrack()) {
    return;
  }
  const config = getPosthogConfig();
  if (!config) {
    return;
  }
  initialized = true;

  posthog.init(config.key, {
    api_host: config.host,
    person_profiles: 'identified_only',
    disable_session_recording: true,
    mask_all_inputs: true,
    capture_pageview: true,
  });
}

/** Test-only: reset the init guard between test cases. */
export function resetPosthogInitGuard(): void {
  initialized = false;
}
