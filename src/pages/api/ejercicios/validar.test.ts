/**
 * Unit tests for POST /api/ejercicios/validar (slice 17, design.md §8: "the
 * authoring island runs the same pure function for live feedback" — this
 * endpoint is the server-authoritative twin of that pure call).
 *
 * Stateless: no Supabase, no `locals.user` gate. It runs the same two pure
 * gates `guardar.ts` runs (`parsePayload` then `validateExercise`) over
 * caller-supplied input and returns the result — it reads and writes
 * nothing, so there is no row to leak and no T3/T4 boundary to enforce.
 */
import { describe, it, expect } from 'vitest';
import { POST } from './validar';

const VALID_INPUT = {
  skill: 'writing',
  level: 'A1',
  focus: 'present-simple',
  slug: 'ordering-coffee',
  payload: {
    pools: {},
    slots: [{ id: 'slot-1', label: 'The cat ___ on the mat', input: 'text', answer: ['sat'] }],
    blocks: [{ kind: 'row', id: 'row-1', slotId: 'slot-1' }],
  },
};

function ctx(body: unknown) {
  const request = new Request('https://chuyo.test/api/ejercicios/validar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { request } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/ejercicios/validar', () => {
  it('returns ok:true for a valid exercise (a single mechanic is a warning, not a blocker)', async () => {
    const res = await POST(ctx(VALID_INPUT));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.issues.every((i: { severity: string }) => i.severity !== 'error')).toBe(true);
  });

  it('returns ok:false with the issue list for an invalid exercise', async () => {
    const res = await POST(
      ctx({
        ...VALID_INPUT,
        payload: { pools: { opts: [] }, slots: [{ id: 's', label: 'x ___', input: 'choice', pool: 'opts', answer: ['a'] }] },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.issues.some((i: { code: string }) => i.code === 'pool_empty')).toBe(true);
  });

  it('rejects an unparseable payload at 422', async () => {
    const res = await POST(ctx({ ...VALID_INPUT, payload: { pools: {}, slots: [] } }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, code: 'payload_unparseable' });
  });

  it('rejects a malformed body at 400', async () => {
    const res = await POST(ctx({ skill: 'writing' }));
    expect(res.status).toBe(400);
  });

  it('marks the response private/no-store', async () => {
    const res = await POST(ctx(VALID_INPUT));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
