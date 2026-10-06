import { describe, it, expect } from 'vitest';
import { mapSymbolCode } from './weatherSymbols';

describe('mapSymbolCode', () => {
  it('maps a clear-sky code to the sun icon, day or night variant alike', () => {
    expect(mapSymbolCode('clearsky_day')).toEqual({ icon: 'sun', labelEn: 'Clear', labelEs: 'Despejado' });
    expect(mapSymbolCode('clearsky_night')).toEqual({ icon: 'sun', labelEn: 'Clear', labelEs: 'Despejado' });
    expect(mapSymbolCode('clearsky_polartwilight')).toEqual({ icon: 'sun', labelEn: 'Clear', labelEs: 'Despejado' });
  });

  it('maps partly-cloudy codes to the partly icon', () => {
    expect(mapSymbolCode('partlycloudy_day')).toEqual({
      icon: 'partly',
      labelEn: 'Partly cloudy',
      labelEs: 'Parcialmente nublado',
    });
  });

  it('maps plain cloudy and fog codes to the cloud icon with distinct labels', () => {
    expect(mapSymbolCode('cloudy')).toEqual({ icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' });
    expect(mapSymbolCode('fog')).toEqual({ icon: 'cloud', labelEn: 'Fog', labelEs: 'Niebla' });
  });

  it('maps every rain-family code (showers, thunder) to the rain icon', () => {
    for (const code of ['rain', 'lightrainshowers_day', 'heavyrainshowersandthunder_night', 'rainandthunder']) {
      expect(mapSymbolCode(code).icon).toBe('rain');
    }
  });

  it('maps sleet and snow codes to the rain icon with their own honest label', () => {
    expect(mapSymbolCode('snow_day')).toEqual({ icon: 'rain', labelEn: 'Snow', labelEs: 'Nieve' });
    expect(mapSymbolCode('sleet')).toEqual({ icon: 'rain', labelEn: 'Sleet', labelEs: 'Aguanieve' });
  });

  it('is case-insensitive and tolerant of surrounding whitespace', () => {
    expect(mapSymbolCode(' CLEARSKY_DAY ')).toEqual({ icon: 'sun', labelEn: 'Clear', labelEs: 'Despejado' });
  });

  it('falls back to Cloudy/Nublado for an unrecognized or empty code', () => {
    expect(mapSymbolCode('some_future_code_day')).toEqual({ icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' });
    expect(mapSymbolCode('')).toEqual({ icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' });
  });
});
