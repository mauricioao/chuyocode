/**
 * deskWindowLights — the ONE source of truth for the desk window's traffic-
 * light colours (UI-kit refactor, approved spec: dedicated macOS-style
 * red/yellow/green, distinct from the general `--color-pop-*` accent set —
 * see `global.css`'s own `--color-traffic-*` tokens).
 *
 * TWO render paths draw a window's lights and must never drift apart:
 *  1. The genuine title bar, server-rendered markup (`DeskWindow.astro`).
 *  2. The host's chrome-less fallback bar, built with `document.createElement`
 *     (`deskWindowManager.ts#buildFallbackBar`) — shown only when a frame's
 *     loaded document is not a real desk window (see that function's own
 *     header).
 *
 * Both import this one constant instead of their own literal class strings,
 * so a future palette edit only ever happens here.
 */
export const DESK_WINDOW_LIGHT_CLASS = {
  close: 'bg-traffic-red',
  minimize: 'bg-traffic-yellow',
  fullscreen: 'bg-traffic-green',
} as const;
