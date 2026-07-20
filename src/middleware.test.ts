import { describe, it, expect, vi } from 'vitest';

// `astro:middleware` is a virtual module only available inside the Astro
// runtime. In unit tests we stub it: defineMiddleware is an identity wrapper
// (it just returns the handler), so this stub preserves behavior exactly.
vi.mock('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn,
}));

import { onRequest } from './middleware';

type NextResult = Response;

/** Build a minimal Astro middleware context for a given pathname. */
function makeContext(pathname: string) {
  const locals: Record<string, unknown> = {};
  const redirect = vi.fn(
    (location: string, status?: number) =>
      new Response(null, {
        status: status ?? 302,
        headers: { Location: location },
      }),
  );
  const context = {
    url: new URL(`https://chuyocode.test${pathname}`),
    locals,
    redirect,
  };
  return { context, locals, redirect };
}

const next = vi.fn<[], Promise<NextResult> | NextResult>(
  () => new Response('OK', { status: 200 }),
);

function run(pathname: string) {
  const { context, locals, redirect } = makeContext(pathname);
  // The middleware signature is (context, next). We pass our stubbed next.
  const result = (onRequest as unknown as (
    c: typeof context,
    n: typeof next,
  ) => Response | Promise<Response>)(context, next);
  return { result, locals, redirect };
}

describe('locale middleware', () => {
  // Spec 5 — Scenario: Root redirect.
  it('redirects / to /es/ with 302', async () => {
    const { result, redirect } = run('/');
    const res = await result;
    expect(redirect).toHaveBeenCalledWith('/es/', 302);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/es/');
  });

  // Spec 5 — Scenario: Valid lang prefix.
  it('passes through a valid es path and sets locals.lang', async () => {
    next.mockClear();
    const { result, locals } = run('/es/libros');
    await result;
    expect(next).toHaveBeenCalledOnce();
    expect(locals.lang).toBe('es');
  });

  it('passes through a valid en path and sets locals.lang', async () => {
    next.mockClear();
    const { result, locals } = run('/en/');
    await result;
    expect(next).toHaveBeenCalledOnce();
    expect(locals.lang).toBe('en');
  });

  // Spec 5 — Scenario: Invalid lang.
  it('returns 404 for an invalid lang segment', async () => {
    next.mockClear();
    const { result } = run('/fr/libros');
    const res = await result;
    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets API routes pass through untouched', async () => {
    next.mockClear();
    const { result, locals } = run('/api/validar-anuncio');
    await result;
    expect(next).toHaveBeenCalledOnce();
    expect(locals.lang).toBeUndefined();
  });

  it('lets asset-like paths with an extension pass through', async () => {
    next.mockClear();
    const { result } = run('/favicon.ico');
    await result;
    expect(next).toHaveBeenCalledOnce();
  });
});
