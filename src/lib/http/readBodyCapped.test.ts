/**
 * Tests for `readBodyCapped` — see that module's header for the full
 * contract. Both `src/pages/api/csp-report.ts` and
 * `src/pages/api/webhooks/[provider].ts` previously re-implemented this
 * exact shape with one gap: the actual-length guard only ran AFTER
 * `request.text()` had already buffered the whole body, so a chunked body
 * with no (or an understated) `Content-Length` was fully read into memory
 * before being rejected. These tests prove the fix — the stream is read
 * incrementally and cancelled the instant the cap is exceeded — never the
 * route-level behavior (that stays covered by `_csp-report.test.ts` and
 * `webhooks/_[provider].test.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readBodyCapped } from './readBodyCapped';

const MAX_BYTES = 16;

/**
 * A `ReadableStream` that enqueues `chunks` one at a time (one per `pull`),
 * recording every pull and whether/how it was cancelled — the only way to
 * observe, from the outside, whether a consumer kept reading after it
 * should have stopped.
 */
function instrumentedStream(chunks: Uint8Array[]): {
  stream: ReadableStream<Uint8Array>;
  pullCount: () => number;
  wasCancelled: () => boolean;
} {
  let pullCount = 0;
  let cancelled = false;
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, pullCount: () => pullCount, wasCancelled: () => cancelled };
}

function requestWithStream(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
  return new Request('https://chuyocode.test/x', {
    method: 'POST',
    headers,
    body: stream,
    // Node's fetch (undici) requires this for any streamed request body.
    duplex: 'half',
  } as RequestInit);
}

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('readBodyCapped', () => {
  it('accepts a body at exactly the cap', async () => {
    const exact = 'a'.repeat(MAX_BYTES);
    const { stream } = instrumentedStream([utf8(exact)]);
    const result = await readBodyCapped(requestWithStream(stream), MAX_BYTES);

    expect(result).toEqual({ ok: true, text: exact });
  });

  it('rejects a chunked body with no Content-Length, cancelling the source stream before it is fully consumed', async () => {
    // 5 chunks of 4 bytes = 20 bytes, over the 16-byte cap — the 5th chunk
    // (and the stream's own natural `close()`) must never be reached.
    const chunks = Array.from({ length: 5 }, () => bytes(1, 2, 3, 4));
    const { stream, pullCount, wasCancelled } = instrumentedStream(chunks);

    const result = await readBodyCapped(requestWithStream(stream), MAX_BYTES);

    expect(result).toEqual({ ok: false, reason: 'too_large' });
    expect(wasCancelled()).toBe(true);
    // Strictly fewer pulls than the 5 chunks (+ a final close pull) the
    // stream would have taken to drain naturally.
    expect(pullCount()).toBeLessThan(6);
  });

  it('rejects when Content-Length understates the actual (oversized) body', async () => {
    const { stream } = instrumentedStream([utf8('a'.repeat(MAX_BYTES + 10))]);
    const result = await readBodyCapped(requestWithStream(stream, { 'content-length': '1' }), MAX_BYTES);

    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('rejects on Content-Length alone, without the fast path itself cancelling or reading through the stream', async () => {
    const { stream, wasCancelled } = instrumentedStream([utf8('a'.repeat(MAX_BYTES))]);
    const result = await readBodyCapped(
      requestWithStream(stream, { 'content-length': String(MAX_BYTES + 1) }),
      MAX_BYTES,
    );

    expect(result).toEqual({ ok: false, reason: 'too_large' });
    // NOT asserting zero pulls here: Node's own `Request` (given a
    // `duplex: 'half'` streaming body) starts an internal background pull
    // the instant control yields to a microtask — observed directly, with
    // no call into `readBodyCapped` at all. What this fast path itself
    // never does is call `cancel()` — that only happens once the STREAMED
    // count trips (see the other tests above/below).
    expect(wasCancelled()).toBe(false);
  });

  it('counts multi-byte UTF-8 characters in BYTES, not in string length', async () => {
    // 5 "é" characters: 5 UTF-16 code units, but 10 UTF-8 bytes — under a
    // naive string-length cap of 16, over a byte cap of 8.
    const five_e_acute = 'é'.repeat(5);
    expect(five_e_acute.length).toBe(5);
    expect(Buffer.byteLength(five_e_acute, 'utf8')).toBe(10);

    const { stream } = instrumentedStream([utf8(five_e_acute)]);
    const result = await readBodyCapped(requestWithStream(stream), 8);

    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('reassembles multi-byte UTF-8 split across chunk boundaries back into the exact original text', async () => {
    // "café" encodes to 5 bytes (c-a-f-é, é = 0xC3 0xA9); split the two
    // bytes of "é" across two separate chunks/pulls.
    const encoded = utf8('café');
    const { stream } = instrumentedStream([encoded.slice(0, 4), encoded.slice(4)]);

    const result = await readBodyCapped(requestWithStream(stream), MAX_BYTES);

    expect(result).toEqual({ ok: true, text: 'café' });
  });

  it('treats a null body (no body at all) as empty text, not an error', async () => {
    const request = new Request('https://chuyocode.test/x', { method: 'GET' });
    expect(request.body).toBeNull();

    const result = await readBodyCapped(request, MAX_BYTES);

    expect(result).toEqual({ ok: true, text: '' });
  });

  it('treats an explicitly empty body as empty text', async () => {
    const { stream } = instrumentedStream([]);
    const result = await readBodyCapped(requestWithStream(stream), MAX_BYTES);

    expect(result).toEqual({ ok: true, text: '' });
  });
});
