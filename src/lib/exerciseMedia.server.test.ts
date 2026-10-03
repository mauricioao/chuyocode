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

import { resetMediaHostsCache, serverAllowedMediaHosts } from './exerciseMedia.server';
import { STATIC_ALLOWED_MEDIA_HOSTS } from './exerciseMedia';

beforeEach(() => {
  resetMediaHostsCache();
});

afterEach(() => {
  resetMediaHostsCache();
});

describe('serverAllowedMediaHosts', () => {
  it('always includes the Sanity media CDN', () => {
    expect(serverAllowedMediaHosts()).toContain('cdn.sanity.io');
  });

  it('includes the Supabase project host derived from SUPABASE_URL', () => {
    expect(serverAllowedMediaHosts()).toContain('abcdefgh.supabase.co');
  });

  it('is exactly the static list plus one derived host', () => {
    expect(serverAllowedMediaHosts()).toEqual([...STATIC_ALLOWED_MEDIA_HOSTS, 'abcdefgh.supabase.co']);
  });

  it('caches the result across calls until reset', () => {
    const first = serverAllowedMediaHosts();
    const second = serverAllowedMediaHosts();
    expect(second).toBe(first);
  });
});

describe('serverAllowedMediaHosts — resilience', () => {
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

    const fresh = await import('./exerciseMedia.server');
    expect(fresh.serverAllowedMediaHosts()).toEqual([...STATIC_ALLOWED_MEDIA_HOSTS]);

    vi.doUnmock('./env');
    vi.resetModules();
  });

  it('falls back to the static list alone when loadEnv itself throws', async () => {
    vi.resetModules();
    vi.doMock('./env', () => ({
      loadEnv: () => {
        throw new Error('missing required environment variable(s)');
      },
    }));

    const fresh = await import('./exerciseMedia.server');
    expect(fresh.serverAllowedMediaHosts()).toEqual([...STATIC_ALLOWED_MEDIA_HOSTS]);

    vi.doUnmock('./env');
    vi.resetModules();
  });
});
