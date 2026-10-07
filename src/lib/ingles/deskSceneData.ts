/**
 * Shared data loader for the Inglés "desk" ("desktop" redesign, approved
 * mockup `ChuyoCode_others/propuestas/ingles-escritorio/index.html`).
 *
 * PART 6a (owner spec 2026-10-06, "la dirección cambia por detrás, pero vos
 * nunca salís del escritorio"): the practice page now renders the SAME desk
 * behind its window as the hub (`/[lang]/ingles/index.astro`) does on its
 * own — a direct visit (QR code, shared link, new tab) must show a real
 * desk, not a blank one, since there is no earlier page whose `transition:
 * persist`-ed DOM it could otherwise reuse. Extracted from `index.astro`'s
 * own frontmatter (where every field below used to be computed inline) so
 * both pages load it exactly the same way, with one round trip each — never
 * two different implementations silently drifting apart.
 *
 * Every field here is presentation-ready (already localized, already
 * formatted) — `DeskScene.astro` only ever renders what it is given, same
 * "page decides, component renders" split as every other Inglés page.
 */
import type { User } from '@supabase/supabase-js';
import { UI_LABELS, type Lang } from '@lib/i18n';
import { getExerciseCount } from '@lib/exercises';
import { getActivityCount, getPublishedActivities } from '@lib/activities/activities';
import { pickDailyActivity } from '@lib/activities/dailyPick';
import { publicImageUrl } from '@lib/activities/storage';
import { nameFrom } from '@lib/profile';

/** Netlify's own request geo shape (`Astro.locals.netlify?.context?.geo`) — only the three fields this module reads. */
export interface DeskSceneGeo {
  latitude?: number;
  longitude?: number;
  city?: string;
}

export interface DeskScenePlayerLabels {
  title: string;
  prev: string;
  next: string;
  play: string;
  pause: string;
  unavailable: string;
}

/** `DeskScene.astro`'s own `labels` prop shape — the strings it needs that are NOT already part of {@link DeskSceneData} (those come from `loadDeskSceneData` itself). */
export interface DeskSceneLabels {
  greetingQuestion: string;
  greetingSubtitle: string;
  foldersLabel: string;
  proposedTitle: string;
  communityTitle: string;
  todayTitle: string;
  createActivityLabel: string;
  widgetsLabel: string;
  weatherUnavailable: string;
  /** The weather widget's own MET Norway credit ("Datos: MET Norway"). */
  weatherAttribution: string;
  levelShortcutTitle: string;
  /** Minimized-windows tray (owner feedback 2026-10-06): the tray `<nav>`'s own accessible name, and the accessible name of each chip's "×" button. */
  trayLabel: string;
  trayRemoveLabel: string;
  /** Polish pass 2026-10-06: the "+N" overflow tile's accessible name/tooltip template — `{n}` is filled with the overflow count. */
  trayMoreLabel: string;
}

export interface DeskSceneData {
  /** First name only, already extracted from `nameFrom` — `null` for an anonymous visitor. */
  firstName: string | null;
  greetingLine1: string;
  exerciseCountLabel: string | null;
  activityCountLabel: string | null;
  dailyPickHref: string;
  dailyPickMeta: string | null;
  dailyPickPeek: string | null;
  weatherLat: number;
  weatherLon: number;
  weatherCity: string;
  weatherLabel: string;
  playerLabels: DeskScenePlayerLabels;
}

/** Netlify's own request geo when present; Lima otherwise — see `index.astro`'s original header for why this is also exactly what local `astro dev` always gets. */
const LIMA_FALLBACK = { lat: -12.0464, lon: -77.0428, city: 'Lima' };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "12 ejercicios" / "1 ejercicio", or `null` when the count degraded (never "0 …"). */
function formatCount(count: number | null, one: string, many: string): string | null {
  if (count === null) return null;
  return `${count} ${count === 1 ? one : many}`;
}

export async function loadDeskSceneData(opts: {
  lang: Lang;
  user: User | null;
  geo: DeskSceneGeo | undefined;
}): Promise<DeskSceneData> {
  const { lang, user, geo } = opts;
  const t = UI_LABELS[lang].english.hub;

  const hasGeoCoords = typeof geo?.latitude === 'number' && typeof geo?.longitude === 'number';
  const weatherLat = hasGeoCoords ? round2(geo!.latitude!) : LIMA_FALLBACK.lat;
  const weatherLon = hasGeoCoords ? round2(geo!.longitude!) : LIMA_FALLBACK.lon;
  const weatherCity = geo?.city?.trim() || LIMA_FALLBACK.city;
  const weatherLabel = t.weatherLabel.replace('{city}', weatherCity);

  const playerLabels: DeskScenePlayerLabels = {
    title: t.playerTitle,
    prev: t.playerPrev,
    next: t.playerNext,
    play: t.playerPlay,
    pause: t.playerPause,
    unavailable: t.playerUnavailable,
  };

  // Two cheap counts plus the top-hearted pool `pickDailyActivity` picks
  // from, in parallel — same shape as `index.astro`'s original query.
  const [exerciseCount, activityCount, heartedPool] = await Promise.all([
    getExerciseCount(),
    getActivityCount(),
    getPublishedActivities({ level: null, page: 1, orden: 'gustadas', viewerId: user?.id ?? null }),
  ]);

  const exerciseCountLabel = formatCount(exerciseCount, t.exerciseCountOne, t.exerciseCountMany);
  const activityCountLabel = formatCount(activityCount, t.activityCountOne, t.activityCountMany);

  const dailyPick = pickDailyActivity(heartedPool.activities, new Date());
  const dailyPickHref = dailyPick
    ? `/${lang}/ingles/actividades/${dailyPick.id}`
    : `/${lang}/ingles/actividades`;
  const dailyPickMeta = dailyPick?.title ?? null;
  const dailyPickPeek = dailyPick?.thumbnailPath ? publicImageUrl(dailyPick.thumbnailPath) : null;

  const firstName = user ? nameFrom(user).trim().split(/\s+/)[0] : null;
  const greetingLine1 = firstName ? t.greetingNamed.replace('{name}', firstName) : t.greetingFallback;

  return {
    firstName,
    greetingLine1,
    exerciseCountLabel,
    activityCountLabel,
    dailyPickHref,
    dailyPickMeta,
    dailyPickPeek,
    weatherLat,
    weatherLon,
    weatherCity,
    weatherLabel,
    playerLabels,
  };
}
