import { describe, expect, it } from 'vitest';
import { isAllowedMediaUrl, mediaHostsFor, STATIC_ALLOWED_MEDIA_HOSTS } from './exerciseMedia';

describe('mediaHostsFor', () => {
  it('is exactly the static list when supabaseUrl is undefined', () => {
    expect(mediaHostsFor(undefined)).toEqual(STATIC_ALLOWED_MEDIA_HOSTS);
  });

  it('adds the Supabase storage host derived from a valid URL', () => {
    expect(mediaHostsFor('https://abcdefgh.supabase.co')).toEqual([
      ...STATIC_ALLOWED_MEDIA_HOSTS,
      'abcdefgh.supabase.co',
    ]);
  });

  it('falls back to the static list alone when supabaseUrl cannot be parsed', () => {
    expect(mediaHostsFor('not-a-url')).toEqual(STATIC_ALLOWED_MEDIA_HOSTS);
  });

  it('falls back to the static list alone for an empty string', () => {
    expect(mediaHostsFor('')).toEqual(STATIC_ALLOWED_MEDIA_HOSTS);
  });
});

describe('isAllowedMediaUrl — default hosts (static list only, the client behavior)', () => {
  it('accepts an https Sanity CDN URL', () => {
    expect(isAllowedMediaUrl('https://cdn.sanity.io/images/proj/production/cat.png')).toBe(true);
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

  it('rejects a Supabase storage URL when no extra host is passed', () => {
    expect(
      isAllowedMediaUrl('https://abcdefgh.supabase.co/storage/v1/object/public/media/cat.png'),
    ).toBe(false);
  });
});

describe('isAllowedMediaUrl — explicit hosts (the server behavior)', () => {
  it('accepts a host present only in the explicit list', () => {
    expect(
      isAllowedMediaUrl('https://abcdefgh.supabase.co/cat.png', ['abcdefgh.supabase.co']),
    ).toBe(true);
  });

  it('still rejects http on an explicitly allowed host', () => {
    expect(
      isAllowedMediaUrl('http://abcdefgh.supabase.co/cat.png', ['abcdefgh.supabase.co']),
    ).toBe(false);
  });

  it('still rejects a host absent from the explicit list', () => {
    expect(
      isAllowedMediaUrl('https://evil.example/cat.png', ['abcdefgh.supabase.co']),
    ).toBe(false);
  });
});
