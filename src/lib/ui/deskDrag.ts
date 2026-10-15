/**
 * deskDrag — DOM wiring for the desk hub's draggable widgets ("desktop"
 * redesign PART 4, desktop-only — approved mockup's own `.desk.free`
 * behaviour). Pure math (clamping, persisted-position parsing, keyboard
 * nudging) lives in `@lib/deskDragMath`, unit-tested on its own; this
 * module is the DOM glue around it, same split `deskWidgets.ts` already
 * uses for the clock/calendar.
 *
 * DESKTOP ONLY (`desk:` breakpoint, min-width 1100px): phones keep PART 3's
 * stacked layout — this never runs below that width at all.
 *
 * FIRST ENHANCEMENT: every widget starts as a normal grid item (the
 * `160/160/320` + weather-spanning-row-2 layout `index.astro` renders).
 * This module measures each widget's OWN current box once, switches it to
 * `position: absolute`, and resets `grid-column`/`grid-row` to `auto` on
 * it — a REAL bug the approved mockup's own CSS comment calls out: Chrome
 * keeps placing an absolutely-positioned grid child by the parent grid's
 * line indexes unless that is explicitly reset, which would otherwise
 * visually misplace a widget the instant it is dragged.
 *
 * PERSISTENCE: `localStorage`, keyed by each widget's stable
 * `data-desk-widget` id (never its translated `aria-label` — see
 * `@lib/deskDragMath`'s own header). Every read/write is wrapped in
 * `try/catch` — a private-browsing mode or a full/blocked storage quota
 * must never break the widget itself, only silently skip persistence.
 *
 * KEYBOARD: each widget root is focusable (`tabindex="0"`). Arrow keys move
 * it 16px, Shift+arrow 64px, Escape blurs it (releasing keyboard-nudge
 * focus) — scoped to `event.target === widget` specifically so an arrow
 * key pressed INSIDE a widget's own controls (the player's prev/play/next
 * buttons) never also moves the widget underneath them.
 *
 * HEADER COMMUNICATION: never a function prop — see `@lib/ui/deskArrange`'s
 * own header for the `CustomEvent` contract this module both listens to
 * (`DESK_ARRANGE_RESET_EVENT`, from the header icon) and dispatches
 * (`DESK_ARRANGE_VISIBILITY_EVENT`, to it).
 *
 * RE-INIT ACROSS NAVIGATIONS (same class of bug as `deskWidgets.ts`'s own
 * calendar fix): `index.astro`'s own script calls `initDeskDrag` both
 * immediately AND on every `astro:page-load`, and `document` itself is
 * NEVER replaced by a navigation (unlike the widgets, which re-query a
 * fresh DOM each call). A document-level `DESK_ARRANGE_RESET_EVENT`
 * listener added on every call would therefore stack one more copy per
 * call, forever — a real listener leak, and each stale copy would still
 * try to act on an EARLIER call's now-detached widgets. The reset listener
 * is wired at most ONCE per `doc` (tracked below); it always reads the
 * LATEST call's widgets/positions through {@link stateByDoc}, which every
 * call overwrites, so a reset after a re-init still resets the widgets
 * actually on screen.
 *
 * RE-INIT ON A *PERSISTED* DESK (owner report, "el reloj se coloca encima
 * del logo" — a widget landing too high, overlapping `DeskChrome`, after a
 * window-route visit and back): `DeskScene.astro`'s own `[data-desk]`
 * carries `transition:persist`, so unlike a plain client-rendered page the
 * WIDGETS THEMSELVES are the exact same DOM nodes across a hub -> window
 * (-> hub) navigation, not freshly server-rendered ones. Two re-init bugs
 * follow from that, both only visible on a persisted re-init, never on a
 * fresh load:
 *
 *  1. {@link wireWidget} used to run its full `addEventListener` set again
 *     on every `initDeskDrag` call — on a FRESH widget that is a no-op
 *     survived-by-construction, but on this SAME persisted node it stacked
 *     one more pointerdown/keydown listener per call, forever (the exact
 *     listener-leak class of bug the reset listener above already guards
 *     against, just one level down — per WIDGET instead of per `doc`). A
 *     widget wired twice nudges twice as far per arrow-key press and
 *     double-persists on every drag release. Guarded below by
 *     {@link wiredWidgets}, same `WeakSet` idiom as {@link wiredDocs}; the
 *     listeners themselves call `persist`, which looks up {@link stateByDoc}
 *     AT EVENT TIME rather than closing over one call's own `state` object,
 *     so wiring a widget only once stays correct across every LATER re-init
 *     too (identical reasoning to the reset listener's own "{@link
 *     stateByDoc} is always read at event time, never captured" comment
 *     above).
 *  2. `defaults` (the grid-flow box used to decide a NEVER-dragged widget's
 *     own position) used to be measured from `getBoundingClientRect`
 *     straight off the DOM — correct on a first-ever load (the widget is
 *     still a plain grid item then), but WRONG on any later re-init: the
 *     widget already carries the PREVIOUS call's `position: absolute` with
 *     its own `left`/`top`, so the "default" measured was really just that
 *     earlier call's own output, stale the moment anything about the
 *     desk's layout differed between the two calls (a narrower viewport
 *     mid-navigation from `:root:has([data-desk-window])`'s own
 *     `scrollbar-gutter` switch, `DeskChrome`'s measured
 *     `--desk-chrome-offset` not yet settled, …). `clearPlacement` runs on
 *     every already-absolute widget BEFORE `defaults` is measured below, so
 *     the snapshot always reads the widget's REAL current grid-flow box —
 *     exactly like a first-ever load — regardless of which call this is.
 *
 * STALE ABSOLUTE POSITIONING ACROSS A RESIZE (owner report, "pantalla rota"
 * — widgets piled up on top of each other and the greeting on a phone):
 * this module only ever checked `matchMedia` ONCE, at init. A visitor who
 * loaded the desk at `desk:` width or wider — where every widget gets
 * switched to `position: absolute` with a DESKTOP-computed `left`/`top`,
 * see `placeAbsolute` below — and then resized the SAME page down below the
 * breakpoint with no reload (DevTools responsive-mode, a window resize, a
 * foldable/rotated device) kept those stale desktop pixel coordinates
 * forever: an inline style always wins over the mobile flow-layout classes
 * underneath it, so the widgets stayed absolutely stacked near their old
 * desktop spot instead of returning to the phone's normal 2-column flow.
 * `@lib/ui/deskWindowDrag.ts` already solves the identical problem for the
 * floating window's own drag offset (`win.addEventListener('resize', …)`,
 * clearing it below `desk:`) — the `resize` listener below mirrors that
 * exact pattern for the widgets: below the breakpoint it clears every
 * widget's inline placement (`clearPlacement`, flow layout takes back
 * over); at/above it, it re-runs `placeAbsolute` so a stored/dragged
 * position re-clamps against the new desktop width. Wired at most once per
 * `doc` — same `wiredDocs` guard, same "always read the LATEST state
 * through `stateByDoc`" reasoning as the reset listener right below it.
 */
