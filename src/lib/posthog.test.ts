/**
 * Tests for PostHog support — see `posthog.ts`'s header for why the key is
 * this feature's one on/off switch, same posture as `webAnalytics.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPosthogConfig, getPosthogHost } from './posthog';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getPosthogConfig', () => {
  it('returns null when PUBLIC_POSTHOG_KEY is unset', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', undefined);
    expect(getPosthogConfig()).toBeNull();
  });

  it('returns null for a blank/whitespace-only key', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', '   ');
    expect(getPosthogConfig()).toBeNull();
  });

  it('defaults the host to the EU region when a key is set but no host is', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', undefined);
    expect(getPosthogConfig()).toEqual({
      key: 'phc_abc123',
      host: 'https://eu.i.posthog.com',
    });
  });

  it('uses the explicit host when both are set', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    expect(getPosthogConfig()).toEqual({
      key: 'phc_abc123',
      host: 'https://us.i.posthog.com',
    });
  });

  it('trims whitespace around both values', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', '  phc_abc123  ');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', '  https://us.i.posthog.com  ');
    expect(getPosthogConfig()).toEqual({
      key: 'phc_abc123',
      host: 'https://us.i.posthog.com',
    });
  });
});

describe('getPosthogHost', () => {
  it('returns null while inert', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', undefined);
    expect(getPosthogHost()).toBeNull();
  });

  it('returns just the host once configured', () => {
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    expect(getPosthogHost()).toBe('https://us.i.posthog.com');
  });
});
