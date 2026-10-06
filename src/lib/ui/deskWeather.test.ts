// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { initDeskWeather } from './deskWeather';

function widgetHtml(): string {
  return `
    <div id="desk-weather" data-weather-lat="-12.05" data-weather-lon="-77.04" data-weather-city="Lima" data-weather-unavailable="Weather not available">
      <header><b data-weather-city>Lima</b><span data-weather-now>…</span></header>
      <ol data-weather-days></ol>
    </div>
  `;
}

describe('initDeskWeather', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('does nothing when the widget is absent from the page', async () => {
    document.body.innerHTML = '';
    await expect(initDeskWeather(document)).resolves.toBeUndefined();
  });

  it('fills in the now line and the 7-day list on success', async () => {
    document.body.innerHTML = widgetHtml();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            city: 'Lima',
            now: { tempC: 18, icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' },
            days: [{ date: '2026-10-06', dowEn: 'Tue', icon: 'sun', tempC: 21 }],
          }),
          { status: 200 },
        ),
      ),
    );

    await initDeskWeather(document);

    expect(document.querySelector('[data-weather-now]')?.textContent).toBe('Cloudy (nublado), 18°');
    expect(document.querySelector('[data-weather-days]')?.children.length).toBe(1);
    expect(document.getElementById('desk-weather')?.getAttribute('aria-busy')).toBe('false');
  });

  it('shows the unavailable message when the fetch fails', async () => {
    document.body.innerHTML = widgetHtml();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));

    await initDeskWeather(document);

    const widget = document.getElementById('desk-weather');
    expect(widget?.textContent).toContain('Weather not available');
    expect(widget?.getAttribute('aria-busy')).toBe('false');
  });

  it('shows the unavailable message when the network call throws', async () => {
    document.body.innerHTML = widgetHtml();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await initDeskWeather(document);

    expect(document.getElementById('desk-weather')?.textContent).toContain('Weather not available');
  });
});
