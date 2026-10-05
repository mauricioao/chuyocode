/**
 * Scrub cookies and the Authorization/Proxy-Authorization headers from a
 * Sentry event before it is sent.
 *
 * Defense in depth alongside `sendDefaultPii: false` (set in
 * `sentry.client.config.ts` / `sentry.server.config.ts`): that flag already
 * keeps Sentry from attaching cookies/IP by default, but does not promise
 * that NOTHING upstream (a captured breadcrumb, a future SDK default change)
 * ever attaches a request's headers or cookies to an event. This mutates
 * `event.request` in place so it is safe to call unconditionally from both
 * `beforeSend` and `beforeSendTransaction`.
 *
 * Loosely typed (`Record<string, unknown>`), not against `@sentry/astro`'s
 * own event types: those are internal-ish and have been renamed across
 * major versions, and this function's contract — "if `request.headers` or
 * `request.cookies` exist, strip the sensitive ones" — does not need them.
 * Both call sites pass the real Sentry event cast through `unknown` and
 * keep the ORIGINAL (correctly-typed) reference for their own return value,
 * which this function's in-place mutation makes safe to do.
 */

const SENSITIVE_HEADER_NAMES = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization']);

function scrubHeaders(headers: unknown): void {
  if (!headers || typeof headers !== 'object') return;
  const record = headers as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      delete record[key];
    }
  }
}

export function scrubSensitiveRequestData(event: Record<string, unknown>): void {
  const request = event['request'];
  if (!request || typeof request !== 'object') return;
  const req = request as Record<string, unknown>;
  scrubHeaders(req['headers']);
  delete req['cookies'];
}