import {
  clampPosition,
  parseStoredPositions,
  serializePositions,
  nudgePosition,
  isArrowKey,
  DESK_DRAG_STORAGE_KEY,
  WIDGET_TOP_MARGIN_PX,
  type Position,
  type Size,
} from '../deskDragMath';
import { DESK_ARRANGE_RESET_EVENT, dispatchArrangeVisibility } from './deskArrange';

const DESK_SELECTOR = '[data-desk]';
const WIDGET_SELECTOR = '[data-desk-widget]';
const DESK_BREAKPOINT_QUERY = '(min-width: 1100px)';
const DRAGGING_CLASS = 'is-dragging';
const SETTLE_TRANSITION = 'left 0.3s ease, top 0.3s ease';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing, a full/blocked quota, or no storage at all — the
    // widget still drags for this one page view, it just does not persist.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // See safeSet.
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sizeOf(el: HTMLElement): Size {
  const rect = el.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function isDesktop(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DESK_BREAKPOINT_QUERY).matches;
}

/** Undoes every inline style {@link DragState.placeAbsolute} sets, returning the widget to whatever the mobile flow-layout classes already say — see this file's own header, "STALE ABSOLUTE POSITIONING ACROSS A RESIZE". */
function clearPlacement(widget: HTMLElement): void {
  widget.style.position = '';
  widget.style.margin = '';
  widget.style.gridColumn = '';
  widget.style.gridRow = '';
  widget.style.width = '';
  widget.style.left = '';
  widget.style.top = '';
}

/**
 * The current call's own widgets, live persisted positions and how to reset
 * them — see this file's own header ("RE-INIT ACROSS NAVIGATIONS"). A fresh
 * object is created and OVERWRITTEN into {@link stateByDoc} on every
 * `initDeskDrag` call for a given `doc`; `placeAbsolute` closes over this
 * exact object (mutating `positions` in place, never reassigning a separate
 * local variable), and `persist` looks it up through {@link stateByDoc}
 * instead (see "RE-INIT ON A PERSISTED DESK" below) — both end up mutating
 * the SAME `positions` object the reset listener and a later re-init's own
 * handlers already read from.
 */
interface DragState {
  widgets: HTMLElement[];
  positions: Record<string, Position>;
  placeAbsolute: (widget: HTMLElement, id: string) => void;
}

