/**
 * `GET /api/clima?lat=..&lon=..&city=..` — the desk hub weather widget's own
 * backend ("desktop" redesign PART 4). Fetches MET Norway's Locationforecast
 * 2.0 compact product for the given coordinates, shapes it down to exactly
 * what the widget renders, and hands that back as small JSON.
 *
 * WHY A SERVER HOP AT ALL, RATHER THAN THE BROWSER CALLING MET DIRECTLY:
 * MET's terms require an identifying `User-Agent` on every request (app +
 * contact) — not something a browser `fetch` can set — and this endpoint is
 * also the one place that can be cached at Netlify's edge, which is what
 * keeps MET's own request volume near zero (their terms: < 20 req/s total,
 * across every site using the API).
 *
 * UPSTREAM HOST IS FIXED (no SSRF): only `lat`/`lon` ever reach the request
 * URL this builds; `city` is echoed straight into the JSON reply and is
 * NEVER interpolated into any URL.
 *
 * CACHING: a public, Netlify-edge-cacheable response, keyed per
 * `lat`/`lon`/`city` via the `Netlify-Vary` request header (Netlify's CDN
 * otherwise keys page cache on the path alone and would ignore the query
 * string, serving one visitor's city to the next). `Netlify-CDN-Cache-Control`
 * carries the actual TTL (30 min fresh, an hour stale-while-revalidate) —
 * long enough that MET sees at most a couple of requests per distinct
 * rounded coordinate pair per half hour, however many visitors hit the hub.
 * `Cache-Control` (browser-facing) is shorter, so a single visitor's own tab
 * still asks again after 5 minutes rather than locking in a half-hour-old
 * reading.
 *
 * NO IN-MEMORY LAYER: this runs as a Netlify Function, a fresh process per
 * cold start with no guarantee of surviving between invocations, so a
 * module-level cache here would be unreliable at best and give a false
 * sense of de-duplication at worst. The CDN cache above is the real,
 * durable layer; honouring MET's own `Expires`/`Last-Modified` would only
 * matter for a layer that actually persists between requests.
 *
 * FAILURE: MET unreachable, a non-2xx response, or an unparseable body all
 * collapse to one `502` `{ error: 'weather_unavailable' }`, `no-store` (an
 * outage is never cached) — the widget's own job is to show a calm "not
 * available" state at the same size rather than surface which failure mode
 * this was.
 */
import type { APIRoute } from 'astro';
import { buildForecast, type MetTimeseriesEntry } from '@lib/weatherForecast';

const MET_ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/** Printable-only, trimmed, capped — `city` is display text, never part of a URL or a shell/SQL context, so this only needs to keep it short and newline-free. */
const MAX_CITY_LEN = 80;

/** Netlify's edge-cache key is the path alone by default; this is what tells it to also vary on these three query params instead of ignoring them (and, worse, serving one visitor's coordinates to the next request for the same bare path). */
const NETLIFY_VARY = 'query=lat|lon|city';

/** 30 minutes fresh at the edge, an hour of stale-while-revalidate beyond that — MET's own data updates roughly hourly, so this comfortably avoids visitors seeing stale data while still keeping MET's own request volume low. */
const CDN_CACHE_CONTROL = 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600';

/** Browser-facing cache lifetime — shorter than the edge TTL on purpose (see file header). */
const BROWSER_CACHE_CONTROL = 'public, max-age=300';

function parseCoordinate(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

/** Strips control/newline characters, trims, and caps length — `city` is free text echoed into the JSON reply, never into a URL. */
function sanitizeCity(raw: string | null): string | null {
  if (raw === null) return null;
  // eslint-disable-next-line no-control-regex -- deliberately stripping control chars from untrusted query text
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_CITY_LEN);
}

function badRequest(error: string): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return new Response(JSON.stringify({ error }), { status: 400, headers });
}

function upstreamUnavailable(): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return new Response(JSON.stringify({ error: 'weather_unavailable' }), { status: 502, headers });
}

/** `User-Agent` MET's terms require: app name/version + a contact (site owner's own public support address, falling back to the site URL when that env var is unset). */
function userAgent(): string {
  const contact =
    import.meta.env.LEGAL_OWNER_EMAIL || process.env.LEGAL_OWNER_EMAIL || 'https://chuyocode.netlify.app';
  return `ChuyoCode/1.0 (+https://chuyocode.netlify.app; ${contact})`;
}

export const GET: APIRoute = async ({ url }) => {
  const lat = parseCoordinate(url.searchParams.get('lat'), -90, 90);
  const lon = parseCoordinate(url.searchParams.get('lon'), -180, 180);
  const city = sanitizeCity(url.searchParams.get('city'));

  if (lat === null) return badRequest('invalid_lat');
  if (lon === null) return badRequest('invalid_lon');
  if (city === null) return badRequest('invalid_city');

  const upstreamUrl = `${MET_ENDPOINT}?lat=${lat}&lon=${lon}`;

  let body: unknown;
  try {
    const response = await fetch(upstreamUrl, { headers: { 'user-agent': userAgent() } });
    if (!response.ok) return upstreamUnavailable();
    body = await response.json();
  } catch {
    return upstreamUnavailable();
  }

  const timeseries = (body as { properties?: { timeseries?: unknown } })?.properties?.timeseries;
  if (!Array.isArray(timeseries) || timeseries.length === 0) return upstreamUnavailable();

  let forecast;
  try {
    forecast = buildForecast(timeseries as MetTimeseriesEntry[]);
  } catch {
    return upstreamUnavailable();
  }

  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': BROWSER_CACHE_CONTROL,
    'Netlify-CDN-Cache-Control': CDN_CACHE_CONTROL,
    'Netlify-Vary': NETLIFY_VARY,
  });
  return new Response(JSON.stringify({ city, ...forecast }), { status: 200, headers });
};

/** Reject any non-GET method with 405 (this endpoint is GET-only, no body to content-type-check — Astro only calls `ALL` when no method-specific handler, i.e. `GET` above, matches). */
export const ALL: APIRoute = () => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    allow: 'GET',
  });
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });
};
