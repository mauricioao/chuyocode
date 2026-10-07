/**
 * The page a desk window's iframe receives when its session expired while it
 * was open (`/auth/entrar` requested with `Sec-Fetch-Dest: iframe`): instead
 * of cramming the sign-in form into a window, it sends the whole tab to the
 * sign-in page, with `next` pointing back at the desk the window sat on.
 *
 * Built here rather than inside `entrar.astro`'s frontmatter: Vite's dev
 * dependency scanner reads `.astro` files as HTML, so a script element in a
 * frontmatter string gets parsed — `${...}` placeholders included — and the
 * failed scan breaks island hydration in dev (`astroScriptTags.test.ts`).
 */
import type { Lang } from '@lib/i18n';

export interface WindowAuthBounceLabels {
  title: string;
  redirecting: string;
  continueLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The script's own source, exported so tests can run it against a fake
 * `window`. `next` is the host page's own path + query — `safeNextPath` only
 * accepts same-site paths, and `URLSearchParams` encodes it exactly once.
 */
export function windowAuthBounceScript(signInPath: string): string {
  return `try {
  if (window.top && window.top !== window.self) {
    const url = new URL(${JSON.stringify(signInPath)}, window.location.origin);
    url.searchParams.set('next', window.top.location.pathname + window.top.location.search);
    window.top.location.href = url.toString();
  }
} catch (e) {
  // A sandboxed embedding context leaves the target="_top" link as the way out.
}`;
}

/** The whole response; `headers` must already carry `Vary` and the private cache policy. */
export function windowAuthBounceResponse(lang: Lang, labels: WindowAuthBounceLabels, headers: Headers): Response {
  return new Response(windowAuthBounceHtml(lang, labels), { status: 200, headers });
}

export function windowAuthBounceHtml(lang: Lang, labels: WindowAuthBounceLabels): string {
  const signInPath = `/${lang}/auth/entrar`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(labels.title)}</title>
</head>
<body style="font-family: system-ui, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; text-align: center; padding: 24px;">
<p>
  ${escapeHtml(labels.redirecting)}
  <br />
  <a id="desk-window-auth-continue" href="${signInPath}" target="_top">${escapeHtml(labels.continueLabel)}</a>
</p>
<script type="module">
${windowAuthBounceScript(signInPath)}
</script>
</body>
</html>`;
}