const stateByDoc = new WeakMap<Document, DragState>();
const wiredDocs = new WeakSet<Document>();
/** Widgets whose pointerdown/keydown listeners are already wired — see this file's own header, "RE-INIT ON A PERSISTED DESK", point 1. Keyed by the widget ELEMENT (not `doc`): a persisted widget survives across many `initDeskDrag` calls on the same `doc`, and must be wired only once across all of them. */
const wiredWidgets = new WeakSet<HTMLElement>();

/** Wires drag + keyboard for every `[data-desk-widget]` inside the first `[data-desk]` ancestor, if any — a no-op below the `desk:` breakpoint, on a page with no desk, or with no widgets. Safe to call more than once (re-reads the DOM fresh each time); the hub page's own script calls it once per load/navigation, same as `initDeskWidgets`. */
export function initDeskDrag(doc: Document = document): void {
  if (!isDesktop()) return;

  const desk = doc.querySelector<HTMLElement>(DESK_SELECTOR);
  const widgets = Array.from(doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR));
  if (!desk || widgets.length === 0) return;

  if (!desk.style.position) desk.style.position = 'relative';

  // RE-INIT ON A PERSISTED DESK, point 2 (this file's own header): drop any
  // leftover absolute placement from an EARLIER call on these exact
  // (persisted) nodes before `defaults` is measured just below, so that
  // measurement always reads the widget's real, current grid-flow box
  // instead of replaying a possibly-stale earlier call's own output.
  for (const widget of widgets) {
    if (widget.style.position === 'absolute') clearPlacement(widget);
  }

  // This call's own mutable state — see {@link DragState}'s own header for
  // why `placeAbsolute`/`persist` below read and write `state.positions`
  // instead of a plain local variable. `placeAbsolute` itself is assigned
  // once it is defined, a few lines down.
  const state = {
    widgets,
    positions: parseStoredPositions(safeGet(DESK_DRAG_STORAGE_KEY)),
  } as DragState;

  // Every widget's own grid-flow box, measured in ONE pass BEFORE any of
  // them is touched — switching even the FIRST widget to `position:
  // absolute` removes it from the grid, which reflows every widget that
  // still comes after it (the row/column it vacated collapses). Measuring
  // widget-by-widget, interleaved with placing each one, would read each
  // later widget's box AFTER that reflow already happened — stacking every
  // widget near the same spot instead of their real default positions.
  // This snapshot is also what RESET replays later: once a widget is
  // absolute, its grid-flow box can never be re-measured from the DOM again.
  const defaults = new Map<string, { pos: Position; size: Size }>();
  {
    const deskRect = desk.getBoundingClientRect();
    for (const widget of widgets) {
      const id = widget.getAttribute('data-desk-widget');
      if (!id) continue;
      const rect = widget.getBoundingClientRect();
      defaults.set(id, {
        pos: { x: rect.left - deskRect.left, y: rect.top - deskRect.top },
        size: { w: rect.width, h: rect.height },
      });
    }
  }

  function deskSize(): Size {
    const rect = desk!.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function placeAbsolute(widget: HTMLElement, id: string): void {
    const fallback = defaults.get(id);
    const size = fallback?.size ?? sizeOf(widget);
    const desired = state.positions[id] ?? fallback?.pos ?? { x: 0, y: 0 };
    const clamped = clampPosition(desired, size, deskSize(), WIDGET_TOP_MARGIN_PX);

    widget.style.position = 'absolute';
    widget.style.margin = '0';
    // The Chrome grid-placement bug the file header documents.
    widget.style.gridColumn = 'auto';
    widget.style.gridRow = 'auto';
    widget.style.width = `${size.w}px`;
    widget.style.left = `${clamped.x}px`;
    widget.style.top = `${clamped.y}px`;
  }
  state.placeAbsolute = placeAbsolute;

  // {@link wireWidget}'s own listeners call this, never a plain closure over
  // THIS call's own `state` — see this file's own header, "RE-INIT ON A
  // PERSISTED DESK", point 1: a widget is wired only ONCE across every
  // `initDeskDrag` call on this `doc`, so its listeners must always resolve
  // the LATEST call's own state through {@link stateByDoc} at event time, the
  // same "always read at event time, never captured" idiom the reset
  // listener below already uses.
  function persist(id: string, pos: Position): void {
    const latest = stateByDoc.get(doc);
    if (!latest) return;
    latest.positions = { ...latest.positions, [id]: pos };
    safeSet(DESK_DRAG_STORAGE_KEY, serializePositions(latest.positions));
    dispatchArrangeVisibility(true, doc);
  }

  function wireWidget(widget: HTMLElement): void {
    const id = widget.getAttribute('data-desk-widget')!;
    if (widget.tabIndex < 0) widget.tabIndex = 0;

    widget.addEventListener('pointerdown', (event) => {
      // Controls inside a widget (the player's prev/play/next buttons) never start a drag.
      if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseFloat(widget.style.left || '0');
      const startTop = parseFloat(widget.style.top || '0');
      widget.setPointerCapture(event.pointerId);
      widget.classList.add(DRAGGING_CLASS);

      function move(ev: PointerEvent): void {
        const clamped = clampPosition(
          { x: startLeft + (ev.clientX - startX), y: startTop + (ev.clientY - startY) },
          sizeOf(widget),
          deskSize(),
          WIDGET_TOP_MARGIN_PX,
        );
        widget.style.left = `${clamped.x}px`;
        widget.style.top = `${clamped.y}px`;
      }

      function up(): void {
        widget.classList.remove(DRAGGING_CLASS);
        widget.removeEventListener('pointermove', move);
        widget.removeEventListener('pointerup', up);
        persist(id, {
          x: parseFloat(widget.style.left || '0'),
          y: parseFloat(widget.style.top || '0'),
        });
      }

      widget.addEventListener('pointermove', move);
      widget.addEventListener('pointerup', up, { once: true });
    });

    widget.addEventListener('keydown', (event) => {
      // Scoped to the widget's OWN focus — an arrow key pressed while an
      // inner control (e.g. the player's buttons) has focus must never
      // also move the widget underneath it.
      if (event.target !== widget) return;

      if (event.key === 'Escape') {
        widget.blur();
        return;
      }
      if (!isArrowKey(event.key)) return;

      event.preventDefault();
      const current: Position = {
        x: parseFloat(widget.style.left || '0'),
        y: parseFloat(widget.style.top || '0'),
      };
      const clamped = clampPosition(
        nudgePosition(current, event.key, event.shiftKey),
        sizeOf(widget),
        deskSize(),
        WIDGET_TOP_MARGIN_PX,
      );
      widget.style.left = `${clamped.x}px`;
      widget.style.top = `${clamped.y}px`;
      persist(id, clamped);
    });
  }

  for (const widget of widgets) {
    const id = widget.getAttribute('data-desk-widget');
    if (!id) continue;
    placeAbsolute(widget, id);
    // RE-INIT ON A PERSISTED DESK, point 1 (this file's own header): wired
    // at most once per WIDGET, across every call on this `doc` — `persist`
    // above always resolves the latest call's own state at event time, so a
    // widget wired on an earlier call stays correct on every later one too.
    if (!wiredWidgets.has(widget)) {
      wiredWidgets.add(widget);
      wireWidget(widget);
    }
  }

  dispatchArrangeVisibility(Object.keys(state.positions).length > 0, doc);

  // Overwritten on every call — see this file's own header. The shared
  // reset listener below (wired at most once) always looks this up AT
  // RESET TIME, so it acts on whichever call's widgets/positions are
  // actually current right now, never a stale earlier call's detached ones.
  stateByDoc.set(doc, state);

  if (!wiredDocs.has(doc)) {
    wiredDocs.add(doc);
    doc.addEventListener(DESK_ARRANGE_RESET_EVENT, () => {
      const latest = stateByDoc.get(doc);
      if (!latest) return;

      latest.positions = {};
      safeRemove(DESK_DRAG_STORAGE_KEY);
      const reducedMotion = prefersReducedMotion();

      for (const widget of latest.widgets) {
        const id = widget.getAttribute('data-desk-widget');
        if (!id) continue;
        if (!reducedMotion) {
          widget.style.transition = SETTLE_TRANSITION;
          widget.addEventListener(
            'transitionend',
            () => {
              widget.style.transition = '';
            },
            { once: true },
          );
        }
        latest.placeAbsolute(widget, id);
      }

      dispatchArrangeVisibility(false, doc);
    });

    // STALE ABSOLUTE POSITIONING ACROSS A RESIZE — see this file's own
    // header. Below `desk:`, every widget's inline placement is cleared
    // (back to the mobile flow-layout classes); at/above it, every widget
    // is re-placed so a stored/dragged position re-clamps against the new
    // desktop width — same "always read the LATEST state through
    // `stateByDoc`" reasoning as the reset listener just above.
    window.addEventListener('resize', () => {
      const latest = stateByDoc.get(doc);
      if (!latest) return;

      if (!isDesktop()) {
        for (const widget of latest.widgets) clearPlacement(widget);
        return;
      }
      for (const widget of latest.widgets) {
        const id = widget.getAttribute('data-desk-widget');
        if (id) latest.placeAbsolute(widget, id);
      }
    });
  }
}
