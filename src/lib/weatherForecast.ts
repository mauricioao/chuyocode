/**
 * weatherForecast — turns a MET Norway Locationforecast 2.0 compact
 * response's `properties.timeseries` array into the small shape the desk
 * hub's weather widget actually renders ("desktop" redesign PART 4): "now"
 * (today's current temperature + condition) plus 7 days, one representative
 * temperature + icon per day.
 *
 * Pure and zero-I/O — `src/pages/api/clima.ts` is the only caller, and it
 * does nothing but `fetch` MET, `JSON.parse` the body, and hand the
 * `timeseries` array to {@link buildForecast}. Kept separate from that route
 * specifically so this shaping logic is unit-testable against small,
 * hand-built fixtures instead of only through the live API.
 *
 * REPRESENTATIVE TEMPERATURE CHOICE (documented per the task spec): for each
 * calendar day this picks the entry whose timestamp is closest to 12:00 UTC
 * — a single "typical daytime" reading — rather than that day's max. MET's
 * compact product ships hourly entries for roughly the next 48h and 6-hourly
 * ones beyond that, so "closest to noon" degrades gracefully into whichever
 * entry MET actually has once the series gets sparse, while "max" would need
 * every entry for the day to be fetched (not always true near the end of the
 * 7-day window) to avoid quietly under-reporting the day's heat.
 *
 * DAY GROUPING: by the UTC calendar date of each entry's `time`
 * (`"YYYY-MM-DD"` of an ISO-8601 UTC timestamp) — not the visitor's own
 * timezone. MET's timestamps are UTC; converting to a per-visitor local day
 * would need the visitor's IANA zone threaded all the way from the browser
 * through this server-side builder for a difference that, in practice, only
 * ever shifts a boundary hour's entry into yesterday/tomorrow's bucket.
 */

export interface MetDetails {
  air_temperature?: number;
}

export interface MetSummary {
  symbol_code?: string;
}

export interface MetTimePeriod {
  summary?: MetSummary;
  details?: MetDetails;
}

export interface MetTimeseriesEntry {
  time: string;
  data: {
    instant?: { details?: MetDetails };
    next_1_hours?: MetTimePeriod;
    next_6_hours?: MetTimePeriod;
    next_12_hours?: MetTimePeriod;
  };
}

export interface NowWeather {
  tempC: number;
  icon: 'sun' | 'partly' | 'cloud' | 'rain';
  labelEn: string;
  labelEs: string;
}

export interface DayForecast {
  /** `"YYYY-MM-DD"`, the UTC calendar date this entry represents. */
  date: string;
  /** Three-letter English weekday abbreviation, e.g. `"Tue"`. */
  dowEn: string;
  icon: 'sun' | 'partly' | 'cloud' | 'rain';
  tempC: number;
}

export interface Forecast {
  now: NowWeather;
  days: DayForecast[];
}

import { mapSymbolCode } from './weatherSymbols';

const MAX_DAYS = 7;

/** The first `symbol_code` this entry carries for an upcoming period, trying the shortest (most specific) window first. `undefined` when the entry has none (bare `instant`-only data, e.g. MET's furthest-out entries). */
function symbolCodeOf(entry: MetTimeseriesEntry): string | undefined {
  return (
    entry.data.next_1_hours?.summary?.symbol_code ??
    entry.data.next_6_hours?.summary?.symbol_code ??
    entry.data.next_12_hours?.summary?.symbol_code
  );
}

function tempOf(entry: MetTimeseriesEntry): number | undefined {
  return entry.data.instant?.details?.air_temperature;
}

/** `"YYYY-MM-DD"` out of an ISO-8601 UTC timestamp. */
function utcDateKey(isoTime: string): string {
  return isoTime.slice(0, 10);
}

function hourOf(isoTime: string): number {
  const date = new Date(isoTime);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
}

/** Three-letter English weekday abbreviation for a `"YYYY-MM-DD"` UTC date key. */
function weekdayAbbrev(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/** The entry in `entries` (all sharing one calendar day) closest to 12:00 UTC. */
function closestToNoon(entries: MetTimeseriesEntry[]): MetTimeseriesEntry {
  return entries.reduce((best, entry) =>
    Math.abs(hourOf(entry.time) - 12) < Math.abs(hourOf(best.time) - 12) ? entry : best,
  );
}

/**
 * Builds the widget's `{ now, days }` shape from MET's raw `timeseries`.
 *
 * `timeseries` is assumed already sorted ascending by `time` (what MET's
 * API itself returns) — the very first entry is used as "now". Throws
 * nothing: an entry with no temperature is simply skipped when grouping by
 * day (it cannot contribute a representative reading), and a day left with
 * no usable entry at all is omitted rather than synthesized.
 *
 * @throws {Error} when `timeseries` is empty — there is no "now" to report.
 */
export function buildForecast(timeseries: readonly MetTimeseriesEntry[]): Forecast {
  if (timeseries.length === 0) {
    throw new Error('buildForecast: empty timeseries');
  }

  const nowEntry = timeseries[0];
  const nowTemp = tempOf(nowEntry);
  const nowSymbol = mapSymbolCode(symbolCodeOf(nowEntry) ?? '');
  const now: NowWeather = {
    tempC: Math.round(nowTemp ?? 0),
    icon: nowSymbol.icon,
    labelEn: nowSymbol.labelEn,
    labelEs: nowSymbol.labelEs,
  };

  const byDay = new Map<string, MetTimeseriesEntry[]>();
  for (const entry of timeseries) {
    if (tempOf(entry) === undefined) continue; // no reading to represent this entry with
    const key = utcDateKey(entry.time);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  const days: DayForecast[] = [];
  for (const [dateKey, entries] of byDay) {
    if (days.length >= MAX_DAYS) break;
    const representative = closestToNoon(entries);
    const symbol = mapSymbolCode(symbolCodeOf(representative) ?? '');
    days.push({
      date: dateKey,
      dowEn: weekdayAbbrev(dateKey),
      icon: symbol.icon,
      tempC: Math.round(tempOf(representative)!),
    });
  }

  return { now, days };
}
