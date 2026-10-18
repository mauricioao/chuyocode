// @vitest-environment jsdom
/**
 * `BaseLayout.astro`'s own duplicated classic `<script is:inline>` click-race
 * interceptor — the EXACT counterpart of
 * `@lib/ui/deskWindow.ts#initDeskOpenWindowLinks`, parsed/run synchronously
 * before any module script so a fast click right after a window loads can
 * never slip past it (see that function's own header, and `BaseLayout.astro`'s
 * own comment right above this script). Both must carry the SAME
 * `closeSelf` logic ("Otra actividad" bugfix, owner report) — the module
 * version has its own full coverage in `deskWindow.test.ts`; this file
 * guards the OTHER copy, which is what a real browser actually runs first.
 *
 * Reads the `.astro` file's raw SOURCE directly off disk — never through
 * Astro's Container API (`astroContainer`), which refuses to render at all
 * once jsdom's `document`/`window` exist ("Astro components cannot be used
 * in the browser"), and this suite needs exactly those globals to execute
 * the extracted script text verbatim, exactly as a browser would. Reading
 * the raw source instead of rendered HTML also means this file imports
 * nothing from `astroContainer`, so `vitestProjectSplit.ts` routes it to the
 * cheap `jsdom` project (not `astro`) — see that module's own header.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `process.cwd()` (never `import.meta.url` — Vite's own transform does not
// always hand that back as a real `file:` URL): same "resolve from the repo
// root" posture `vitestProjectSplit.ts` itself already uses.
const BASE_LAYOUT_SOURCE = readFileSync(join(process.cwd(), 'src/layouts/BaseLayout.astro'), 'utf8');
// A literal CODE token from inside the script body itself, never the
// hyphenated `data-desk-open-window-links-ready` attribute name — that one
// also appears (quoted, in prose) in the doc comment right ABOVE this
// script, which `indexOf` would otherwise land on first, capturing the
// WRONG preceding `<script>` block entirely.
const MARKER = "html.dataset.deskOpenWindowLinksReady = 'true';";

/** Extracts the one `<script is:inline>` block whose source contains `marker`. */
function extractInlineScript(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`marker ${marker} not found in BaseLayout.astro`);
  const start = source.indexOf('>', source.lastIndexOf('<script', markerIndex)) + 1;
  const end = source.indexOf('</script>', markerIndex);
  return source.slice(start, end);
}

const script = extractInlineScript(BASE_LAYOUT_SOURCE, MARKER);

function fakeParent(posted: Array<{ message: unknown; origin: string }>) {
  return { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
}

describe('BaseLayout click-race inline script — carries closeSelf ("Otra actividad" bugfix)', () => {
  // The real script does `document.addEventListener('click', ..., true)`
  // with no `AbortController`/removal of its own (same as the browser would
  // run it once, for the document's whole lifetime) — jsdom's `document` is
  // shared across every test in this file, so a listener a PRIOR test's
  // `runScript()` registered would otherwise still fire on a LATER test's
  // click, exactly the leak `deskWindow.test.ts`'s own `freshDoc()` avoids
  // for the module version. Spying on `addEventListener` for the duration of
  // one test and removing whatever it recorded in `afterEach` gives this
  // raw inline script the same "fresh per test" guarantee without having to
  // rewrite it against an injectable `document`.
  let added: Parameters<typeof document.addEventListener>[];

  beforeEach(() => {
    added = [];
    vi.spyOn(document, 'addEventListener').mockImplementation((...args: Parameters<typeof document.addEventListener>) => {
      added.push(args);
      EventTarget.prototype.addEventListener.apply(document, args);
    });
  });

  /** Runs the EXACT shipped script text, never a re-implementation. */
  function runScript(): void {
    // eslint-disable-next-line no-new-func -- executing the exact shipped script text.
    new Function(script)();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    for (const args of added) EventTarget.prototype.removeEventListener.apply(document, args);
    document.documentElement.removeAttribute('data-desk-window-embedded');
    delete document.documentElement.dataset.deskOpenWindowLinksReady;
    document.body.innerHTML = '';
  });

  it('ships the closeSelf logic (sanity — the fix actually reached this duplicated script)', () => {
    expect(script).toContain('closeSelf');
  });

  it('posts open-window with closeSelf: true for a data-desk-open-window="replace" anchor, preventing navigation', () => {
    document.documentElement.setAttribute('data-desk-window-embedded', '');
    const anchor = document.createElement('a');
    anchor.href = '/es/ingles/actividades?nivel=a1';
    anchor.setAttribute('data-desk-open-window', 'replace');
    anchor.textContent = 'Otra actividad';
    document.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    (window as unknown as { parent: unknown }).parent = fakeParent(posted);

    runScript();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(posted).toEqual([
      {
        message: {
          source: 'desk-window',
          type: 'open-window',
          href: '/es/ingles/actividades?nivel=a1',
          title: 'Otra actividad',
          closeSelf: true,
        },
        origin: window.location.origin,
      },
    ]);
  });

  it('a plain data-desk-open-window (no value) never sets closeSelf', () => {
    document.documentElement.setAttribute('data-desk-window-embedded', '');
    const anchor = document.createElement('a');
    anchor.href = '/es/crear';
    anchor.setAttribute('data-desk-open-window', '');
    document.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    (window as unknown as { parent: unknown }).parent = fakeParent(posted);

    runScript();
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(posted).toHaveLength(1);
    expect(posted[0].message).not.toHaveProperty('closeSelf');
  });

  it('is a no-op outside embedded mode (no data-desk-window-embedded on <html>)', () => {
    const anchor = document.createElement('a');
    anchor.href = '/es/ingles/actividades?nivel=a1';
    anchor.setAttribute('data-desk-open-window', 'replace');
    document.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    (window as unknown as { parent: unknown }).parent = fakeParent(posted);

    runScript();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(posted).toEqual([]);
  });
});
