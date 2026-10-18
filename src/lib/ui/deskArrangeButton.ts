/**
 * deskArrangeButton — wiring for the "Ordenar escritorio"/"Arrange desktop"
 * icon (`#desk-arrange-button`), shared by every component that renders it.
 *
 * The icon used to be wired by an inline script inside `Header.astro` only.
 * Since desk host pages dropped the site header for `DeskChrome.astro`
 * (`cdbc0bb`, "make the logo and account control part of the desk"), the hub
 * renders the button from `DeskChrome` and never ships `Header`'s script, so
 * the icon stayed hidden forever after a drag. Both components now call this
 * one function, so the button behaves the same whichever renders it.
 *
 * Contract with the drag system (`@lib/ui/deskDrag`) is the event pair in
 * `@lib/ui/deskArrange`: it listens for `DESK_ARRANGE_VISIBILITY_EVENT` to
 * show/hide itself and dispatches `DESK_ARRANGE_RESET_EVENT` on click.
 */
import { DESK_DRAG_STORAGE_KEY, parseStoredPositions } from '@lib/deskDragMath';
import { DESK_ARRANGE_VISIBILITY_EVENT, dispatchArrangeReset, type DeskArrangeVisibilityDetail } from './deskArrange';

/** The `desk:` breakpoint — dragging (and so this icon) only exists at and above it. */
const DESK_MEDIA_QUERY = '(min-width: 1100px)';

function isDesktop(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DESK_MEDIA_QUERY).matches;
}

function hasStoredPositions(): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DESK_DRAG_STORAGE_KEY);
  } catch {
    return false;
  }
  return Object.keys(parseStoredPositions(raw)).length > 0;
}

/**
 * Wires `#desk-arrange-button` if the page has one. Safe to call on every
 * `astro:page-load`: a button node already wired (kept by
 * `transition:persist`) is skipped, a freshly swapped-in one is wired.
 */
export function initDeskArrangeButton(doc: Document = document): void {
  const button = doc.getElementById('desk-arrange-button');
  if (!button || button.dataset.wired === 'true') return;
  button.dataset.wired = 'true';

  button.hidden = !(isDesktop() && hasStoredPositions());

  doc.addEventListener(DESK_ARRANGE_VISIBILITY_EVENT, (event) => {
    const { visible } = (event as CustomEvent<DeskArrangeVisibilityDetail>).detail;
    button.hidden = !(isDesktop() && visible);
  });

  button.addEventListener('click', () => {
    dispatchArrangeReset(doc);
    button.hidden = true;
  });
}
