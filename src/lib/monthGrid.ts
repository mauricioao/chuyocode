/**
 * monthGrid — pure calendar-grid math for the desk hub's iOS-style calendar
 * widget ("desktop" redesign PART 3, `DeskCalendarWidget.astro`): which
 * weekday a month starts on, how many days it has (leap years included —
 * delegated to `Date`, which already implements the Gregorian leap-year
 * rule correctly, century exceptions included), and a flat, Sunday-first
 * list of grid cells (leading blanks + day numbers) a 7-column `<table>` can
 * render directly without its own date arithmetic.
 *
 * Zero I/O: every function takes a plain `(year, month)` pair (`month` is
 * 0-indexed, matching `Date`) rather than reading the system clock itself —
 * the widget's own client-side script is what resolves "now" in the
 * visitor's browser timezone and passes it in here.
 */

/** One grid cell: `day` is `null` for a leading blank (before the 1st). */
export interface MonthGridCell {
  day: number | null;
}

/** How many days `month` (0-indexed) has in `year`, leap years included. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the FOLLOWING month is the last day of this one — `Date`
  // normalizes a 0th day back into the previous month for us.
  return new Date(year, month + 1, 0).getDate();
}

/** The weekday (0 = Sunday .. 6 = Saturday) the 1st of `month` falls on. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/**
 * The full Sunday-first grid for `month`: `firstWeekdayOfMonth` leading
 * blank cells, then one cell per day of the month. Exactly as many cells as
 * `firstWeekdayOfMonth(...) + daysInMonth(...)` — no trailing padding, since
 * the caller renders rows of 7 and the last row is simply shorter.
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
  const leading = firstWeekdayOfMonth(year, month);
  const total = daysInMonth(year, month);

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < leading; i++) {
    cells.push({ day: null });
  }
  for (let day = 1; day <= total; day++) {
    cells.push({ day });
  }
  return cells;
}
