/**
 * Unit tests for the shared per-browser dedup cookie (src/lib/dedupCookie.ts).
 *
 * Pure functions, no mocks. The cases that matter are the parsing ones: this
 * module decides whether an action gets counted, so a false positive silently
 * loses real counts and a false negative lets one browser count forever.
 */
import { describe, it, expect } from 'vitest';
import {
  DEDUP_WINDOW_MS,
  dedupCookie,
  dedupCookieName,
  hasDedupCookie,
} from './dedupCookie';

describe('DEDUP_WINDOW_MS', () => {
  it('is 24 hours', () => {
    expect(DEDUP_WINDOW_MS).toBe(86_400_000);
  });
});

describe('dedupCookieName', () => {
  it('puts the key in the name so counted things never share a cookie', () => {
    expect(dedupCookieName('chu_like_', 'abc')).toBe('chu_like_abc');
    expect(dedupCookieName('chu_dl_', 'el-libro')).toBe('chu_dl_el-libro');
  });
});

describe('hasDedupCookie', () => {
  it('finds the cookie among others, whatever the spacing', () => {
    expect(hasDedupCookie('chu_like_abc=1', 'chu_like_abc')).toBe(true);
    expect(hasDedupCookie('a=1; chu_like_abc=1; b=2', 'chu_like_abc')).toBe(true);
    expect(hasDedupCookie('a=1;chu_like_abc=1', 'chu_like_abc')).toBe(true);
  });

  it('is false when the header is absent or empty', () => {
    expect(hasDedupCookie(null, 'chu_like_abc')).toBe(false);
    expect(hasDedupCookie(undefined, 'chu_like_abc')).toBe(false);
    expect(hasDedupCookie('', 'chu_like_abc')).toBe(false);
  });

  it('does not match a DIFFERENT key that shares the prefix', () => {
    // The regression this exists for: a substring match would make liking one
    // exercise silently suppress the like on every other one.
    expect(hasDedupCookie('chu_like_abcdef=1', 'chu_like_abc')).toBe(false);
    expect(hasDedupCookie('xchu_like_abc=1', 'chu_like_abc')).toBe(false);
  });

  it('reads the name up to the FIRST "=", so a padded value cannot shift it', () => {
    // A base64 value ends in `=`; splitting on every `=` would misread the name
    // of the pair that follows it and report a cookie that is not there.
    expect(hasDedupCookie('token=YWJj==; chu_like_abc=1', 'chu_like_abc')).toBe(
      true,
    );
    expect(hasDedupCookie('token=YWJj==', 'YWJj')).toBe(false);
  });

  it('ignores malformed segments with no "=" at all', () => {
    expect(hasDedupCookie('broken; chu_like_abc=1', 'chu_like_abc')).toBe(true);
    expect(hasDedupCookie('broken', 'broken')).toBe(false);
  });
});

describe('dedupCookie', () => {
  it('arms a 24h HttpOnly, SameSite=Lax, site-wide cookie', () => {
    const value = dedupCookie('chu_like_abc', { secure: false });
    expect(value).toContain('chu_like_abc=1');
    expect(value).toContain('Max-Age=86400');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Lax');
    expect(value).toContain('Path=/');
  });

  it('omits Secure unless asked, so localhost does not drop it', () => {
    expect(dedupCookie('chu_like_abc', { secure: false })).not.toContain('Secure');
    expect(dedupCookie('chu_like_abc', { secure: true })).toContain('Secure');
  });

  it('round-trips: what it sets is what hasDedupCookie recognizes', () => {
    // The two halves of the contract, checked against each other rather than
    // against a hand-written literal that could drift from the setter.
    const name = dedupCookieName('chu_like_', 'abc');
    const header = dedupCookie(name, { secure: true }).split(';')[0];
    expect(hasDedupCookie(header, name)).toBe(true);
  });
});
