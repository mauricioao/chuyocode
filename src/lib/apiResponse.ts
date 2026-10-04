/**
 * Shared response helpers for `src/pages/api/**` routes.
 *
 * Roughly thirty routes hand-rolled the identical pair of local functions —
 * a `json(body, status)` that sets `content-type: application/json;
 * charset=utf-8` plus `markPrivate`, and a zero-arg `notFound()` that
 * returns a private/no-store 404 with no body — and the identical guard
 * line `if (!user) return json({ error: 'unauthorized' }, 401)`. This
 * module is the one place that shape is spelled now.
 *
 * NOT every route fits this shape, and none of those were changed to fit
 * it: a different content-type, a different `cache-control` (or none at
 * all), an `{ ok, error }` body instead of `{ error }`, or session-cookie
 * flushing (`flushSessionHeaders`) all stay on the route's own local
 * helper. Forcing one of those through here would change its response.
 */
import { markPrivate } from './httpCache';

/**
 * A private/no-store JSON response: `content-type: application/json;
 * charset=utf-8`, `cache-control: private, no-store` (via `markPrivate`),
 * and `JSON.stringify(body)` as the response body. `status` defaults to
 * 200 — the common case of a plain success body with no error branch
 * above it.
 *
 * `init`, when given, is applied first, so its own `headers` can carry
 * something this helper does not know about (e.g. a `Set-Cookie` the
 * caller already built) — `content-type` and `markPrivate`'s
 * `cache-control` are `set` afterward and always win, the same guarantee
 * `markPrivate`'s own header documents.
 */
export function jsonResponse(body: unknown, status = 200, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  markPrivate(headers);
  return new Response(JSON.stringify(body), { ...init, status, headers });
}

/**
 * A private/no-store 404 with no body: `cache-control: private, no-store`,
 * `statusText: 'Not Found'`, `null` body — the exact shape every migrated
 * route's own `notFound()` returned.
 *
 * Used for BOTH "does not exist" and "exists but is not yours" across
 * every route that calls it: the body and headers never differ between the
 * two, which is the point — neither case can be told apart from the other.
 */
export function notFoundResponse(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 404, statusText: 'Not Found', headers });
}

/**
 * The shared guard for a `locals.user`-gated route:
 * `if (!user) return requireUser();`.
 *
 * Returns the identical 401 `{ error: 'unauthorized' }` every migrated
 * route returned before this module existed. A route whose unauthorized
 * body differs (`{ ok: false, error: 'unauthorized' }`, or just
 * `{ ok: false }`) keeps calling `jsonResponse` directly with its own body
 * instead of this helper.
 */
export function requireUser(): Response {
  return jsonResponse({ error: 'unauthorized' }, 401);
}
