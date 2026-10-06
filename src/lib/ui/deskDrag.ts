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

/** Wires drag + keyboard for every `[data-desk-widget]` inside the first `[data-desk]` ancestor, if any — a no-op below the `desk:` breakpoint, on a page with no desk, or with no widgets. Safe to call more than once (re-reads the DOM fresh each time); the hub page's own script calls it once per load/navigation, same as `initDeskWidgets`. */
export function initDeskDrag(doc: Document = document): void {
  if (typeof matchMedia !== 'function' || !matchMedia(DESK_BREAKPOINT_QUERY).matches) return;

  const desk = doc.querySelector<HTMLElement>(DESK_SELECTOR);
  const widgets = Array.from(doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR));
  if (!desk || widgets.length === 0) return;

  if (!desk.style.position) desk.style.position = 'relative';

  let positions = parseStoredPositions(safeGet(DESK_DRAG_STORAGE_KEY));
  const defaults = new Map<string, Position>();

  function deskSize(): Size {
    const rect = desk!.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function placeAbsolute(widget: HTMLElement, id: string): void {
    const deskRect = desk!.getBoundingClientRect();
    if (!defaults.has(id)) {
      const rect = widget.getBoundingClientRect();
      defaults.set(id, { x: rect.left - deskRect.left, y: rect.top - deskRect.top });
    }
    const size = sizeOf(widget);
    const desired = positions[id] ?? defaults.get(id)!;
    const clamped = clampPosition(desired, size, { w: deskRect.width, h: deskRect.height });

    widget.style.position = 'absolute';
    widget.style.margin = '0';
    // The Chrome grid-placement bug the file header documents.
    widget.style.gridColumn = 'auto';
    widget.style.gridRow = 'auto';
    widget.style.width = `${size.w}px`;
    widget.style.left = `${clamped.x}px`;
    widget.style.top = `${clamped.y}px`;
  }

  function persist(id: string, pos: Position): void {
    positions = { ...positions, [id]: pos };
    safeSet(DESK_DRAG_STORAGE_KEY, serializePositions(positions));
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

  dispatchArrangeVisibility(Object.keys(positions).length > 0, doc);

  doc.addEventListener(DESK_ARRANGE_RESET_EVENT, () => {
    positions = {};
    safeRemove(DESK_DRAG_STORAGE_KEY);
    const reducedMotion = prefersReducedMotion();

    for (const widget of widgets) {
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
      placeAbsolute(widget, id);
    }

    dispatchArrangeVisibility(false, doc);
  });
}
