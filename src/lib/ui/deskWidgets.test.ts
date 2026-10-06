// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDeskWidgets } from './deskWidgets';

function emptyShellHtml(): string {
  return `
    <div id="desk-clock" aria-hidden="true">
      <span data-clock-city></span>
      <span data-clock-say></span>
      <line data-clock-hh style="visibility: hidden"></line>
      <line data-clock-mm style="visibility: hidden"></line>
      <line data-clock-ss style="visibility: hidden"></line>
    </div>
    <div id="desk-calendar" aria-hidden="true">
      <div data-calendar-day></div>
      <div data-calendar-num></div>
      <table><tbody data-calendar-grid></tbody></table>
    </div>
  `;
}

function setDom(): void {
  document.body.innerHTML = emptyShellHtml();
}

beforeEach(() => {
  setDom();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('initDeskWidgets — first render', () => {
  it('fills the clock hands, city and spoken time, and clears aria-hidden', () => {
    initDeskWidgets(document);
    const clock = document.getElementById('desk-clock') as HTMLElement;

    expect(clock.hasAttribute('aria-hidden')).toBe(false);
    expect(clock.querySelector('[data-clock-say]')?.textContent).toMatch(/^It's /);
    expect((clock.querySelector('[data-clock-hh]') as SVGElement).style.visibility).toBe('visible');
  });

  it('fills the calendar weekday, day number and month grid, and clears aria-hidden', () => {
    initDeskWidgets(document);
    const calendar = document.getElementById('desk-calendar') as HTMLElement;

    expect(calendar.hasAttribute('aria-hidden')).toBe(false);
    expect(calendar.querySelector('[data-calendar-num]')?.textContent).toBe(String(new Date().getDate()));
    expect(calendar.querySelector('[data-calendar-grid]')?.innerHTML).toContain('ingles-calendar-today');
  });

  it('does nothing on a page with neither widget', () => {
    document.body.innerHTML = '<div>no widgets here</div>';
    expect(() => initDeskWidgets(document)).not.toThrow();
  });
});

describe('initDeskWidgets — calendar survives a navigation back to an empty shell', () => {
  // Regression test for the owner-reported bug ("a veces se borró el
  // calendario"): `renderCalendar` used to key its "already rendered today"
  // guard off a MODULE-level variable. Simulating the real failure mode —
  // navigate away (module keeps running), navigate back (a fresh, empty
  // calendar shell replaces the old one) — used to leave the new shell
  // showing only its static weekday-initials header, forever, because the
  // module still remembered today's date key from the FIRST shell.
  it('init, swap in a fresh empty calendar element, init again: it is filled', () => {
    initDeskWidgets(document);
    const firstCalendar = document.getElementById('desk-calendar') as HTMLElement;
    expect(firstCalendar.querySelector('[data-calendar-num]')?.textContent).toBe(String(new Date().getDate()));

    // A same-day ClientRouter navigation back to the hub: a brand-new,
    // server-rendered empty shell (no transition:persist on it).
    setDom();
    const freshCalendar = document.getElementById('desk-calendar') as HTMLElement;
    expect(freshCalendar.querySelector('[data-calendar-num]')?.textContent).toBe('');
    expect(freshCalendar.hasAttribute('aria-hidden')).toBe(true);

    initDeskWidgets(document);

    expect(freshCalendar.hasAttribute('aria-hidden')).toBe(false);
    expect(freshCalendar.querySelector('[data-calendar-num]')?.textContent).toBe(String(new Date().getDate()));
    expect(freshCalendar.querySelector('[data-calendar-day]')?.textContent).toBe(
      new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    );
    // Today's own cell is circled, in the fresh grid — not the old shell's.
    expect(freshCalendar.querySelectorAll('.ingles-calendar-today')).toHaveLength(1);
  });

  it('does not re-render the same element again on the same day (still cheap to tick every second)', () => {
    initDeskWidgets(document);
    const calendar = document.getElementById('desk-calendar') as HTMLElement;
    const grid = calendar.querySelector('[data-calendar-grid]') as HTMLElement;
    const firstGridHtml = grid.innerHTML;

    // A later tick on the SAME element, same day: must not touch the grid
    // again (cheap, and never flashes/rebuilds it every second).
    const replaceSpy = vi.spyOn(grid, 'innerHTML', 'set');
    initDeskWidgets(document);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(grid.innerHTML).toBe(firstGridHtml);
  });
});

describe('initDeskWidgets — one tick interval only', () => {
  it('re-initializing does not stack additional setInterval ticks', async () => {
    vi.useFakeTimers();
    // A FRESH module instance — isolated from the module-level interval id
    // any earlier test in this file may have left running — so the counts
    // below are never coupled to test execution order.
    vi.resetModules();
    const { initDeskWidgets: freshInit } = await import('./deskWidgets');

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    freshInit(document);
    freshInit(document);
    freshInit(document);

    // Three calls started three intervals, but each new call cleared the
    // one before it — exactly one survives.
    expect(setIntervalSpy).toHaveBeenCalledTimes(3);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);

    const sayEl = document.querySelector('[data-clock-say]') as HTMLElement;
    const sayTextSpy = vi.spyOn(sayEl, 'textContent', 'set');

    vi.advanceTimersByTime(1000);

    // A single surviving interval ticks once per second — not three times.
    expect(sayTextSpy).toHaveBeenCalledTimes(1);
  });
});
