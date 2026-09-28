/**
 * Back-navigation decision + wiring for `BackButton.astro`.
 *
 * Split the same way `exerciseFacets.ts` is: a pure decision function
 * ({@link shouldGoBack}, fully unit-testable, no DOM) and a thin DOM-wiring
 * function ({@link initBackButtons}) that reads `document.referrer` /
 * `window.history` and defers to it. Anything that could silently be WRONG
 * belongs in the function, never in an inline script body nobody can assert
 * on directly.
 *
 * A `BackButton` always renders a real `<a href={parentHref}>` first — it
 * works with scripting disabled, and it is what a middle-click / "open in
 * new tab" honours either way. This only progressively enhances the plain
 * click: when the previous page was same-origin and there IS a previous
 * entry in THIS TAB's history, it intercepts the click and calls
 * `history.back()` instead, which preserves scroll position and feels like
 * "back" rather than a forward navigation to the same content the `href`
 * happens to also point at.
 */

/** The attribute `initBackButtons` delegates clicks from. */
export const BACK_BUTTON_ATTR = 'data-back-button';

/**
 * True when the browser has a same-origin previous page AND at least one
 * earlier entry in this tab's history — the two conditions the task asks
 * for, kept as their own testable function rather than inlined into the
 * click handler.
 *
 * `historyLength <= 1` covers both "no history at all" (a fresh tab) and "no
 * PREVIOUS entry" (this is the first entry `history.back()` could land on
 * would be off the edge of history) — Chromium/Firefox/WebKit all count the
 * current entry itself, so `1` means "nothing before this page".
 */
export function shouldGoBack(
  referrer: string,
  currentOrigin: string,
  historyLength: number,
): boolean {
  if (historyLength <= 1) return false;
  if (!referrer) return false;
  try {
    return new URL(referrer).origin === currentOrigin;
  } catch {
    // A malformed `document.referrer` (some privacy extensions blank it to
    // a non-URL string rather than "") is treated as "no usable referrer" —
    // fail safe to the plain `<a href>` navigation, never throw.
    return false;
  }
}

/**
 * Delegated click listener for every `[data-back-button]` anchor on the
 * page, meant to be bound ONCE for the whole session. `document` (and any
 * listener bound to it) survives Astro's View Transitions swaps, so every
 * page navigated to via the ClientRouter is already covered without a
 * `astro:after-swap` re-init — contrast `reveal.ts`, whose `.revealed` class
 * must be re-applied per swapped node because it mutates specific elements
 * rather than delegating from a stable ancestor.
 */
export function initBackButtons(doc: Document = document, win: Window = window): void {
  doc.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest(`a[${BACK_BUTTON_ATTR}]`);
    if (!link) return;

    if (shouldGoBack(doc.referrer, win.location.origin, win.history.length)) {
      event.preventDefault();
      win.history.back();
    }
  });
}
