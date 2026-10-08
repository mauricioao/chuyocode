/**
 * deskWindowMessaging — the shared envelope both sides of the embedded-
 * window <-> host-window-manager boundary speak (window-manager
 * architecture, `@lib/deskWindowsState`'s own header).
 *
 * `DESK_WINDOW_EMBEDDED_ATTR` is set on `<html>` by `BaseLayout.astro`
 * whenever a route renders in EMBEDDED mode (`@lib/ui/embeddedWindow`'s own
 * `isEmbeddedWindowRequest`, decided server-side) — `deskWindow.ts`/
 * `deskWindowDrag.ts` read it client-side to pick between their two
 * behaviours: navigate the real page (host mode, and the guest/no-manager
 * fallback), or `postMessage` the host's window manager instead (embedded).
 *
 * Every message carries `source: 'desk-window'` so the host's one shared
 * `message` listener (`deskWindowManager.ts`) can tell a real desk-window
 * message apart from anything else that might ever post to the same window
 * (a browser extension, an unrelated third-party script) before trusting its
 * `type` — same "narrow, explicit shape" posture `isMinimizedWindowEntry`
 * already uses for `sessionStorage` payloads in this codebase. The host
 * additionally checks `event.origin` and `event.source`
 * itself (it knows which `iframe.contentWindow` each message should come
 * from); this module only owns the payload shape.
 */

export const DESK_WINDOW_EMBEDDED_ATTR = 'data-desk-window-embedded';
export const DESK_WINDOW_MESSAGE_SOURCE = 'desk-window' as const;

export type DeskWindowMessage =
  | { type: 'close' }
  | { type: 'minimize' }
  | { type: 'maximize-toggle' }
  | { type: 'open-window'; href: string; title: string | null }
  | { type: 'title'; text: string }
  | { type: 'navigating' }
  | { type: 'ready' };

export type DeskWindowMessageEnvelope = DeskWindowMessage & { source: typeof DESK_WINDOW_MESSAGE_SOURCE };

/** Reads the server-rendered embedded marker off `<html>` — `BaseLayout.astro`'s own `embedded` prop. */
export function isEmbeddedWindowDom(doc: Pick<Document, 'documentElement'>): boolean {
  return doc.documentElement.hasAttribute(DESK_WINDOW_EMBEDDED_ATTR);
}

/**
 * Posts `message` to the parent frame, `try`/`catch`-guarded (same posture
 * as every `sessionStorage` write in this codebase) and a no-op when there
 * is no parent at all (`win.parent === win`, i.e. this page is not actually
 * inside any iframe — defensive; every caller is already gated on
 * {@link isEmbeddedWindowDom} first, this is the second, independent check).
 * `targetOrigin` is always this page's OWN origin: the host and every window
 * route are same-origin by construction (the window manager only ever opens
 * routes on this site), so there is never a legitimate cross-origin parent
 * to message.
 */
export function postDeskWindowMessage(win: Pick<Window, 'parent' | 'location'>, message: DeskWindowMessage): void {
  try {
    const self = win as unknown as Window;
    const parent = win.parent;
    if (!parent || parent === self) return;
    const envelope: DeskWindowMessageEnvelope = { source: DESK_WINDOW_MESSAGE_SOURCE, ...message };
    parent.postMessage(envelope, win.location.origin);
  } catch {
    // Best-effort — a sandboxed or otherwise unusual embedding context just loses this one message.
  }
}

/** Narrow, `MessageEvent`-level validation of the envelope shape — `event.origin`/`event.source` are the host's own job (it knows which frame each message should come from). */
export function isDeskWindowMessageEnvelope(data: unknown): data is DeskWindowMessageEnvelope {
  if (typeof data !== 'object' || data === null) return false;
  const v = data as Record<string, unknown>;
  return v.source === DESK_WINDOW_MESSAGE_SOURCE && typeof v.type === 'string';
}
