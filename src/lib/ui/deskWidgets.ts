/**
 * deskWidgets — DOM wiring for the Inglés desk hub's clock + calendar
 * widgets ("desktop" redesign PART 3). The server renders a same-size empty
 * shell for both (`DeskClockWidget.astro`/`DeskCalendarWidget.astro` — see
 * their own headers for why); this module is what fills them in, entirely
 * client-side, in the visitor's OWN browser timezone, so the server's UTC
 * never shows through as a wrong day or time.
 *
 * Thin DOM glue only — the actual time-in-words and month-grid MATH it
 * calls into live in `@lib/timeInWords`/`@lib/monthGrid`, which are what
 * carry the unit tests. Same split as `backNavigation.ts`'s own
 * `shouldGoBack` (pure, tested) vs. `initBackButtons` (DOM wiring, exercised
 * by hand/e2e instead).
 */
import { timeInWords } from '../timeInWords';
import { buildMonthGrid } from '../monthGrid';

const HAND_ATTRS = ['data-clock-hh', 'data-clock-mm', 'data-clock-ss'] as const;

/** The part of an IANA timezone id after the last `/`, underscores as spaces — `America/Mexico_City` -> `Mexico City`. A zone with no `/` (`UTC`) is returned as-is. */
function cityFromTimeZone(timeZone: string): string {
  const afterSlash = timeZone.includes('/') ? timeZone.slice(timeZone.lastIndexOf('/') + 1) : timeZone;
  return afterSlash.replace(/_/g, ' ');
}

function tickClock(clock: Element): void {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const rotations: Record<(typeof HAND_ATTRS)[number], number> = {
    'data-clock-hh': (hours % 12) * 30 + minutes * 0.5,
    'data-clock-mm': minutes * 6,
    'data-clock-ss': seconds * 6,
  };
  for (const attr of HAND_ATTRS) {
    const line = clock.querySelector(`[${attr}]`);
    if (!line) continue;
    line.setAttribute('transform', `rotate(${rotations[attr]} 60 60)`);
    (line as SVGElement).style.visibility = 'visible';
  }

  const city = cityFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const cityEl = clock.querySelector('[data-clock-city]');
  if (cityEl) cityEl.textContent = city.toUpperCase();

  const sentence = `It's ${timeInWords(hours, minutes)}.`;
  const sayEl = clock.querySelector('[data-clock-say]');
  if (sayEl) sayEl.textContent = sentence;
  clock.setAttribute('aria-label', sentence);
  clock.removeAttribute('aria-hidden');
}

/**
 * Only rebuilds the month grid when the calendar day actually changes (once
 * a day, not once a second) — tracked PER ELEMENT (a data attribute), never
 * at module level.
 *
 * A module-level `lastRenderedDateKey` (the previous shape of this guard) is
 * a real bug once an Astro `ClientRouter` navigation is in play: navigating
 * away from the hub and back swaps in a brand-new, server-rendered EMPTY
 * calendar shell (no `transition:persist` on it), but the module itself
 * keeps running in the same browser tab, so `lastRenderedDateKey` still
 * holds the PREVIOUS visit's date key. The guard above then compares the
 * (unchanged) date key against that stale memory, matches, and returns
 * early — leaving the fresh shell showing only its static `S M T W T F S`
 * header, with no weekday, number or grid ever painted in. Keying off the
 * element's own attribute instead means a brand-new element (no attribute
 * yet) always renders at least once, exactly like a first-ever visit.
 */
const CALENDAR_DATE_KEY_ATTR = 'data-calendar-date-key';

function renderCalendar(calendar: Element, now: Date): void {
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  const dateKey = `${year}-${month}-${day}`;
  if (calendar.getAttribute(CALENDAR_DATE_KEY_ATTR) === dateKey) return;
  calendar.setAttribute(CALENDAR_DATE_KEY_ATTR, dateKey);

  const dayNameEl = calendar.querySelector('[data-calendar-day]');
  if (dayNameEl) dayNameEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long' });

  const numEl = calendar.querySelector('[data-calendar-num]');
  if (numEl) numEl.textContent = String(day);

  const cells = buildMonthGrid(year, month);
  const rowsHtml: string[] = [];
  let rowCells: string[] = [];
  cells.forEach((cell, index) => {
    if (index > 0 && index % 7 === 0) {
      rowsHtml.push(`<tr>${rowCells.join('')}</tr>`);
      rowCells = [];
    }
    if (cell.day === null) {
      rowCells.push('<td></td>');
    } else if (cell.day === day) {
      rowCells.push(`<td><span class="ingles-calendar-today">${cell.day}</span></td>`);
    } else {
      rowCells.push(`<td>${cell.day}</td>`);
    }
  });
  rowsHtml.push(`<tr>${rowCells.join('')}</tr>`);

  const body = calendar.querySelector('[data-calendar-grid]');
  if (body) body.innerHTML = rowsHtml.join('');
  calendar.removeAttribute('aria-hidden');
}

/**
 * The one tick interval this module ever runs, across every call —
 * `index.astro`'s own script calls `initDeskWidgets` both immediately AND
 * on every `astro:page-load` (which also fires for the very first load, see
 * that file's own comment), and each call used to start its OWN
 * `setInterval`, stacking one more tick loop per call forever: every widget
 * on the page would then re-render (and `tickClock`'s DOM writes run) once
 * per STACKED interval per second, each extra one wasted work tied to
 * elements an earlier call queried, not necessarily the ones currently on
 * screen. Clearing the previous interval before starting a new one keeps
 * exactly one alive, always driven by the CURRENT call's own elements.
 */
let tickIntervalId: ReturnType<typeof setInterval> | undefined;

/**
 * Wires both widgets, if present on the page, and starts their one shared
 * 1-second tick (the clock's hands move every second; the calendar only
 * actually re-renders on a day change — see {@link renderCalendar}).
 * Safe to call on a page with neither widget (both lookups are optional),
 * and safe to call more than once (re-reads the DOM fresh each time, same
 * posture as `initDeskDrag`/`initDeskHelper` — see {@link tickIntervalId}
 * for why only one tick loop ever survives a re-init).
 */
export function initDeskWidgets(doc: Document = document): void {
  const clock = doc.getElementById('desk-clock');
  const calendar = doc.getElementById('desk-calendar');
  if (!clock && !calendar) return;

  function tick(): void {
    const now = new Date();
    if (clock) tickClock(clock);
    if (calendar) renderCalendar(calendar, now);
  }

  tick();

  if (tickIntervalId !== undefined) clearInterval(tickIntervalId);
  tickIntervalId = setInterval(tick, 1000);
}
