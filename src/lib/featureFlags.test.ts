// @vitest-environment jsdom
/**
 * Tests for the feature-flag helper — every call site must tolerate
 * `window.posthog` being absent (inert/SSR) or not yet loaded (flags not
 * fetched), see `featureFlags.ts`'s own header.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { getFeatureFlag, isFeatureEnabled } from './featureFlags';

afterEach(() => {
  delete (window as unknown as { posthog?: unknown }).posthog;
});

describe('isFeatureEnabled', () => {
  it('returns the default when window.posthog does not exist', () => {
    expect(isFeatureEnabled('new-onboarding', false)).toBe(false);
    expect(isFeatureEnabled('new-onboarding', true)).toBe(true);
  });

  it('returns the default when posthog has no isFeatureEnabled (not yet loaded)', () => {
    (window as unknown as { posthog?: object }).posthog = {};
    expect(isFeatureEnabled('new-onboarding', true)).toBe(true);
  });

  it('returns the real flag value once posthog has loaded it', () => {
    (window as unknown as { posthog?: object }).posthog = {
      isFeatureEnabled: (flag: string) => flag === 'new-onboarding',
    };
    expect(isFeatureEnabled('new-onboarding', false)).toBe(true);
    expect(isFeatureEnabled('other-flag', true)).toBe(false);
  });
});

describe('getFeatureFlag', () => {
  it('returns the default when window.posthog does not exist', () => {
    expect(getFeatureFlag('checkout-variant', 'control')).toBe('control');
  });

  it('returns the real (possibly multivariate) value once loaded', () => {
    (window as unknown as { posthog?: object }).posthog = {
      getFeatureFlag: () => 'variant-b',
    };
    expect(getFeatureFlag('checkout-variant', 'control')).toBe('variant-b');
  });

  it('falls back to the default when the flag resolves to undefined', () => {
    (window as unknown as { posthog?: object }).posthog = {
      getFeatureFlag: () => undefined,
    };
    expect(getFeatureFlag('checkout-variant', 'control')).toBe('control');
  });
});
