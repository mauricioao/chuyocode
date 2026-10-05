/**
 * POST /api/csp-report — collects Content-Security-Policy violation reports
 * ahead of enforcing the full policy. `src/lib/securityHeaders.ts` ships the
 * full policy `Report-Only` and points it at this endpoint via `report-uri`
 * / `report-to`, so real production violations land here instead of only in
 * a visitor's own browser console — see that module for why the full policy
 * is not enforced yet.
 *
 * Browsers send TWO independent, mutually exclusive report shapes, and this
 * endpoint accepts both:
 *
 *  - Legacy `report-uri` (every browser): `Content-Type: application/csp-report`,
 *    body `{ "csp-report": { "document-uri", "blocked-uri",
 *    "effective-directive" (falls back to the older "violated-directive" —
 *    same value, older name), "disposition", … } }` — W3C CSP3 §5 / MDN
 *    "Content-Security-Policy/report-uri".
 *  - Reporting API `report-to` (Chromium): `Content-Type: application/reports+json`,
 *    body a JSON ARRAY of `{ type: "csp-violation", url, body: {
 *    "documentURL", "blockedURL", "effectiveDirective", "disposition", … } }`
 *    — MDN "CSPViolationReportBody" / "Reporting-Endpoints".
 *
 * Nothing here is authenticated, origin-checked, or CSRF-guarded on purpose:
 * these are exactly the fire-and-forget POSTs a browser makes on its own,
 * cross-origin, with no custom header and no credentials. Astro's own
 * cross-origin check (`security.checkOrigin`, on by default and never
 * overridden in `astro.config.mjs`) never blocks either of them anyway —
 * `isForbiddenCrossOriginRequest` (`node_modules/astro/dist/core/app/origin-check.js`)
 * only rejects a cross-origin POST whose `content-type` is form-like
 * (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`);
 * `application/csp-report` and `application/reports+json` are neither, so
 * that check returns "not forbidden" for them regardless of the `origin`
 * header. `src/middleware.ts` never gates or redirects `/api/**` either —
 * `requiresLogin`/`hasAccess` only ever run for lang-prefixed pages — the
 * same as every other route in this folder, already covered generically by
 * `src/middleware.test.ts`'s "lets API routes pass through untouched" and
 * "resolves identity on /api routes too" (by path prefix, not by route name,
 * so this route needs no test of its own there).
 *
 * PRIVACY is the whole point of this endpoint: exactly four fields are ever
 * logged — effective/violated directive, blocked URL reduced to scheme+host
 * (or the bare keyword a browser sends instead of a URL, e.g.
 * "inline"/"eval"), the document's PATH with no query string, and
 * disposition. Never the request's cookies (never even read), never a full
 * URL with its query string, never an IP, never a user id. Every logged
 * value also has newlines/control characters stripped and its length capped
 * before logging — this is a public, unauthenticated endpoint, so a crafted
 * report body must not be able to forge extra fake log lines or flood the
 * log with one giant one.
 *
 * Every response is `204 private, no-store` with no body — a successful
 * report, a malformed one (ignored, never thrown), or an unsupported
 * content type all look the same from the caller's side. The only other
 * outcomes are `413` (body over `MAX_BODY_BYTES`) and `405` (non-POST).
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '@lib/apiResponse';
import { markPrivate } from '@lib/httpCache';

/**
 * Generous for a CSP report (a single legacy report is a few hundred bytes;
 * even a batched Reporting API array with several violations stays well
 * under this) and small enough to bound the worst case from an
 * unauthenticated caller before any work runs on the body.
 */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Best-effort flood guard: at most this many log lines per REQUEST (a
 * batched Reporting API array could otherwise carry hundreds of entries).
 * Deliberately read as a local `Array.slice` bound inside the handler below,
 * never module-level counter state — a flood guard that could leak a count
 * across requests (or tests) would be worse than none.
 */
const MAX_REPORTS_PER_REQUEST = 10;

/** Defensive length caps for logged fields. Nothing in the real report
 * formats is ever this long; these only bound a crafted/abusive body. */
const MAX_DIRECTIVE_LEN = 100;
const MAX_BLOCKED_URL_LEN = 100;
const MAX_PATH_LEN = 300;

/** The exactly-four fields this endpoint ever logs, already redacted. */
interface NormalizedReport {
  effectiveDirective: string;
  blockedUrl: string;
  documentPath: string;
  disposition: string;
}

