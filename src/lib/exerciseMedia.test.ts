import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://abcdefgh.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import {
  allowedMediaHosts,
  isAllowedMediaUrl,
  resetMediaHostsCache,
  STATIC_ALLOWED_MEDIA_HOSTS,
} from './exerciseMedia';

beforeEach(() => {
  resetMediaHostsCache();
});

afterEach(() => {
  resetMediaHostsCache();
});

describe('allowedMediaHosts', () => {
  it('always includes the Sanity media CDN', () => {
    expect(allowedMediaHosts()).toContain('cdn.sanity.io');
  });

  it('includes the Supabase project host derived from SUPABASE_URL', () => {
    expect(allowedMediaHosts()).toContain('abcdefgh.supabase.co');
  });

  it('is exactly the static list plus one derived host', () => {
    expect(allowedMediaHosts()).toEqual([...STATIC_ALLOWED_MEDIA_HOSTS, 'abcdefgh.supabase.co']);
  });
});

describe('isAllowedMediaUrl', () => {
  it('accepts an https Sanity CDN URL', () => {
    expect(isAllowedMediaUrl('https://cdn.sanity.io/images/proj/production/cat.png')).toBe(true);
  });

  it('accepts an https Supabase storage URL', () => {
    expect(
      isAllowedMediaUrl('https://abcdefgh.supabase.co/storage/v1/object/public/media/cat.png'),
    ).toBe(true);
  });

  it('rejects http, even on an allow-listed host', () => {
    expect(isAllowedMediaUrl('http://cdn.sanity.io/images/proj/production/cat.png')).toBe(false);
  });

  it('rejects a javascript: URL', () => {
    expect(isAllowedMediaUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a data: URL', () => {
    expect(isAllowedMediaUrl('data:image/png;base64,aaaa')).toBe(false);
  });

  it('rejects an https URL on a host that is not allow-listed', () => {
    expect(isAllowedMediaUrl('https://evil.example/cat.png')).toBe(false);
  });

  it('rejects a string that is not a URL at all', () => {
    expect(isAllowedMediaUrl('not a url')).toBe(false);
  });
});

describe('allowedMediaHosts — resilience', () => {
  it('falls back to the static list alone when SUPABASE_URL cannot be parsed', async () => {
    vi.resetModules();
    vi.doMock('./env', () => ({
      loadEnv: () => ({
        SANITY_PROJECT_ID: 'proj',
        SANITY_DATASET: 'production',
        SUPABASE_URL: 'not-a-url',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: '',
        AD_HMAC_SECRET: '',
      }),
    }));

    const fresh = await import('./exerciseMedia');
    expect(fresh.allowedMediaHosts()).toEqual([...fresh.STATIC_ALLOWED_MEDIA_HOSTS]);

    vi.doUnmock('./env');
    vi.resetModules();
  });
});
