import { describe, it, expect } from 'vitest';
import { jsonResponse, notFoundResponse, requireUser } from './apiResponse';

describe('jsonResponse', () => {
  it('defaults to 200 with the body JSON-stringified', async () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('uses the given status', async () => {
    const res = jsonResponse({ error: 'bad_request' }, 400);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });

  it('sets content-type to application/json; charset=utf-8', () => {
    const res = jsonResponse({ ok: true });
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('marks the response private/no-store (T7)', () => {
    const res = jsonResponse({ ok: true });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('serializes null, arrays and nested bodies the same way JSON.stringify does', async () => {
    const res = jsonResponse({ issues: [1, 2], note: null });
    expect(await res.json()).toEqual({ issues: [1, 2], note: null });
  });

  // `init.headers` lets a caller carry something this helper does not know
  // about (e.g. a `Set-Cookie` it already built) onto the same response.
  it('preserves an extra header passed via init', () => {
    const res = jsonResponse({ ok: true }, 200, { headers: { 'set-cookie': 'a=b' } });
    expect(res.headers.get('set-cookie')).toBe('a=b');
  });

  // content-type and cache-control are `set` AFTER `init.headers` is
  // applied, so neither can be overridden by a caller-supplied value —
  // same guarantee `markPrivate`'s own header documents.
  it('never lets init.headers override content-type or cache-control', () => {
    const res = jsonResponse(
      { ok: true },
      200,
      { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } },
    );
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('notFoundResponse', () => {
  it('is a 404 with no body', async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('carries the Not Found status text', () => {
    expect(notFoundResponse().statusText).toBe('Not Found');
  });

  it('marks the response private/no-store (T7)', () => {
    expect(notFoundResponse().headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('requireUser', () => {
  it('is a 401 with the shared unauthorized body', async () => {
    const res = requireUser();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('marks the response private/no-store (T7)', () => {
    expect(requireUser().headers.get('cache-control')).toBe('private, no-store');
  });
});
