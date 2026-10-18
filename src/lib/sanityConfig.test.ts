import { describe, it, expect } from 'vitest';
import {
  resolveSanityFixtureHost,
  sanityClientConfig,
  sanityImageBuilderConfig,
} from './sanityConfig';

const BASE = { SANITY_PROJECT_ID: 'proj', SANITY_DATASET: 'production' };

describe('resolveSanityFixtureHost', () => {
  it('is off by default (unset, empty or blank)', () => {
    expect(resolveSanityFixtureHost(undefined)).toBeNull();
    expect(resolveSanityFixtureHost('')).toBeNull();
    expect(resolveSanityFixtureHost('   ')).toBeNull();
  });

  it('accepts a loopback http origin and normalizes it to the bare origin', () => {
    expect(resolveSanityFixtureHost('http://127.0.0.1:4335')).toBe('http://127.0.0.1:4335');
    expect(resolveSanityFixtureHost('http://localhost:4335/')).toBe('http://localhost:4335');
    expect(resolveSanityFixtureHost('http://[::1]:4335')).toBe('http://[::1]:4335');
  });

  it('ignores any non-loopback host, so a stray value can never redirect production content', () => {
    expect(resolveSanityFixtureHost('https://api.sanity.io')).toBeNull();
    expect(resolveSanityFixtureHost('https://evil.example.com')).toBeNull();
    expect(resolveSanityFixtureHost('http://127.0.0.1.evil.example.com')).toBeNull();
    expect(resolveSanityFixtureHost('http://10.0.0.5:4335')).toBeNull();
  });

  it('ignores values that are not http(s) URLs', () => {
    expect(resolveSanityFixtureHost('127.0.0.1:4335')).toBeNull();
    expect(resolveSanityFixtureHost('file:///etc/passwd')).toBeNull();
    expect(resolveSanityFixtureHost('not a url')).toBeNull();
  });
});

describe('sanityClientConfig', () => {
  it('is exactly the pre-existing production config when the fixture host is unset', () => {
    expect(sanityClientConfig(BASE)).toStrictEqual({
      projectId: 'proj',
      dataset: 'production',
      apiVersion: '2024-01-01',
      useCdn: true,
    });
    expect(sanityClientConfig({ ...BASE, SANITY_FIXTURE_API_HOST: '' })).toStrictEqual(
      sanityClientConfig(BASE),
    );
  });

  it('stays on the production config when the fixture host is not loopback', () => {
    expect(
      sanityClientConfig({ ...BASE, SANITY_FIXTURE_API_HOST: 'https://evil.example.com' }),
    ).toStrictEqual(sanityClientConfig(BASE));
  });

  it('points the client at the loopback fixture host, without the CDN or a project subdomain', () => {
    expect(
      sanityClientConfig({ ...BASE, SANITY_FIXTURE_API_HOST: 'http://127.0.0.1:4335' }),
    ).toStrictEqual({
      projectId: 'proj',
      dataset: 'production',
      apiVersion: '2024-01-01',
      useCdn: false,
      apiHost: 'http://127.0.0.1:4335',
      useProjectHostname: false,
    });
  });
});

describe('sanityImageBuilderConfig', () => {
  it('is exactly the pre-existing builder config when the fixture host is unset', () => {
    expect(sanityImageBuilderConfig(BASE)).toStrictEqual({
      projectId: 'proj',
      dataset: 'production',
    });
  });

  it('serves image URLs from the loopback fixture host when set', () => {
    expect(
      sanityImageBuilderConfig({ ...BASE, SANITY_FIXTURE_API_HOST: 'http://localhost:4335' }),
    ).toStrictEqual({
      projectId: 'proj',
      dataset: 'production',
      baseUrl: 'http://localhost:4335',
    });
  });
});
