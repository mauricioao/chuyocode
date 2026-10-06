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
 */
import {
  clampPosition,
  parseStoredPositions,
  serializePositions,
  nudgePosition,
  isArrowKey,
  DESK_DRAG_STORAGE_KEY,
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

/**
 * The current call's own widgets, live persisted positions and how to reset
 * them — see this file's own header ("RE-INIT ACROSS NAVIGATIONS"). A fresh
 * object is created and OVERWRITTEN into {@link stateByDoc} on every
 * `initDeskDrag` call for a given `doc`; `placeAbsolute`/`persist` close
 * over this exact object (mutating `positions` in place, never reassigning
 * a separate local variable), so the one shared reset listener — looked up
 * at reset time, never captured in its own closure — mutates the SAME
 * `positions` the current call's drag/keyboard handlers already read from.
 */
interface DragState {
  widgets: HTMLElement[];
  positions: Record<string, Position>;
  placeAbsolute: (widget: HTMLElement, id: string) => void;
}

const stateByDoc = new WeakMap<Document, DragState>();
const wiredDocs = new WeakSet<Document>();

/** Wires drag + keyboard for every `[data-desk-widget]` inside the first `[data-desk]` ancestor, if any — a no-op below the `desk:` breakpoint, on a page with no desk, or with no widgets. Safe to call more than once (re-reads the DOM fresh each time); the hub page's own script calls it once per load/navigation, same as `initDeskWidgets`. */
export function initDeskDrag(doc: Document = document): void {
  if (typeof matchMedia !== 'function' || !matchMedia(DESK_BREAKPOINT_QUERY).matches) return;

  const desk = doc.querySelector<HTMLElement>(DESK_SELECTOR);
  const widgets = Array.from(doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR));
  if (!desk || widgets.length === 0) return;

  if (!desk.style.position) desk.style.position = 'relative';

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
    const clamped = clampPosition(desired, size, deskSize());

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

  function persist(id: string, pos: Position): void {
    state.positions = { ...state.positions, [id]: pos };
    safeSet(DESK_DRAG_STORAGE_KEY, serializePositions(state.positions));
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
      const clamped = clampPosition(nudgePosition(current, event.key, event.shiftKey), sizeOf(widget), deskSize());
      widget.style.left = `${clamped.x}px`;
      widget.style.top = `${clamped.y}px`;
      persist(id, clamped);
    });
  }

  for (const widget of widgets) {
    const id = widget.getAttribute('data-desk-widget');
    if (!id) continue;
    placeAbsolute(widget, id);
    wireWidget(widget);
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
  }
}
