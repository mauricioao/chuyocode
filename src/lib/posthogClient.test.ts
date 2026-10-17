// @vitest-environment jsdom
/**
 * Tests for the client-side PostHog bootstrap. `posthog-js` itself is
 * mocked — this file asserts ONLY the inert/Do-Not-Track/once-per-load
 * gating and the exact privacy-sensitive init options, never real
 * posthog-js behavior (that is the library's own test suite's job).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import posthog from 'posthog-js';
import { hasDoNotTrack, initPosthog, resetPosthogInitGuard } from './posthogClient';

vi.mock('posthog-js', () => ({
  default: { init: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  resetPosthogInitGuard();
  vi.mocked(posthog.init).mockClear();
  Object.defineProperty(navigator, 'doNotTrack', { value: undefined, configurable: true });
});

describe('hasDoNotTrack', () => {
  it('is false when the browser sends no signal', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: undefined, configurable: true });
    expect(hasDoNotTrack()).toBe(false);
  });

  it('is true when navigator.doNotTrack is "1"', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    expect(hasDoNotTrack()).toBe(true);
  });
});

describe('initPosthog', () => {
  it('does not call posthog.init while PUBLIC_POSTHOG_KEY is unset', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', undefined);
    initPosthog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('does not call posthog.init when Do Not Track is set, even with a key', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    initPosthog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('initializes with the key/host and the privacy-sensitive defaults', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    initPosthog();
    expect(posthog.init).toHaveBeenCalledWith('phc_abc123', {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      disable_session_recording: true,
      session_recording: { maskAllInputs: true },
      capture_pageview: true,
    });
  });

  it('only initializes once per load even if called again', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    initPosthog();
    initPosthog();
    expect(posthog.init).toHaveBeenCalledTimes(1);
  });
});
