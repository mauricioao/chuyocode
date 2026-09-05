import { describe, it, expect } from 'vitest';
import { publicCachePolicy, noStorePolicy } from './cache';

describe('cache policies', () => {
  describe('publicCachePolicy', () => {
    it('should return headers with s-maxage and stale-while-revalidate', () => {
      const headers = publicCachePolicy();
      expect(headers).toHaveProperty('CDN-Cache-Control');
      const val = headers['CDN-Cache-Control'];
      expect(val).toContain('s-maxage');
      expect(val).toContain('stale-while-revalidate');
    });

    it('should have s-maxage >= 1 second', () => {
      const headers = publicCachePolicy();
      const val = headers['CDN-Cache-Control'];
      const match = val.match(/s-maxage=(\d+)/);
      expect(match).toBeTruthy();
      const sMaxAge = parseInt(match![1], 10);
      expect(sMaxAge).toBeGreaterThanOrEqual(1);
    });

    it('should NOT contain private, no-cache, or no-store (Netlify would refuse to cache)', () => {
      const headers = publicCachePolicy();
      const val = headers['CDN-Cache-Control'];
      expect(val).not.toContain('private');
      expect(val).not.toContain('no-cache');
      expect(val).not.toContain('no-store');
    });

    it('should include public to signal cacheable', () => {
      const headers = publicCachePolicy();
      const val = headers['CDN-Cache-Control'];
      expect(val).toContain('public');
    });
  });

  describe('noStorePolicy', () => {
    it('should return headers with no-store directive', () => {
      const headers = noStorePolicy();
      expect(headers).toHaveProperty('CDN-Cache-Control');
      const val = headers['CDN-Cache-Control'];
      expect(val).toContain('no-store');
    });

    it('should be non-storable (cannot be cached)', () => {
      const headers = noStorePolicy();
      const val = headers['CDN-Cache-Control'];
      // no-store means Netlify will NOT cache
      expect(val).toContain('no-store');
    });
  });

  describe('headerFactory', () => {
    it('should produce a plain object of headers for each policy', () => {
      const pub = publicCachePolicy();
      const noStore = noStorePolicy();

      expect(typeof pub).toBe('object');
      expect(typeof noStore).toBe('object');
      expect(pub).not.toBeInstanceOf(Map);
      expect(noStore).not.toBeInstanceOf(Map);
    });
  });
});
