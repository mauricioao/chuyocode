/**
 * Read a `Request`'s body as text, rejecting it once it exceeds `maxBytes`
 * — without ever buffering more than that many bytes in memory first.
 *
 * `src/pages/api/csp-report.ts` and `src/pages/api/webhooks/[provider].ts`
 * each re-implemented a two-step guard: reject an honestly-declared
 * oversized `Content-Length` before reading anything (the fast path, kept
 * here), then read the WHOLE body with `request.text()` and check its
 * actual length afterward. That second step defeats its own purpose for a
 * CHUNKED body with no (or an understated) `Content-Length`: the entire
 * oversized payload is read into memory before being rejected — exactly
 * the cost the cap exists to bound, from an unauthenticated caller.
 *
 * This reads `request.body` as a stream instead, counting bytes as they
 * arrive, and calls `cancel()` on the underlying stream the instant the
 * running total exceeds `maxBytes` — the source (the network socket, in
 * production) is told to stop sending before the rest of an oversized body
 * is ever pulled.
 */

export type ReadBodyCappedResult = { ok: true; text: string } | { ok: false; reason: 'too_large' };

const TOO_LARGE: ReadBodyCappedResult = { ok: false, reason: 'too_large' };

export async function readBodyCapped(request: Request, maxBytes: number): Promise<ReadBodyCappedResult> {
  // Fast path: an honestly-declared oversized body is rejected before
  // reading anything at all. Content-Length can be absent or simply wrong
  // (chunked transfer, or a caller that lies) — the streamed count below is
  // the real guard either way.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return TOO_LARGE;
  }

  const body = request.body;
  if (!body) return { ok: true, text: '' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      // Cancel BEFORE returning: the rest of an oversized body (chunked, or
      // one whose Content-Length lied) is never pulled from the source.
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder('utf-8').decode(combined) };
}
