/**
 * Tests for Cloudflare Web Analytics support — see `webAnalytics.ts`'s
 * header for why the token is this feature's one on/off switch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWebAnalyticsBeaconPayload, getWebAnalyticsToken } from './webAnalytics';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getWebAnalyticsToken', () => {
  it('returns null when the variable is unset', () => {
    vi.stubEnv('PUBLIC_CF_WEB_ANALYTICS_TOKEN', undefined);
    expect(getWebAnalyticsToken()).toBeNull();
  });

  it('returns null for a blank/whitespace-only value', () => {
    vi.stubEnv('PUBLIC_CF_WEB_ANALYTICS_TOKEN', '   ');
    expect(getWebAnalyticsToken()).toBeNull();
  });

  it('returns the trimmed token when set', () => {
    vi.stubEnv('PUBLIC_CF_WEB_ANALYTICS_TOKEN', '  abc123def456  ');
    expect(getWebAnalyticsToken()).toBe('abc123def456');
  });
});

describe('getWebAnalyticsBeaconPayload', () => {
  it('returns null when no token is configured', () => {
    vi.stubEnv('PUBLIC_CF_WEB_ANALYTICS_TOKEN', undefined);
    expect(getWebAnalyticsBeaconPayload()).toBeNull();
  });

  it('returns the exact JSON shape Cloudflare documents, with no extra whitespace', () => {
    vi.stubEnv('PUBLIC_CF_WEB_ANALYTICS_TOKEN', 'abc123def456');
    expect(getWebAnalyticsBeaconPayload()).toBe('{"token":"abc123def456"}');
  });

  it('JSON-escapes a token containing a quote or backslash', () => {
    const token = 'ab"c\\d';
    vi.stubEnv('PUBLIC_CF_WEB_ANALYTICS_TOKEN', token);
    const payload = getWebAnalyticsBeaconPayload();
    expect(JSON.parse(payload as string)).toEqual({ token });
  });
});
