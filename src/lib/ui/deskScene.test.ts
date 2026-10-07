// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { initDeskSceneWidgets } from './deskScene';

afterEach(() => {
  document.body.innerHTML = '';
});

// Regression test for the bug where a DIRECT load of a page that renders the
// desk BEHIND a window (practice/community/create/editor — `deskBehind` on
// `BaseLayout.astro`) showed a clock with no hands and a calendar with no
// dates: `initDeskWidgets` used to be wired only from the hub page's OWN
// script, so a visitor who never visited the hub first (no earlier script
// context in this tab) got an empty shell. `initDeskSceneWidgets` is the one
// call `BaseLayout.astro` now makes on EVERY page — this proves it fills in
// both widgets starting from a completely cold document, exactly the
// direct-load scenario that was broken.
describe('initDeskSceneWidgets — regression: direct load of a desk-behind page', () => {
  it('fills in the clock hands and the calendar dates from a cold document, with no prior script having run', () => {
    document.body.innerHTML = `
      <div id="desk-clock" aria-hidden="true">
        <svg>
          <line data-clock-hh></line>
          <line data-clock-mm></line>
          <line data-clock-ss></line>
        </svg>
        <span data-clock-city></span>
        <span data-clock-say></span>
      </div>
      <div id="desk-calendar" aria-hidden="true">
        <div data-calendar-day></div>
        <div data-calendar-num></div>
        <table><tbody data-calendar-grid></tbody></table>
      </div>
    `;

    initDeskSceneWidgets(document);

    const clock = document.getElementById('desk-clock')!;
    const calendar = document.getElementById('desk-calendar')!;

    // The clock's hands actually got a rotation — not the empty shell.
    expect(clock.hasAttribute('aria-hidden')).toBe(false);
    expect(clock.querySelector('[data-clock-hh]')?.getAttribute('transform')).toMatch(/^rotate\(/);
    expect(clock.querySelector('[data-clock-mm]')?.getAttribute('transform')).toMatch(/^rotate\(/);

    // The calendar actually got today's date and a populated month grid.
    expect(calendar.hasAttribute('aria-hidden')).toBe(false);
    expect(calendar.querySelector('[data-calendar-num]')?.textContent).toBe(String(new Date().getDate()));
    expect(calendar.querySelector('[data-calendar-grid]')?.innerHTML).not.toBe('');
  });

  it('is a safe no-op on a page with no desk at all', () => {
    document.body.innerHTML = '<main>hello</main>';
    expect(() => initDeskSceneWidgets(document)).not.toThrow();
  });
});
