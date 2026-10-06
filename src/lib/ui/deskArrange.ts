/**
 * deskArrange — the shared event contract between the desk hub header's
 * "Ordenar escritorio"/"Arrange desktop" icon button (`Header.astro`'s own
 * inline script, hub-only) and the desk's drag system (`@lib/ui/deskDrag`).
 *
 * Two independent inline scripts need to talk to each other with no direct
 * reference to one another's internals — a plain `CustomEvent` pair on
 * `document`, per the task's own instruction ("a DOM custom event or a
 * shared module, never a function prop into a `client:*` island"; the
 * header icon is not even an island here, so a prop was never on the
 * table). Kept in its own tiny module so both scripts import the same
 * event-name string constants instead of two independent literals that
 * could silently drift apart.
 */

/** Dispatched BY the header icon on click; the desk's drag system listens and resets every widget to its default grid position. */
export const DESK_ARRANGE_RESET_EVENT = 'desk:arrange-reset';

/** Dispatched BY the desk's drag system whenever whether any widget has a saved (non-default) position changes; the header icon listens and shows/hides itself accordingly. */
export const DESK_ARRANGE_VISIBILITY_EVENT = 'desk:arrange-visibility';

export interface DeskArrangeVisibilityDetail {
  visible: boolean;
}

export function dispatchArrangeReset(target: EventTarget = document): void {
  target.dispatchEvent(new CustomEvent(DESK_ARRANGE_RESET_EVENT));
}

export function dispatchArrangeVisibility(visible: boolean, target: EventTarget = document): void {
  target.dispatchEvent(
    new CustomEvent<DeskArrangeVisibilityDetail>(DESK_ARRANGE_VISIBILITY_EVENT, { detail: { visible } }),
  );
}
