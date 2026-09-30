import { afterEach, describe, expect, it, vi } from 'vitest';
import { isChromeDesktop, isChromeDesktopUA } from './isChromeDesktop';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0';
const OPERA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

describe('isChromeDesktopUA', () => {
  it('is true for desktop Chrome on Windows and macOS', () => {
    expect(isChromeDesktopUA(CHROME_WINDOWS)).toBe(true);
    expect(isChromeDesktopUA(CHROME_MAC)).toBe(true);
  });

  it('is false for Edge and Opera, which also advertise Chrome/ in their UA', () => {
    expect(isChromeDesktopUA(EDGE_WINDOWS)).toBe(false);
    expect(isChromeDesktopUA(OPERA_WINDOWS)).toBe(false);
  });

  it('is false for Chrome on Android and iOS', () => {
    expect(isChromeDesktopUA(CHROME_ANDROID)).toBe(false);
    expect(isChromeDesktopUA(CHROME_IOS)).toBe(false);
  });

  it('is false for non-Chrome browsers', () => {
    expect(isChromeDesktopUA(SAFARI_MAC)).toBe(false);
    expect(isChromeDesktopUA(FIREFOX_WINDOWS)).toBe(false);
  });
});

describe('isChromeDesktop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads navigator.userAgent', () => {
    vi.stubGlobal('navigator', { userAgent: CHROME_WINDOWS });
    expect(isChromeDesktop()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: FIREFOX_WINDOWS });
    expect(isChromeDesktop()).toBe(false);
  });

  it('is false when navigator does not exist (SSR)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isChromeDesktop()).toBe(false);
  });
});
