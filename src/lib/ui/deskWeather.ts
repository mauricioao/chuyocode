/**
 * deskWeather — DOM wiring for the Inglés desk hub's weather widget
 * ("desktop" redesign PART 4). The server renders a same-size empty shell
 * (`DeskWeatherWidget.astro` — see its own header for why); this module
 * fetches `GET /api/clima` client-side and fills it in, or swaps the whole
 * body for a calm "unavailable" message on any failure.
 *
 * Thin DOM glue only, same split as `deskWidgets.ts`'s own
 * tickClock/renderCalendar vs. `@lib/timeInWords`/`@lib/monthGrid`: the
 * actual MET symbol -> icon mapping is `@lib/weatherSymbols`'s job, called
 * server-side inside `/api/clima` — this module only renders whatever that
 * endpoint already decided.
 */

type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'rain';

interface ClimaDay {
  date: string;
  dowEn: string;
  icon: WeatherIcon;
  tempC: number;
}

interface ClimaResponse {
  city: string;
  now: { tempC: number; icon: WeatherIcon; labelEn: string; labelEs: string };
  days: ClimaDay[];
}

/** Flat icon geometry per condition, copied from the approved mockup's own inline SVGs (`ChuyoCode_others/propuestas/ingles-escritorio/index.html`'s `.weather li svg`) so the rendered look matches exactly. */
const ICON_INNER: Record<WeatherIcon, string> = {
  sun:
    '<circle cx="12" cy="12" r="4.6" fill="#ffb400"/><g stroke="#ffb400" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>',
  partly:
    '<circle cx="9" cy="8.5" r="3.8" fill="#ffb400"/><path d="M8.5 19.5h9a3.3 3.3 0 0 0 .4-6.6 4.6 4.6 0 0 0-8.8-1A3.8 3.8 0 0 0 8.5 19.5z" fill="#a9adb5" stroke="#f4f5f7" stroke-width="1"/>',
  cloud:
    '<path d="M7.5 18.5h9.8a3.7 3.7 0 0 0 .4-7.4 5.2 5.2 0 0 0-10-1.1A4.3 4.3 0 0 0 7.5 18.5z" fill="#a9adb5"/>',
  rain:
    '<path d="M7.5 15h9.8a3.4 3.4 0 0 0 .4-6.8 5 5 0 0 0-9.6-1A3.9 3.9 0 0 0 7.5 15z" fill="#a9adb5"/><path d="M9 18l-.8 2M12.5 18l-.8 2M16 18l-.8 2" stroke="#6aa9e6" stroke-width="1.6" stroke-linecap="round"/>',
};

function iconSvg(icon: WeatherIcon): string {
  const inner = ICON_INNER[icon] ?? ICON_INNER.cloud;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="mx-auto h-[17px] w-[17px]">${inner}</svg>`;
}

function renderNowLine(now: ClimaResponse['now']): string {
  return `${now.labelEn} (${now.labelEs.toLowerCase()}), ${now.tempC}°`;
}

function renderDays(days: ClimaDay[]): string {
  return days
    .map(
      (day) =>
        `<li class="grid justify-items-center gap-[7px]"><span>${day.dowEn}</span>${iconSvg(day.icon)}<b class="text-[10.5px] font-medium text-muted-foreground">${day.tempC}°</b></li>`,
    )
    .join('');
}

function showUnavailable(widget: HTMLElement): void {
  const message = widget.getAttribute('data-weather-unavailable') ?? '';
  widget.setAttribute('aria-busy', 'false');
  widget.textContent = ''; // clear the shell's own children before rendering text-only via a fresh node
  const wrap = widget.ownerDocument.createElement('div');
  wrap.className = 'grid h-full min-h-[70px] place-items-center text-center text-sm text-muted-foreground';
  wrap.textContent = message;
  widget.appendChild(wrap);
}

/** Fetches `/api/clima` for the shell's own `data-weather-*` attributes and fills it in. Safe to call on a page with no weather widget at all. Idempotent-ish: a second call simply re-fetches and re-renders, which the endpoint's own edge cache keeps cheap. */
export async function initDeskWeather(doc: Document = document): Promise<void> {
  const widget = doc.getElementById('desk-weather');
  if (!widget) return;

  const lat = widget.getAttribute('data-weather-lat');
  const lon = widget.getAttribute('data-weather-lon');
  const city = widget.getAttribute('data-weather-city');
  if (!lat || !lon || !city) {
    showUnavailable(widget);
    return;
  }

  try {
    const query = new URLSearchParams({ lat, lon, city });
    const res = await fetch(`/api/clima?${query.toString()}`);
    if (!res.ok) {
      showUnavailable(widget);
      return;
    }
    const data = (await res.json()) as ClimaResponse;

    const nowEl = widget.querySelector('[data-weather-now]');
    if (nowEl) nowEl.textContent = renderNowLine(data.now);

    const daysEl = widget.querySelector('[data-weather-days]');
    if (daysEl) daysEl.innerHTML = renderDays(data.days);

    widget.setAttribute('aria-busy', 'false');
  } catch {
    showUnavailable(widget);
  }
}
