/**
 * initDeskSceneWidgets — the ONE call that wires every Inglés "desk" widget
 * (clock, calendar, weather) plus its drag-to-rearrange, site-wide.
 *
 * BUGFIX (owner report, 2026-10-07): these used to be wired only from the
 * hub page's OWN inline script (`[lang]/ingles/index.astro`) — a direct
 * load of a page that renders the SAME desk BEHIND a window
 * (`deskBehind` on `BaseLayout.astro`: the practice, community, create and
 * editor pages) has no earlier hub visit's script context to lean on, so
 * the clock rendered with no hands and the calendar with no dates.
 * `BaseLayout.astro`'s own script (which runs on EVERY page, not just the
 * hub) now calls this one function directly instead, so a desk behind any
 * window is wired exactly like the hub's own desk, cold load or not.
 *
 * Each of the three calls below already self-guards (a no-op
 * `getElementById`/`querySelector` miss) on a page with no desk at all, so
 * this is safe to call unconditionally, from every page.
 */
import { initDeskWidgets } from './deskWidgets';
import { initDeskWeather } from './deskWeather';
import { initDeskDrag } from './deskDrag';

export function initDeskSceneWidgets(doc: Document = document): void {
  initDeskWidgets(doc);
  void initDeskWeather(doc);
  initDeskDrag(doc);
}