/** The same four fields, straight off the wire — not yet redacted/capped. */
interface RawFields {
  effectiveDirective: string;
  blockedUrl: string;
  documentUrl: string;
  disposition: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Legacy `{ "csp-report": { … } }` body (hyphenated CSP3 field names). */
function fromLegacyBody(body: unknown): RawFields | null {
  if (!isRecord(body)) return null;
  const effectiveDirective = firstNonEmptyString(
    body['effective-directive'],
    body['violated-directive'],
  );
  const blockedUrl = firstNonEmptyString(body['blocked-uri']);
  const documentUrl = firstNonEmptyString(body['document-uri']);
  const disposition = firstNonEmptyString(body['disposition']);
  if (!effectiveDirective || !blockedUrl || !documentUrl || !disposition) return null;
  return { effectiveDirective, blockedUrl, documentUrl, disposition };
}

/** Reporting API `body` of one `{ type: "csp-violation", body }` array entry
 * (camelCase field names — `CSPViolationReportBody`). */
function fromReportingApiBody(body: unknown): RawFields | null {
  if (!isRecord(body)) return null;
  const effectiveDirective = firstNonEmptyString(body['effectiveDirective']);
  const blockedUrl = firstNonEmptyString(body['blockedURL']);
  const documentUrl = firstNonEmptyString(body['documentURL']);
  const disposition = firstNonEmptyString(body['disposition']);
  if (!effectiveDirective || !blockedUrl || !documentUrl || !disposition) return null;
  return { effectiveDirective, blockedUrl, documentUrl, disposition };
}

/**
 * Make an attacker-controlled string safe to put in ONE log line: replace
 * every C0/C1 control character, DEL and the Unicode line/paragraph
 * separators (otherwise a crafted field value could forge additional fake
 * log lines, split records in a log shipper, or inject terminal escapes into
 * whoever tails the logs) and cap the length.
 */
function sanitizeForLog(value: string, maxLength: number): string {
  const flattened = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').trim();
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength)}…` : flattened;
}

/**
 * Reduce a blocked-uri/blockedURL to scheme+host. Browsers send a bare
 * keyword instead of a URL for several cases (`inline`, `eval`, `data`,
 * `blob:…`, or an empty string) — those either fail to parse as an absolute
 * URL (caught below) or parse with an OPAQUE origin (the literal string
 * `"null"`, e.g. for `data:`/`blob:`); either way they are already short and
 * carry nothing left to reduce, so they are kept exactly as sent.
 */
function redactBlockedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.origin && url.origin !== 'null') {
      return url.origin;
    }
  } catch {
    // Not a parseable absolute URL — this IS the bare-keyword case.
  }
  return raw;
}

/**
 * The document URL's path ONLY — no query string, no fragment. `null` when
 * `raw` is not an absolute URL: document-uri/documentURL is always supposed
 * to be one (it is the page's own URL), so anything else is treated as
 * malformed input rather than guessed at.
 */
function redactDocumentPath(raw: string): string | null {
  try {
    return new URL(raw).pathname;
  } catch {
    return null;
  }
}

function redact(fields: RawFields): NormalizedReport | null {
  const documentPath = redactDocumentPath(fields.documentUrl);
  if (documentPath === null) return null;
  return {
    effectiveDirective: sanitizeForLog(fields.effectiveDirective, MAX_DIRECTIVE_LEN),
    blockedUrl: sanitizeForLog(redactBlockedUrl(fields.blockedUrl), MAX_BLOCKED_URL_LEN),
    documentPath: sanitizeForLog(documentPath, MAX_PATH_LEN),
    disposition: sanitizeForLog(fields.disposition, MAX_DIRECTIVE_LEN),
  };
}

/**
 * Parse `rawBody` under `contentType` into zero or more normalized, redacted
 * reports. Never throws: bad JSON, the wrong shape, or an unrecognized
 * content type all simply yield an empty array. "Ignore anything malformed"
 * applies PER REPORT, not just per request, so one bad entry inside a
 * batched Reporting API array never drops the valid ones around it.
 */
function extractReports(contentType: string, rawBody: string): NormalizedReport[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [];
  }

  if (contentType.includes('application/csp-report')) {
    const fields = isRecord(parsed) ? fromLegacyBody(parsed['csp-report']) : null;
    if (!fields) return [];
    const normalized = redact(fields);
    return normalized ? [normalized] : [];
  }

  if (contentType.includes('application/reports+json')) {
    if (!Array.isArray(parsed)) return [];
    const reports: NormalizedReport[] = [];
    for (const entry of parsed) {
      if (!isRecord(entry) || entry['type'] !== 'csp-violation') continue;
      const fields = fromReportingApiBody(entry['body']);
      if (!fields) continue;
      const normalized = redact(fields);
      if (normalized) reports.push(normalized);
    }
    return reports;
  }

  return [];
}

function noContent(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 204, headers });
}

export const POST: APIRoute = async ({ request }) => {
  // An honestly-declared oversized body is rejected before it is read at
  // all — same guard shape as `src/pages/api/webhooks/[provider].ts`.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'payload_too_large' }, 413);
  }

  const rawBody = await request.text();
  // Content-Length can be absent or simply wrong — the actual read length is
  // the real guard.
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'payload_too_large' }, 413);
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  const reports = extractReports(contentType, rawBody);

  for (const report of reports.slice(0, MAX_REPORTS_PER_REQUEST)) {
    console.warn(
      `[csp-report] directive=${report.effectiveDirective} blocked=${report.blockedUrl} path=${report.documentPath} disposition=${report.disposition}`,
    );
  }

  return noContent();
};

/** Reject any non-POST method with 405 (same guard shape as
 * `validar-anuncio.ts`). */
export const ALL: APIRoute = () =>
  jsonResponse({ error: 'method_not_allowed' }, 405, { headers: { allow: 'POST' } });
