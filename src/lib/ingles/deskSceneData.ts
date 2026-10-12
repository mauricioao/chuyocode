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
import { getActivityCount, getPublishedActivities, getActivitiesByAuthor } from '@lib/activities/activities';
import { pickDailyActivity } from '@lib/activities/dailyPick';
import { publicImageUrl } from '@lib/activities/storage';
import { nameFrom } from '@lib/profile';
import type { MyActivityStatusEntry } from '@lib/ingles/myActivityStatusToasts';

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
  communityTitle: string;
  todayTitle: string;
  myActivitiesTitle: string;
  createActivityLabel: string;
  widgetsLabel: string;
  weatherUnavailable: string;
  /** The weather widget's own MET Norway credit ("Datos: MET Norway"). */
  weatherAttribution: string;
  levelShortcutTitle: string;
}

export interface DeskSceneData {
  /** First name only, already extracted from `nameFrom` — `null` for an anonymous visitor. */
  firstName: string | null;
  greetingLine1: string;
  activityCountLabel: string | null;
  dailyPickHref: string;
  dailyPickMeta: string | null;
  dailyPickPeek: string | null;
  weatherLat: number;
  weatherLon: number;
  weatherCity: string;
  weatherLabel: string;
  playerLabels: DeskScenePlayerLabels;
  /**
   * N4 (owner spec, resolves UX-INGLES.md's F3/F5) — the "Mis actividades"
   * folder's own meta line: "3 actividades" / "1 actividad" / "Sin
   * actividades todavía" (never degrades to `null`, unlike
   * {@link activityCountLabel} — an author with zero activities is a real,
   * always-renderable state here, not a failed query).
   */
  myActivitiesMeta: string;
  /** The folder's own small "needs action" badge — how many of the author's activities are `'rejected'`. */
  myActivitiesRejectedCount: number;
  /** The badge's accessible name (e.g. "2 actividades necesitan cambios") — `null` whenever {@link myActivitiesRejectedCount} is 0 (no badge renders at all). */
  myActivitiesBadgeLabel: string | null;
  /**
   * The desk's own status-change-toast init script data
   * (`@lib/ingles/myActivityStatusToasts`) — `null` for an anonymous
   * visitor (the TEMP local-dev screenshot override is the only way this
   * happens in practice; `Astro.locals.user` is non-null in production for
   * every page that mounts the desk) rather than an empty array, so the
   * script can tell "nothing to diff" apart from "no author session at
   * all" and skip itself entirely.
   */
  myActivitiesStatuses: MyActivityStatusEntry[] | null;
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

/** The "Mis actividades" folder's own meta line — unlike {@link formatCount}, 0 is a real, always-shown state here ("Sin actividades todavía"), never a degraded count. */
function formatMyActivitiesMeta(count: number, one: string, many: string, emptyLabel: string): string {
  if (count === 0) return emptyLabel;
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

  // One cheap count plus the top-hearted pool `pickDailyActivity` picks
  // from, plus (N4) the author's own activities for the "Mis actividades"
  // folder's meta/badge/toast data — all in parallel, same "one query per
  // render" posture `index.astro`'s original query already had. Skipped
  // entirely for an anonymous visitor (the TEMP local-dev screenshot
  // override is the only way that happens in practice — see this module's
  // own `DeskSceneData.myActivitiesStatuses` doc).
  const [activityCount, heartedPool, myActivities] = await Promise.all([
    getActivityCount(),
    getPublishedActivities({ level: null, page: 1, orden: 'gustadas', viewerId: user?.id ?? null }),
    user ? getActivitiesByAuthor(user.id) : Promise.resolve([]),
  ]);

  const activityCountLabel = formatCount(activityCount, t.activityCountOne, t.activityCountMany);

  const myActivitiesMeta = formatMyActivitiesMeta(
    myActivities.length,
    t.activityCountOne,
    t.activityCountMany,
    t.myActivitiesEmptyMeta,
  );
  const myActivitiesRejectedCount = myActivities.filter((activity) => activity.status === 'rejected').length;
  const myActivitiesBadgeLabel =
    myActivitiesRejectedCount === 0
      ? null
      : (myActivitiesRejectedCount === 1 ? t.myActivitiesBadgeOne : t.myActivitiesBadgeMany).replace(
          '{n}',
          String(myActivitiesRejectedCount),
        );
  const myActivitiesStatuses: MyActivityStatusEntry[] | null = user
    ? myActivities.map((activity) => ({ id: activity.id, title: activity.title, status: activity.status }))
    : null;

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
    activityCountLabel,
    dailyPickHref,
    dailyPickMeta,
    dailyPickPeek,
    weatherLat,
    weatherLon,
    weatherCity,
    weatherLabel,
    playerLabels,
    myActivitiesMeta,
    myActivitiesRejectedCount,
    myActivitiesBadgeLabel,
    myActivitiesStatuses,
  };
}
