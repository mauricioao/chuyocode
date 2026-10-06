import { describe, expect, it } from 'vitest';
import { buildMonthGrid, daysInMonth, firstWeekdayOfMonth } from './monthGrid';

describe('daysInMonth', () => {
  it('returns 31/30/28 for ordinary months', () => {
    expect(daysInMonth(2026, 0)).toBe(31); // January
    expect(daysInMonth(2026, 3)).toBe(30); // April
    expect(daysInMonth(2026, 1)).toBe(28); // February, non-leap year
  });

  it('returns 29 for February in a leap year', () => {
    expect(daysInMonth(2024, 1)).toBe(29);
  });

  it('honours the century exception (1900 not leap, 2000 leap)', () => {
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });
});

describe('firstWeekdayOfMonth', () => {
  it('matches a known calendar date', () => {
    // 2026-10-01 is a Thursday.
    expect(firstWeekdayOfMonth(2026, 9)).toBe(4);
    // 2026-02-01 is a Sunday.
    expect(firstWeekdayOfMonth(2026, 1)).toBe(0);
  });
});

describe('buildMonthGrid', () => {
  it('pads leading blanks up to the first weekday, then one cell per day', () => {
    const grid = buildMonthGrid(2026, 9); // October 2026, starts on Thursday (4)
    expect(grid.slice(0, 4)).toEqual([{ day: null }, { day: null }, { day: null }, { day: null }]);
    expect(grid[4]).toEqual({ day: 1 });
    expect(grid[grid.length - 1]).toEqual({ day: 31 });
    expect(grid).toHaveLength(4 + 31);
  });

  it('has no leading blanks when the month starts on Sunday', () => {
    const grid = buildMonthGrid(2026, 1); // February 2026, starts on Sunday
    expect(grid[0]).toEqual({ day: 1 });
    expect(grid).toHaveLength(28);
  });

  it('covers a leap-year February fully', () => {
    const grid = buildMonthGrid(2024, 1);
    expect(grid.filter((cell) => cell.day !== null)).toHaveLength(29);
  });
});
