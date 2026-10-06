import { describe, it, expect } from 'vitest';
import { buildForecast, type MetTimeseriesEntry } from './weatherForecast';

function hourly(time: string, tempC: number, symbolCode?: string): MetTimeseriesEntry {
  return {
    time,
    data: {
      instant: { details: { air_temperature: tempC } },
      ...(symbolCode ? { next_1_hours: { summary: { symbol_code: symbolCode } } } : {}),
    },
  };
}

describe('buildForecast', () => {
  it('throws on an empty timeseries — there is no "now" to report', () => {
    expect(() => buildForecast([])).toThrow();
  });

  it('reports "now" from the very first entry', () => {
    const forecast = buildForecast([
      hourly('2026-10-06T15:00:00Z', 18.4, 'cloudy'),
      hourly('2026-10-06T16:00:00Z', 19.0, 'clearsky_day'),
    ]);
    expect(forecast.now).toEqual({ tempC: 18, icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' });
  });

  it('falls back from next_1_hours to next_6_hours, then next_12_hours, for the symbol', () => {
    const entry: MetTimeseriesEntry = {
      time: '2026-10-06T15:00:00Z',
      data: {
        instant: { details: { air_temperature: 20 } },
        next_6_hours: { summary: { symbol_code: 'rain' } },
      },
    };
    expect(buildForecast([entry]).now.icon).toBe('rain');
  });

  it('groups entries by UTC calendar day and picks the one closest to 12:00 UTC as representative', () => {
    const forecast = buildForecast([
      hourly('2026-10-06T06:00:00Z', 14, 'cloudy'), // day 1, far from noon
      hourly('2026-10-06T12:00:00Z', 21, 'clearsky_day'), // day 1, exactly noon -> representative
      hourly('2026-10-06T20:00:00Z', 16, 'cloudy'), // day 1, far from noon
      hourly('2026-10-07T11:00:00Z', 19, 'rain'), // day 2, closest to noon
      hourly('2026-10-07T23:00:00Z', 15, 'cloudy'), // day 2
    ]);
    expect(forecast.days).toEqual([
      { date: '2026-10-06', dowEn: 'Tue', icon: 'sun', tempC: 21 },
      { date: '2026-10-07', dowEn: 'Wed', icon: 'rain', tempC: 19 },
    ]);
  });

  it('caps at 7 days even when the timeseries spans more', () => {
    const entries: MetTimeseriesEntry[] = [];
    for (let day = 1; day <= 10; day += 1) {
      const dd = String(day).padStart(2, '0');
      entries.push(hourly(`2026-10-${dd}T12:00:00Z`, 18, 'cloudy'));
    }
    expect(buildForecast(entries).days).toHaveLength(7);
  });

  it('skips an entry with no temperature reading when choosing a day representative', () => {
    const noTemp: MetTimeseriesEntry = { time: '2026-10-06T12:00:00Z', data: { next_1_hours: { summary: { symbol_code: 'rain' } } } };
    const withTemp = hourly('2026-10-06T06:00:00Z', 17, 'cloudy');
    const forecast = buildForecast([noTemp, withTemp]);
    expect(forecast.days).toEqual([{ date: '2026-10-06', dowEn: 'Tue', icon: 'cloud', tempC: 17 }]);
  });
});
