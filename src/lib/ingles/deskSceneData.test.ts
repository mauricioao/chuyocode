import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `nameFrom` (`@lib/profile`) pulls in `@lib/access` -> `@lib/supabase` ->
// `loadEnv`, which reads `import.meta.env` — stub it before any module that
// calls it, same posture as `src/pages/[lang]/ingles/_ingles.test.ts`.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'test-proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
}));

vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}`,
}));

import { loadDeskSceneData } from './deskSceneData';

function userFixture(displayName: string) {
  return { id: 'u1', email: 'visitor@example.com', user_metadata: { display_name: displayName } } as never;
}

beforeEach(() => {
  getActivityCount.mockReset();
  getPublishedActivities.mockReset();
  getActivityCount.mockResolvedValue(null);
  getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadDeskSceneData', () => {
  it('greets a signed-in visitor by their first name', async () => {
    const data = await loadDeskSceneData({ lang: 'es', user: userFixture('Ana Pérez'), geo: undefined });
    expect(data.greetingLine1).toBe('Hola, Ana.');
    expect(data.firstName).toBe('Ana');
  });

  it('falls back to a bare greeting with no session', async () => {
    const data = await loadDeskSceneData({ lang: 'es', user: null, geo: undefined });
    expect(data.greetingLine1).toBe('Hola.');
    expect(data.firstName).toBeNull();
  });

  it('degrades the count to null (never "0 …") when the query fails', async () => {
    const data = await loadDeskSceneData({ lang: 'es', user: null, geo: undefined });
    expect(data.activityCountLabel).toBeNull();
  });

  it('formats the count with the singular noun for exactly one', async () => {
    getActivityCount.mockResolvedValue(1);
    const data = await loadDeskSceneData({ lang: 'es', user: null, geo: undefined });
    expect(data.activityCountLabel).toBe('1 actividad');
  });

  it('falls back to Lima when no request geo is present', async () => {
    const data = await loadDeskSceneData({ lang: 'es', user: null, geo: undefined });
    expect(data.weatherLat).toBe(-12.0464);
    expect(data.weatherLon).toBe(-77.0428);
    expect(data.weatherCity).toBe('Lima');
    expect(data.weatherLabel).toBe('Clima en Lima');
  });

  it('rounds and uses the request geo when both coordinates are present', async () => {
    const data = await loadDeskSceneData({
      lang: 'es',
      user: null,
      geo: { latitude: -33.44589, longitude: -70.669265, city: 'Santiago' },
    });
    expect(data.weatherLat).toBe(-33.45);
    expect(data.weatherLon).toBe(-70.67);
    expect(data.weatherCity).toBe('Santiago');
    expect(data.weatherLabel).toBe('Clima en Santiago');
  });

  it('picks the daily activity and links the folder to it, with its thumbnail peek', async () => {
    getPublishedActivities.mockResolvedValue({
      activities: [{ id: 'act-1', title: 'Daily one', thumbnailPath: 'covers/a.webp' }],
      total: 1,
    });
    const data = await loadDeskSceneData({ lang: 'es', user: null, geo: undefined });
    expect(data.dailyPickHref).toBe('/es/ingles/actividades/act-1');
    expect(data.dailyPickMeta).toBe('Daily one');
    expect(data.dailyPickPeek).toBe('https://public.example/covers/a.webp');
  });

  it('falls back to the community feed when there is no daily pick', async () => {
    getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
    const data = await loadDeskSceneData({ lang: 'es', user: null, geo: undefined });
    expect(data.dailyPickHref).toBe('/es/ingles/actividades');
    expect(data.dailyPickMeta).toBeNull();
    expect(data.dailyPickPeek).toBeNull();
  });

  it('passes the signed-in viewer id to the hearted-pool query', async () => {
    await loadDeskSceneData({ lang: 'es', user: userFixture('Ana'), geo: undefined });
    expect(getPublishedActivities).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: 'u1' }),
    );
  });
});
