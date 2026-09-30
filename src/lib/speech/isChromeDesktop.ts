/**
 * `isChromeDesktopUA` — pure user-agent sniff for "desktop Chrome",
 * used ONLY to decide whether `useSpeech` needs its `pause()`/`resume()`
 * keep-alive tick (see that file's own header): a long-standing Chrome
 * desktop bug where `speechSynthesis` silently pauses an in-flight
 * utterance after ~15 seconds, specific to that engine — Edge, Chrome on
 * Android, and every other browser tested for this project do not exhibit
 * it, so the workaround stays off everywhere else rather than firing a timer
 * no one needs.
 *
 * Deliberately excludes:
 *  - Edge (`Edg/`) and Opera (`OPR/`), which both ALSO advertise `Chrome/` in
 *    their UA string (shared Chromium engine) but ship their own build.
 *  - Chrome on Android (`Android`) and Chrome on iOS (`CriOS` — iOS Chrome is
 *    a WebKit wrapper, not really Chromium's own speech engine at all).
 *  - Any UA carrying `Mobile`, as a general mobile-Chromium catch-all.
 */
export function isChromeDesktopUA(ua: string): boolean {
  if (!/Chrome\//.test(ua)) return false;
  if (/Edg\//.test(ua)) return false;
  if (/OPR\//.test(ua)) return false;
  if (/CriOS\//.test(ua)) return false;
  if (/Android/.test(ua)) return false;
  if (/Mobile/.test(ua)) return false;
  return true;
}

/** Reads `navigator.userAgent`, `false` wherever `navigator` does not exist (SSR). */
export function isChromeDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isChromeDesktopUA(navigator.userAgent);
}
