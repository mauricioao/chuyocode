import { describe, expect, it } from 'vitest';
import { GET } from './desk-tips-[lang].json';
import { DESK_HELPER_TIPS } from '@/content/deskHelperTips';

function ctx(lang: string) {
  return { params: { lang } } as unknown as Parameters<typeof GET>[0];
}

describe('GET /desk-tips-[lang].json', () => {
  it('answers 200 with a JSON content type', async () => {
    const res = await GET(ctx('es'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('lets the CDN keep it until the next deploy but browsers only briefly, so a tip edit reaches returning visitors', async () => {
    const res = await GET(ctx('es'));
    expect(res.headers.get('netlify-cdn-cache-control')).toContain('durable');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('answers 404 for an unsupported language', async () => {
    const res = await GET(ctx('fr'));
    expect(res.status).toBe(404);
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
