import { describe, expect, it } from 'vitest';
import { GET, getStaticPaths } from './desk-tips-[lang].json';
import { DESK_HELPER_TIPS } from '@/content/deskHelperTips';
import { SUPPORTED_LANGS } from '@lib/i18n';

function ctx(lang: string) {
  return { params: { lang } } as unknown as Parameters<typeof GET>[0];
}

describe('getStaticPaths', () => {
  it('builds one static path per supported language', () => {
    const paths = getStaticPaths({} as never);
    expect(paths).toEqual(SUPPORTED_LANGS.map((lang) => ({ params: { lang } })));
  });
});

describe('GET /data/desk-tips-[lang].json', () => {
  it('answers 200 with a JSON content type and a long-lived immutable cache header', async () => {
    const res = await GET(ctx('es'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('ships every tip, each with only id/character/html — no duplicated character name', async () => {
    const res = await GET(ctx('es'));
    const body = await res.json();
    expect(body).toHaveLength(DESK_HELPER_TIPS.length);
    for (const entry of body) {
      expect(Object.keys(entry).sort()).toEqual(['character', 'html', 'id']);
    }
  });

  it('resolves html in the requested language', async () => {
    const esRes = await GET(ctx('es'));
    const enRes = await GET(ctx('en'));
    const esBody = await esRes.json();
    const enBody = await enRes.json();

    expect(esBody[0].html).toBe(DESK_HELPER_TIPS[0].es);
    expect(enBody[0].html).toBe(DESK_HELPER_TIPS[0].en);
    expect(esBody[0].html).not.toBe(enBody[0].html);
  });

  it('every id in the payload matches a real tip id, with no duplicates', async () => {
    const res = await GET(ctx('es'));
    const body = await res.json();
    const ids = body.map((entry: { id: string }) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const realIds = new Set(DESK_HELPER_TIPS.map((tip) => tip.id));
    for (const id of ids) {
      expect(realIds.has(id)).toBe(true);
    }
  });
});
