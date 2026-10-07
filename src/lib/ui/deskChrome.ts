/**
 * deskChrome — DOM wiring for the desk-integrated logo/account row
 * ("desktop" redesign, owner spec 2026-10-07: "integrar las opciones del
 * header a nuestro escritorio... prescindir del header normal"). Every desk
 * HOST page (the hub, and every window route's host shell for a signed-in
 * visitor — `BaseLayout.astro`'s own `isDeskHost`) drops the site `<Header>`
 * entirely and renders `DeskChrome.astro`'s row INSIDE the desk instead, so
 * windows/widgets can use the whole screen.
 *
 * `--desk-chrome-offset` is this row's own MEASURED bottom edge (viewport
 * space, since the floating desk window is `position: fixed`) — never a
 * hard-coded header height: `@lib/ui/deskWindowManager.ts`'s own
 * `WRAPPER_CLASS` reads it for a freshly-opened window's default top inset,
 * and `DeskScene.astro` reads it for the desk content's own top padding, so
 * neither one ever visually collides with this row by default. A visitor
 * can still DRAG a window or widget up over the row — that is a drag-time
 * clamp bound (`@lib/deskWindowDragMath`/`@lib/deskDragMath`'s own small
 * edge margin), entirely separate from this default-geometry offset.
 */
export const DESK_CHROME_ROW_SELECTOR = '[data-desk-chrome-row]';
export const DESK_CHROME_OFFSET_VAR = '--desk-chrome-offset';

/** The row's own rendered bottom edge, viewport-relative — `0` when the row is absent (every page except a desk host's). */
export function measureDeskChromeOffset(doc: Document = document): number {
  const row = doc.querySelector<HTMLElement>(DESK_CHROME_ROW_SELECTOR);
  return row ? row.getBoundingClientRect().bottom : 0;
}

const wiredDocs = new WeakSet<Document>();

/**
 * Measures the row once on load, and again on every resize (debounced to one
 * per animation frame — a plain `resize` listener fires far more often than
 * that while a window is actively being dragged to a new size) and
 * `astro:page-load` (View Transitions). Idempotent — safe to call more than
 * once per document, same posture as every other desk script.
 */
export function initDeskChromeOffset(doc: Document = document, win: Window = window): void {
  const html = doc.documentElement;

  function measure(): void {
    const offset = measureDeskChromeOffset(doc);
    if (offset > 0) {
      html.style.setProperty(DESK_CHROME_OFFSET_VAR, `${offset}px`);
    }
  }

  measure();

  if (wiredDocs.has(doc)) return;
  wiredDocs.add(doc);

  let frame: number | null = null;
  win.addEventListener('resize', () => {
    if (frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      measure();
    });
  });

  // A fresh host page load (or a restored one navigated back to) re-measures
  // too — the row's own rendered height never truly changes, but this keeps
  // the no-JS/pre-measure static fallback from ever lingering once JS runs.
  doc.addEventListener('astro:page-load', measure);
}
