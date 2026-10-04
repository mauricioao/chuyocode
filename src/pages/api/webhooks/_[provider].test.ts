/**
 * Integration tests for POST /api/webhooks/[provider] — see the route's own
 * header for the full contract. `@lib/billing/paddle` and `@lib/billing/apply`
 * are mocked: signature math is proven in `paddle.test.ts`, and the upserts
 * are proven in `apply.test.ts`. This file is about the ROUTE's own job —
 * status codes, ledger-before-apply ordering, and never re-applying a
 * duplicate — not re-proving either of those.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  loadEnvMock,
  verifyPaddleSignatureMock,
  mapPaddleEventMock,
  recordBillingEventMock,
  markBillingEventProcessedMock,
  applyBillingEventMock,
} = vi.hoisted(() => ({
  loadEnvMock: vi.fn(),
  verifyPaddleSignatureMock: vi.fn(),
  mapPaddleEventMock: vi.fn(),
  recordBillingEventMock: vi.fn(),
  markBillingEventProcessedMock: vi.fn(),
  applyBillingEventMock: vi.fn(),
}));

vi.mock('@lib/env', () => ({ loadEnv: loadEnvMock }));

vi.mock('@lib/billing/paddle', async (importActual) => {
  const actual = await importActual<typeof import('@lib/billing/paddle')>();
  return {
    ...actual,
    verifyPaddleSignature: verifyPaddleSignatureMock,
    mapPaddleEvent: mapPaddleEventMock,
  };
});

vi.mock('@lib/billing/apply', () => ({
  recordBillingEvent: recordBillingEventMock,
  markBillingEventProcessed: markBillingEventProcessedMock,
  applyBillingEvent: applyBillingEventMock,
}));

import { POST, resetPaddleInertWarningForTests } from './[provider]';

const VALID_BODY = JSON.stringify({ event_id: 'evt_1', event_type: 'subscription.activated', data: {} });

function ctx(provider: string, body = VALID_BODY, header: string | null = 'ts=1;h1=abc') {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (header !== null) headers.set('paddle-signature', header);
  const request = new Request(`https://chuyocode.com/api/webhooks/${provider}`, {
    method: 'POST',
    headers,
    body,
  });
  return { params: { provider }, request } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPaddleInertWarningForTests();
  loadEnvMock.mockReturnValue({ PADDLE_WEBHOOK_SECRET: 'configured-secret' });
  verifyPaddleSignatureMock.mockReturnValue(true);
  mapPaddleEventMock.mockReturnValue({ recognized: true, event: null });
  recordBillingEventMock.mockResolvedValue({ ok: true, duplicate: false, processed: undefined });
  markBillingEventProcessedMock.mockResolvedValue(undefined);
  applyBillingEventMock.mockResolvedValue({ ok: true });
});

describe('POST /api/webhooks/[provider] — routing', () => {
  it('404s with a JSON body for any provider other than paddle', async () => {
    const res = await POST(ctx('stripe'));

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
    expect(verifyPaddleSignatureMock).not.toHaveBeenCalled();
  });

  it('answers JSON on the paddle happy path', async () => {
    const res = await POST(ctx('paddle'));

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/webhooks/[provider] — cache safety (T7: never a shared cache)', () => {
  it('marks the wrong-provider 404 private, no-store', async () => {
    const res = await POST(ctx('stripe'));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('marks the inert 503 private, no-store', async () => {
    loadEnvMock.mockReturnValue({ PADDLE_WEBHOOK_SECRET: '' });
    const res = await POST(ctx('paddle'));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('marks the invalid-signature 401 private, no-store', async () => {
    verifyPaddleSignatureMock.mockReturnValue(false);
    const res = await POST(ctx('paddle', VALID_BODY, null));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('marks the happy-path 200 private, no-store', async () => {
    const res = await POST(ctx('paddle'));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/webhooks/paddle — inert (no secret configured)', () => {
  it('answers 503 without verifying any signature', async () => {
    loadEnvMock.mockReturnValue({ PADDLE_WEBHOOK_SECRET: '' });

    const res = await POST(ctx('paddle'));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'not_configured' });
    expect(verifyPaddleSignatureMock).not.toHaveBeenCalled();
  });

  it('also answers 503 when loadEnv itself throws', async () => {
    loadEnvMock.mockImplementation(() => {
      throw new Error('missing required env');
    });

    expect((await POST(ctx('paddle'))).status).toBe(503);
  });

  it('logs the inert warning once, not on every retry', async () => {
    loadEnvMock.mockReturnValue({ PADDLE_WEBHOOK_SECRET: '' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await POST(ctx('paddle'));
    await POST(ctx('paddle'));
    await POST(ctx('paddle'));

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('POST /api/webhooks/paddle — signature', () => {
  it('401s on an invalid/missing signature and records nothing', async () => {
    verifyPaddleSignatureMock.mockReturnValue(false);

    const res = await POST(ctx('paddle', VALID_BODY, null));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_signature' });
    expect(recordBillingEventMock).not.toHaveBeenCalled();
  });

  it('verifies against the EXACT raw body text, read before any parsing', async () => {
    await POST(ctx('paddle', VALID_BODY));

    expect(verifyPaddleSignatureMock).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: VALID_BODY, header: 'ts=1;h1=abc' }),
    );
  });
});

describe('POST /api/webhooks/paddle — malformed signed payload', () => {
  it('200s on a signed body that is not valid JSON (nothing to record)', async () => {
    const res = await POST(ctx('paddle', 'not-json{'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(recordBillingEventMock).not.toHaveBeenCalled();
  });

  it('200s when the signed JSON has no event_id/event_type', async () => {
    const res = await POST(ctx('paddle', JSON.stringify({ data: {} })));

    expect(res.status).toBe(200);
    expect(recordBillingEventMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/paddle — ledger + apply orchestration', () => {
  it('500s when the ledger cannot even record the event', async () => {
    recordBillingEventMock.mockResolvedValue({ ok: false, duplicate: false, error: 'db_error' });

    const res = await POST(ctx('paddle'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server_error' });
    expect(mapPaddleEventMock).not.toHaveBeenCalled();
  });

  it('200s a duplicate that was already processed, WITHOUT mapping or applying it again', async () => {
    recordBillingEventMock.mockResolvedValue({ ok: true, duplicate: true, processed: true });

    const res = await POST(ctx('paddle'));

    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(mapPaddleEventMock).not.toHaveBeenCalled();
    expect(applyBillingEventMock).not.toHaveBeenCalled();
  });

  it('re-applies a duplicate that was recorded but never processed (retry recovers from a prior failure)', async () => {
    recordBillingEventMock.mockResolvedValue({ ok: true, duplicate: true, processed: false });
    const event = { type: 'subscription.activated', eventId: 'evt_1' };
    mapPaddleEventMock.mockReturnValue({ recognized: true, event });

    const res = await POST(ctx('paddle'));

    expect(mapPaddleEventMock).toHaveBeenCalledTimes(1);
    expect(applyBillingEventMock).toHaveBeenCalledWith(event);
    expect(markBillingEventProcessedMock).toHaveBeenCalledWith('paddle', 'evt_1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('marks a recognized-but-unmapped event processed without applying anything', async () => {
    mapPaddleEventMock.mockReturnValue({ recognized: true, event: null });

    await POST(ctx('paddle'));

    expect(applyBillingEventMock).not.toHaveBeenCalled();
    expect(markBillingEventProcessedMock).toHaveBeenCalledWith('paddle', 'evt_1');
  });

  it('marks an unrecognized event_type processed without applying anything', async () => {
    mapPaddleEventMock.mockReturnValue({ recognized: false });

    const res = await POST(ctx('paddle'));

    expect(applyBillingEventMock).not.toHaveBeenCalled();
    expect(markBillingEventProcessedMock).toHaveBeenCalledWith('paddle', 'evt_1');
    expect(res.status).toBe(200);
  });

  it('applies a mapped event, then marks it processed, then 200s', async () => {
    const event = { type: 'subscription.activated', eventId: 'evt_1' };
    mapPaddleEventMock.mockReturnValue({ recognized: true, event });

    const res = await POST(ctx('paddle'));

    expect(applyBillingEventMock).toHaveBeenCalledWith(event);
    expect(markBillingEventProcessedMock).toHaveBeenCalledWith('paddle', 'evt_1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('200s but does NOT mark processed on a terminal data conflict (retrying cannot help)', async () => {
    mapPaddleEventMock.mockReturnValue({ recognized: true, event: { type: 'subscription.activated' } });
    applyBillingEventMock.mockResolvedValue({ ok: false, error: 'provider_ref_conflict' });

    const res = await POST(ctx('paddle'));

    expect(markBillingEventProcessedMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('500s (so Paddle retries) and does NOT mark processed on a transient/unknown apply failure', async () => {
    mapPaddleEventMock.mockReturnValue({ recognized: true, event: { type: 'subscription.activated' } });
    applyBillingEventMock.mockResolvedValue({ ok: false, error: 'db_error' });

    const res = await POST(ctx('paddle'));

    expect(markBillingEventProcessedMock).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'apply_failed' });
  });

  it('500s on an unavailable service-role client too (treated as transient/unknown)', async () => {
    mapPaddleEventMock.mockReturnValue({ recognized: true, event: { type: 'subscription.activated' } });
    applyBillingEventMock.mockResolvedValue({ ok: false, error: 'unavailable' });

    const res = await POST(ctx('paddle'));

    expect(markBillingEventProcessedMock).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it('records the event with the occurred_at carried on the payload', async () => {
    const body = JSON.stringify({
      event_id: 'evt_2',
      event_type: 'subscription.updated',
      occurred_at: '2024-04-12T10:18:49Z',
      data: {},
    });

    await POST(ctx('paddle', body));

    expect(recordBillingEventMock).toHaveBeenCalledWith({
      provider: 'paddle',
      eventId: 'evt_2',
      eventType: 'subscription.updated',
      occurredAt: '2024-04-12T10:18:49Z',
    });
  });
});
