/**
 * GET /api/clima — the desk hub weather widget's backend ("desktop" redesign
 * PART 4). Stubs global `fetch` so this test never calls the real MET API;
 * the real-call check lives outside the test suite (manual verification,
 * see the feature's own report).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, ALL } from './clima';

function ctx(query: Record<string, string>) {
  const url = new URL('https://chuyocode.test/api/clima');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return { url } as unknown as Parameters<typeof GET>[0];
}

function metResponse(timeseries: unknown[]) {
  return new Response(JSON.stringify({ properties: { timeseries } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_QUERY = { lat: '-12.05', lon: '-77.04', city: 'Lima' };
const ONE_DAY_TIMESERIES = [
  {
    time: '2026-10-06T15:00:00Z',
    data: {
      instant: { details: { air_temperature: 18.2 } },
      next_1_hours: { summary: { symbol_code: 'cloudy' } },
    },
  },
];

describe('GET /api/clima — validation', () => {
  it('400s on a missing/non-numeric lat', async () => {
    const res = await GET(ctx({ lon: '0', city: 'Lima' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_lat');
  });

  it('400s on a lat out of range', async () => {
    const res = await GET(ctx({ lat: '200', lon: '0', city: 'Lima' }));
    expect(res.status).toBe(400);
  });

  it('400s on a missing/non-numeric lon', async () => {
    const res = await GET(ctx({ lat: '0', city: 'Lima' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_lon');
  });

  it('400s on a blank city', async () => {
    const res = await GET(ctx({ lat: '0', lon: '0', city: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_city');
  });

  it('never caches a 400', async () => {
    const res = await GET(ctx({ lon: '0', city: 'Lima' }));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/clima — method guard', () => {
  it('405s any non-GET verb via the ALL fallback, with an Allow header', async () => {
    const res = await ALL(ctx({}));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('GET /api/clima — success', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => metResponse(ONE_DAY_TIMESERIES)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the shaped { city, now, days } body', async () => {
    const res = await GET(ctx(VALID_QUERY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.city).toBe('Lima');
    expect(body.now).toEqual({ tempC: 18, icon: 'cloud', labelEn: 'Cloudy', labelEs: 'Nublado' });
    expect(body.days).toHaveLength(1);
  });

  it('sends an identifying User-Agent to MET, naming the app and a contact', async () => {
    await GET(ctx(VALID_QUERY));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['user-agent']).toContain('ChuyoCode');
  });

  it('calls only the fixed MET host, never interpolating city into the URL', async () => {
    await GET(ctx({ ...VALID_QUERY, city: 'Lima; rm -rf' }));
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toMatch(/^https:\/\/api\.met\.no\/weatherapi\/locationforecast\/2\.0\/compact\?lat=/);
    expect(calledUrl).not.toContain('rm -rf');
  });

  it('is publicly edge-cacheable, varying on lat/lon/city', async () => {
    const res = await GET(ctx(VALID_QUERY));
    expect(res.headers.get('Netlify-Vary')).toBe('query=lat|lon|city');
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toContain('public');
    expect(res.headers.get('cache-control')).toContain('public');
  });
});

describe('GET /api/clima — upstream failure', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('502s with no-store when MET itself errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const res = await GET(ctx(VALID_QUERY));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).error).toBe('weather_unavailable');
  });

  it('502s when the network call itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const res = await GET(ctx(VALID_QUERY));
    expect(res.status).toBe(502);
  });

  it('502s on an unparseable/empty timeseries body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => metResponse([])));
    const res = await GET(ctx(VALID_QUERY));
    expect(res.status).toBe(502);
  });
});
