/**
 * Scrub cookies, the Authorization/Proxy-Authorization headers and the
 * visitor's identity (IP address, email, username) from a Sentry event
 * before it is sent.
 *
 * Defense in depth alongside the `dataCollection` options set in
 * `sentry.client.config.ts` / `sentry.server.config.ts` (`cookies: false`,
 * `userInfo: false`, a header deny-list): those keep the SDK from attaching
 * that data, but do not promise that NOTHING upstream (a captured
 * breadcrumb, a future SDK default change — `userInfo` defaults to `true`)
 * ever does. This mutates `event.request` and `event.user` in place so it is
 * safe to call unconditionally from both `beforeSend` and
 * `beforeSendTransaction`.
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

const SENSITIVE_USER_FIELDS = ['ip_address', 'email', 'username'];

export function scrubSensitiveRequestData(event: Record<string, unknown>): void {
  const user = event['user'];
  if (user && typeof user === 'object') {
    for (const field of SENSITIVE_USER_FIELDS) {
      delete (user as Record<string, unknown>)[field];
    }
  }

  const request = event['request'];
  if (!request || typeof request !== 'object') return;
  const req = request as Record<string, unknown>;
  scrubHeaders(req['headers']);
  delete req['cookies'];
}
