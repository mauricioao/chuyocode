import { describe, it, expect } from 'vitest';
import { AD_MIN_WATCH_MS, AD_MIN_WATCH_SECONDS, AD_START_TTL_MS } from './adTiming';

describe('adTiming', () => {
  it('expresses the minimum watch time in milliseconds consistently with seconds', () => {
    expect(AD_MIN_WATCH_MS).toBe(AD_MIN_WATCH_SECONDS * 1000);
  });

  it('gives a visitor materially more time than the minimum watch time before expiring', () => {
    // The start-proof TTL must comfortably outlast the minimum watch time, or
    // a visitor who watches exactly the minimum could never finish in time.
    expect(AD_START_TTL_MS).toBeGreaterThan(AD_MIN_WATCH_MS);
  });
});
