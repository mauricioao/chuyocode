/**
 * weatherSymbols — maps a MET Norway Locationforecast 2.0 `symbol_code`
 * (e.g. `"partlycloudy_day"`, `"lightrainshowers_night"`) to the desk hub
 * weather widget's own small, flat icon set ("desktop" redesign PART 4,
 * approved mockup `ChuyoCode_others/propuestas/ingles-escritorio/index.html`'s
 * `.weather` widget) plus an English + Spanish label pair.
 *
 * Pure and zero-I/O: the only thing that reaches MET's live API is
 * `src/pages/api/clima.ts`, which calls {@link mapSymbolCode} on each
 * `symbol_code` it reads out of the response.
 *
 * ONLY FOUR ICONS SHIP (owner spec): `sun`, `partly`, `cloud`, `rain` — MET's
 * own vocabulary has ~30 base codes (each with `_day`/`_night`/
 * `_polartwilight` variants this module strips first, via {@link baseCode}),
 * so every code collapses onto one of the four. Snow/sleet collapse onto
 * `rain` (the closest of the four shapes to "precipitation falling") and fog
 * onto `cloud` — both labelled honestly in English/Spanish rather than
 * mislabelled as plain rain/cloud, so a Lima afternoon never claims it is
 * raining when MET actually reported fog.
 *
 * A code this table has never heard of (a future MET vocabulary addition)
 * falls back to the same shape+label `cloudy` already gets — "cloudy" is the
 * least wrong single guess for an unknown condition, and never throws.
 */

export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'rain';

export interface WeatherSymbol {
  icon: WeatherIcon;
  labelEn: string;
  labelEs: string;
}

/** MET appends one of these to a base code for the literal time of day. */
const DAY_PART_SUFFIX_RE = /_(day|night|polartwilight)$/;

/** `symbol_code` with any `_day`/`_night`/`_polartwilight` suffix stripped. */
function baseCode(symbolCode: string): string {
  return symbolCode.trim().toLowerCase().replace(DAY_PART_SUFFIX_RE, '');
}

const FALLBACK: WeatherSymbol = { icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' };

/**
 * Every MET Locationforecast 2.0 base symbol code this product cares about.
 * Source: https://api.met.no/weatherapi/weathericon/2.0/legends (the
 * compact product's documented `symbol_code` vocabulary).
 */
const TABLE: Record<string, WeatherSymbol> = {
  clearsky: { icon: 'sun', labelEn: 'Clear', labelEs: 'Despejado' },
  fair: { icon: 'sun', labelEn: 'Fair', labelEs: 'Parcialmente despejado' },
  partlycloudy: { icon: 'partly', labelEn: 'Partly cloudy', labelEs: 'Parcialmente nublado' },
  cloudy: { icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' },
  fog: { icon: 'cloud', labelEn: 'Fog', labelEs: 'Niebla' },

  lightrain: { icon: 'rain', labelEn: 'Light rain', labelEs: 'Lluvia ligera' },
  rain: { icon: 'rain', labelEn: 'Rain', labelEs: 'Lluvia' },
  heavyrain: { icon: 'rain', labelEn: 'Heavy rain', labelEs: 'Lluvia intensa' },
  lightrainshowers: { icon: 'rain', labelEn: 'Light rain showers', labelEs: 'Chubascos ligeros' },
  rainshowers: { icon: 'rain', labelEn: 'Rain showers', labelEs: 'Chubascos' },
  heavyrainshowers: { icon: 'rain', labelEn: 'Heavy rain showers', labelEs: 'Chubascos intensos' },
  lightrainandthunder: { icon: 'rain', labelEn: 'Light rain and thunder', labelEs: 'Lluvia ligera con truenos' },
  rainandthunder: { icon: 'rain', labelEn: 'Rain and thunder', labelEs: 'Lluvia con truenos' },
  heavyrainandthunder: { icon: 'rain', labelEn: 'Heavy rain and thunder', labelEs: 'Lluvia intensa con truenos' },
  lightrainshowersandthunder: {
    icon: 'rain',
    labelEn: 'Light rain showers and thunder',
    labelEs: 'Chubascos ligeros con truenos',
  },
  rainshowersandthunder: { icon: 'rain', labelEn: 'Rain showers and thunder', labelEs: 'Chubascos con truenos' },
  heavyrainshowersandthunder: {
    icon: 'rain',
    labelEn: 'Heavy rain showers and thunder',
    labelEs: 'Chubascos intensos con truenos',
  },

  lightsleet: { icon: 'rain', labelEn: 'Light sleet', labelEs: 'Aguanieve ligera' },
  sleet: { icon: 'rain', labelEn: 'Sleet', labelEs: 'Aguanieve' },
  heavysleet: { icon: 'rain', labelEn: 'Heavy sleet', labelEs: 'Aguanieve intensa' },
  lightsleetshowers: { icon: 'rain', labelEn: 'Light sleet showers', labelEs: 'Chubascos de aguanieve ligeros' },
  sleetshowers: { icon: 'rain', labelEn: 'Sleet showers', labelEs: 'Chubascos de aguanieve' },
  heavysleetshowers: { icon: 'rain', labelEn: 'Heavy sleet showers', labelEs: 'Chubascos de aguanieve intensos' },
  lightsleetandthunder: { icon: 'rain', labelEn: 'Light sleet and thunder', labelEs: 'Aguanieve ligera con truenos' },
  sleetandthunder: { icon: 'rain', labelEn: 'Sleet and thunder', labelEs: 'Aguanieve con truenos' },
  heavysleetandthunder: { icon: 'rain', labelEn: 'Heavy sleet and thunder', labelEs: 'Aguanieve intensa con truenos' },

  lightsnow: { icon: 'rain', labelEn: 'Light snow', labelEs: 'Nieve ligera' },
  snow: { icon: 'rain', labelEn: 'Snow', labelEs: 'Nieve' },
  heavysnow: { icon: 'rain', labelEn: 'Heavy snow', labelEs: 'Nieve intensa' },
  lightsnowshowers: { icon: 'rain', labelEn: 'Light snow showers', labelEs: 'Nevadas ligeras' },
  snowshowers: { icon: 'rain', labelEn: 'Snow showers', labelEs: 'Nevadas' },
  heavysnowshowers: { icon: 'rain', labelEn: 'Heavy snow showers', labelEs: 'Nevadas intensas' },
  lightsnowandthunder: { icon: 'rain', labelEn: 'Light snow and thunder', labelEs: 'Nieve ligera con truenos' },
  snowandthunder: { icon: 'rain', labelEn: 'Snow and thunder', labelEs: 'Nieve con truenos' },
  heavysnowandthunder: { icon: 'rain', labelEn: 'Heavy snow and thunder', labelEs: 'Nieve intensa con truenos' },

  rainshowersandthundersleetshowers: {
    icon: 'rain',
    labelEn: 'Rain and sleet showers',
    labelEs: 'Chubascos de lluvia y aguanieve',
  },
};

/** Maps one MET `symbol_code` to this widget's icon + bilingual label. Never throws — an unrecognized code falls back to {@link FALLBACK} ("Cloudy"/"Nublado"). */
export function mapSymbolCode(symbolCode: string): WeatherSymbol {
  if (!symbolCode) return FALLBACK;
  return TABLE[baseCode(symbolCode)] ?? FALLBACK;
}
