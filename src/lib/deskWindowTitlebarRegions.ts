/**
 * deskWindowTitlebarRegions — pure geometry for the desk window title bar's
 * own DRAGGABLE regions (structural fix, owner report: "el arrastre de las
 * ventanas no es suave como el de los widgets, tiembla demasiado").
 *
 * ROOT CAUSE: the title bar drag used to run INSIDE the embedded iframe
 * (pointer capture on the title bar there, posting `screenX`/`screenY`
 * deltas to the host). Synthetic Playwright input showed perfectly
 * monotonic deltas, but with a REAL mouse in Chromium/Brave the coordinates
 * of pointer events inside an iframe that is itself moving under the
 * pointer are unstable — the window visibly shook.
 *
 * FIX: dragging now happens entirely in the HOST document, same as the
 * desk's own widgets (`@lib/ui/deskDrag.ts`). The host measures the title
 * bar's own rect and every interactive control inside it — same-origin
 * direct `iframe.contentDocument` access, the SAME validated pattern this
 * feature already uses elsewhere (`deskWindowManager.ts`'s own
 * `deskWindowCanClose`/`data-window-inactive`) — and renders transparent
 * drag handles over exactly what is LEFT of the title bar once those
 * controls are subtracted out, as children of the frame wrapper (so they
 * move with it). Controls stay clickable/hoverable because no handle ever
 * covers them.
 *
 * {@link subtractRects} is the one pure function this depends on: outer
 * rect minus zero or more exclude rects, via a scanline grid (collect every
 * unique X/Y boundary, mark each resulting cell free/covered, then merge
 * free cells first horizontally then vertically) — correct for ANY
 * arrangement of excludes (a single row, controls wrapped onto two rows,
 * overlapping excludes), not just the common "all excludes on one row"
 * case. Zero-DOM, fully unit-testable on its own.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The DOM selector for every element inside a title bar that must never be covered by a drag handle — traffic lights, buttons, links, inputs, selects, and the editor's portaled editable title `<input>`. Shared with `@lib/ui/deskWindowDrag`'s own (non-embedded) pointerdown guard. */
export const TITLEBAR_IGNORE_SELECTOR = 'button, a, input, textarea, select, [contenteditable="true"]';

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function uniqSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Pure: `outer` minus every rect in `excludes`, as a list of non-overlapping
 * rectangles whose union is exactly `outer \ union(excludes)`. Excludes
 * outside `outer` (or with zero/negative size) are simply ignored; an empty
 * `excludes` list returns `[outer]` unchanged. Returns `[]` when `excludes`
 * fully covers `outer`.
 */
export function subtractRects(outer: Rect, excludes: readonly Rect[]): Rect[] {
  if (outer.width <= 0 || outer.height <= 0) return [];

  const clipped = excludes
    .map((r) => intersect(r, outer))
    .filter((r): r is Rect => r !== null);
  if (clipped.length === 0) return [outer];

  const xs = uniqSorted([outer.x, outer.x + outer.width, ...clipped.flatMap((r) => [r.x, r.x + r.width])]);
  const ys = uniqSorted([outer.y, outer.y + outer.height, ...clipped.flatMap((r) => [r.y, r.y + r.height])]);

  // One row of free/covered cells per Y band, built from each band's own
  // vertical+horizontal CENTER point (never an edge — an edge sits exactly
  // on an exclude's own boundary, which is an ambiguous "is this covered"
  // question a center point never raises).
  const rowSpans: Rect[][] = [];
  for (let ri = 0; ri < ys.length - 1; ri++) {
    const cy = (ys[ri] + ys[ri + 1]) / 2;
    const spans: Rect[] = [];
    let start: number | null = null;
    for (let ci = 0; ci <= xs.length - 1; ci++) {
      const cx = ci < xs.length - 1 ? (xs[ci] + xs[ci + 1]) / 2 : NaN;
      const free = ci < xs.length - 1 && !clipped.some((r) => cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.height);
      if (free && start === null) start = ci;
      if (!free && start !== null) {
        spans.push({ x: xs[start], y: ys[ri], width: xs[ci] - xs[start], height: ys[ri + 1] - ys[ri] });
        start = null;
      }
    }
    rowSpans.push(spans);
  }

  // Merge vertically adjacent rows that share the exact same horizontal span
  // into one taller rect, so a tall exclude-free column does not render as
  // several stacked handles.
  const result: Rect[] = [];
  const consumed: boolean[][] = rowSpans.map((spans) => spans.map(() => false));
  for (let ri = 0; ri < rowSpans.length; ri++) {
    for (let si = 0; si < rowSpans[ri].length; si++) {
      if (consumed[ri][si]) continue;
      let span = rowSpans[ri][si];
      let nextRi = ri + 1;
      while (nextRi < rowSpans.length) {
        const matchIndex = rowSpans[nextRi].findIndex(
          (candidate, idx) => !consumed[nextRi][idx] && candidate.x === span.x && candidate.width === span.width,
        );
        if (matchIndex === -1) break;
        consumed[nextRi][matchIndex] = true;
        span = { ...span, height: span.height + rowSpans[nextRi][matchIndex].height };
        nextRi++;
      }
      result.push(span);
    }
  }
  return result;
}

/** `DOMRect` -> plain {@link Rect} (never a live/readonly `DOMRect` itself, so callers can freely build fixtures in tests). */
export function rectFromDomRect(rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * DOM: the title bar's own draggable regions, in the SAME coordinate space
 * `getBoundingClientRect` already reports inside `doc` — the iframe has no
 * border/padding and exactly overlays the host's own frame wrapper
 * (`deskWindowManager.ts`'s own `WRAPPER_CLASS`/iframe classes), so these
 * rects can be used AS-IS as `position: absolute` boxes inside that wrapper,
 * no coordinate translation needed. Returns `[]` when `doc` has no title bar
 * at all (not yet loaded, a broken/fallback page).
 */
export function measureTitlebarDragRegions(doc: Document | null | undefined): Rect[] {
  const titlebar = doc?.querySelector<HTMLElement>('[data-desk-window-titlebar]');
  if (!titlebar) return [];
  const outer = rectFromDomRect(titlebar.getBoundingClientRect());
  const excludes = [...titlebar.querySelectorAll<HTMLElement>(TITLEBAR_IGNORE_SELECTOR)].map((el) =>
    rectFromDomRect(el.getBoundingClientRect()),
  );
  return subtractRects(outer, excludes);
}
