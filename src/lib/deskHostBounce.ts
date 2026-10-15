/**
 * deskHostBounce — the page the HUB (`/[lang]/ingles`, the desk host) sends
 * back on the rare request where it is itself asked for in EMBEDDED mode
 * (`?ventana=1` or `Sec-Fetch-Dest: iframe`, `@lib/ui/embeddedWindow`'s own
 * header).
 *
 * BUGFIX (owner report: "Usar en clase" opened a black, frozen presentation,
 * then closing it showed a whole desk nested inside the editor window):
 * `/[lang]/ingles/actividades/[id]/presentar` is a full top-level PAGE, never
 * a window the manager opens (`classifyWindowRoute` returns `null` for it on
 * purpose) — before this fix, the editor's "Usar en clase" link carried
 * `data-desk-window-open` without `target="_top"`, an attribute that only the
 * HOST document's own click-capture listener (`deskWindowManager.ts`) ever
 * reads. While the editor is itself embedded in a window, that listener is
 * on a DIFFERENT document (the host's), so the click just navigated the
 * EDITOR'S OWN iframe to `/presentar` in place — a full-screen presentation
 * trapped inside a small window, with no fullscreen permission and the
 * keyboard focus still on the parent: "black, nothing moves". Closing it then
 * navigated that SAME nested iframe to the hub, and the hub, having no idea
 * it was itself inside a window, rendered its own FULL desk (plus a second
 * window manager) right there: a desk nested inside a desk.
 *
 * `[id].astro`'s own "Presentar"/"Imprimir" links already got the `target=
 * "_top"` half of this fix earlier — see their own comments. This file is
 * the SECOND, root-class half: no matter what ever again links to the hub
 * from inside a window (a stale bookmark, a cached link, a future bug just
 * like this one), the hub itself refuses to render a desk inside a window —
 * it asks the HOST to close this errant window instead
 * (`@lib/ui/deskWindowMessaging#postDeskWindowMessage`'s own `close`
 * contract), or, if there turns out to be no host at all (no parent frame —
 * a direct visit that somehow still carried `Sec-Fetch-Dest: iframe`), sends
 * the real tab to the plain hub itself.
 *
 * Built here rather than inside `index.astro`'s frontmatter — same reasoning
 * `@lib/windowAuthBounce`'s own header gives: a script element inside a
 * frontmatter template-literal string still gets parsed by Vite's dev
 * dependency scanner (it reads `.astro` files as plain HTML), and a failed
 * scan breaks island hydration on a cold start (`src/astroScriptTags.test.ts`'s
 * own guard).
 */
import type { Lang } from '@lib/i18n';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The script's own source, exported so tests can run it against a fake
 * `window`. Speaks the SAME envelope
 * `@lib/ui/deskWindowMessaging#postDeskWindowMessage`/`DeskWindowMessage`
 * does (`source: 'desk-window'`, `type: 'close'`, posted to `window.parent`
 * at this page's own origin) — reimplemented inline rather than imported:
 * this script runs standalone, outside any module bundle, same posture
 * `windowAuthBounceScript` already uses for its own sign-in bounce.
 *
 * EMBEDDED (`window.parent` is a different window — there IS a host):
 * post `close` to it. The desk must never render a second time inside one
 * of its own windows, so there is nothing for this frame to recover into —
 * closing it is the only sane outcome, regardless of how it got here.
 *
 * NOT EMBEDDED (no parent at all): a plain top-level navigation to the real
 * hub, dropping whatever made this request look embedded in the first place
 * (a stale `?ventana=1` on a bookmark, an old `Sec-Fetch-Dest` cached by an
 * intermediary).
 */
export function deskHostBounceScript(hubPath: string): string {
  return `try {
  if (window.parent && window.parent !== window.self) {
    window.parent.postMessage({ source: 'desk-window', type: 'close' }, window.location.origin);
  } else if (window.top) {
    window.top.location.href = new URL(${JSON.stringify(hubPath)}, window.location.origin).toString();
  }
} catch (e) {
  // A sandboxed embedding context leaves the target="_top" link as the way out.
}`;
}

export interface DeskHostBounceLabels {
  title: string;
  continueLabel: string;
}

/** The whole response; `headers` must already carry `Vary` and the private cache policy. */
export function deskHostBounceResponse(lang: Lang, labels: DeskHostBounceLabels, headers: Headers): Response {
  return new Response(deskHostBounceHtml(lang, labels), { status: 200, headers });
}

export function deskHostBounceHtml(lang: Lang, labels: DeskHostBounceLabels): string {
  const hubPath = `/${lang}/ingles`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(labels.title)}</title>
</head>
<body>
<p><a id="desk-host-bounce-continue" href="${hubPath}" target="_top">${escapeHtml(labels.continueLabel)}</a></p>
<script type="module">
${deskHostBounceScript(hubPath)}
</script>
</body>
</html>`;
}
