import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  mapPaddleEvent,
  PADDLE_TIMESTAMP_TOLERANCE_SECONDS,
  verifyPaddleSignature,
} from './paddle';

const SECRET = 'pdl_ntfset_test_secret';
const BODY = '{"event_id":"evt_1","event_type":"subscription.activated"}';

/** Builds a real `Paddle-Signature` header value the way Paddle itself does. */
function sign(ts: number, body: string, secret = SECRET): string {
  const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

describe('verifyPaddleSignature', () => {
  it('accepts a correctly-signed, fresh request', () => {
    const nowMs = 1_700_000_000_000;
    const header = sign(Math.floor(nowMs / 1000), BODY);

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const nowMs = 1_700_000_000_000;
    const header = sign(Math.floor(nowMs / 1000), BODY);

    expect(
      verifyPaddleSignature({ header, rawBody: BODY + 'tampered', secret: SECRET, nowMs }),
    ).toBe(false);
  });

  it('rejects a tampered h1', () => {
    const nowMs = 1_700_000_000_000;
    const ts = Math.floor(nowMs / 1000);
    const header = `ts=${ts};h1=${'0'.repeat(64)}`;

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(false);
  });

  it('accepts when the FIRST of two h1 candidates matches (secret rotation sends more than one h1)', () => {
    const nowMs = 1_700_000_000_000;
    const ts = Math.floor(nowMs / 1000);
    const validH1 = createHmac('sha256', SECRET).update(`${ts}:${BODY}`).digest('hex');
    const header = `ts=${ts};h1=${validH1};h1=${'0'.repeat(64)}`;

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(true);
  });

  it('accepts when the SECOND of two h1 candidates matches (secret rotation sends more than one h1)', () => {
    const nowMs = 1_700_000_000_000;
    const ts = Math.floor(nowMs / 1000);
    const validH1 = createHmac('sha256', SECRET).update(`${ts}:${BODY}`).digest('hex');
    const header = `ts=${ts};h1=${'0'.repeat(64)};h1=${validH1}`;

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(true);
  });

  it('rejects when NEITHER of two h1 candidates matches', () => {
    const nowMs = 1_700_000_000_000;
    const ts = Math.floor(nowMs / 1000);
    const header = `ts=${ts};h1=${'0'.repeat(64)};h1=${'1'.repeat(64)}`;

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const nowMs = 1_700_000_000_000;
    const header = sign(Math.floor(nowMs / 1000), BODY, 'a-different-secret');

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(false);
  });

  it('rejects a timestamp older than the tolerance', () => {
    const nowMs = 1_700_000_000_000;
    const staleTs = Math.floor(nowMs / 1000) - PADDLE_TIMESTAMP_TOLERANCE_SECONDS - 1;
    const header = sign(staleTs, BODY);

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(false);
  });

  it('rejects a timestamp from the future beyond the tolerance', () => {
    const nowMs = 1_700_000_000_000;
    const futureTs = Math.floor(nowMs / 1000) + PADDLE_TIMESTAMP_TOLERANCE_SECONDS + 1;
    const header = sign(futureTs, BODY);

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(false);
  });

  it('accepts a timestamp exactly at the tolerance boundary', () => {
    const nowMs = 1_700_000_000_000;
    const ts = Math.floor(nowMs / 1000) - PADDLE_TIMESTAMP_TOLERANCE_SECONDS;
    const header = sign(ts, BODY);

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: SECRET, nowMs })).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifyPaddleSignature({ header: null, rawBody: BODY, secret: SECRET })).toBe(false);
  });

  it('rejects a header with no ts', () => {
    expect(verifyPaddleSignature({ header: 'h1=abc', rawBody: BODY, secret: SECRET })).toBe(false);
  });

  it('rejects a header with no h1', () => {
    expect(verifyPaddleSignature({ header: 'ts=1700000000', rawBody: BODY, secret: SECRET })).toBe(false);
  });

  it('rejects an empty secret (unconfigured)', () => {
    const nowMs = 1_700_000_000_000;
    const header = sign(Math.floor(nowMs / 1000), BODY);

    expect(verifyPaddleSignature({ header, rawBody: BODY, secret: '', nowMs })).toBe(false);
  });
});

describe('mapPaddleEvent — subscriptions', () => {
  function subscriptionPayload(eventType: string, data: Record<string, unknown>) {
    return {
      event_id: 'evt_1',
      event_type: eventType,
      occurred_at: '2024-04-12T10:18:49.658605Z',
      data: {
        id: 'sub_123',
        customer_id: 'ctm_123',
        current_billing_period: { starts_at: '2024-04-12T10:18:47Z', ends_at: '2024-05-12T10:18:47Z' },
        custom_data: { userId: 'user-1' },
        ...data,
      },
    };
  }

  it('maps subscription.activated to an active SubscriptionStateEvent', () => {
    const result = mapPaddleEvent(subscriptionPayload('subscription.activated', { status: 'active' }));

    expect(result).toEqual({
      recognized: true,
      event: {
        provider: 'paddle',
        eventId: 'evt_1',
        eventType: 'subscription.activated',
        occurredAt: '2024-04-12T10:18:49.658605Z',
        type: 'subscription.activated',
        userId: 'user-1',
        providerRef: 'sub_123',
        providerCustomerRef: 'ctm_123',
        status: 'active',
        currentPeriodEnd: '2024-05-12T10:18:47Z',
      },
    });
  });

  it('maps subscription.trialing to a trialing SubscriptionStateEvent', () => {
    const result = mapPaddleEvent(subscriptionPayload('subscription.trialing', { status: 'trialing' }));

    expect(result.recognized).toBe(true);
    expect((result as { event: { status: string } }).event?.status).toBe('trialing');
  });

  it('leaves subscription.activated unmapped when custom_data.userId is missing', () => {
    const payload = subscriptionPayload('subscription.activated', { status: 'active', custom_data: null });

    expect(mapPaddleEvent(payload)).toEqual({ recognized: true, event: null });
  });

  it('maps subscription.updated when status is active/trialing/past_due', () => {
    const result = mapPaddleEvent(subscriptionPayload('subscription.updated', { status: 'past_due' }));

    expect(result.recognized).toBe(true);
    expect((result as { event: { type: string; status: string } }).event).toMatchObject({
      type: 'subscription.updated',
      status: 'past_due',
    });
  });

  it('leaves subscription.updated unmapped when status is paused (out of scope)', () => {
    const payload = subscriptionPayload('subscription.updated', { status: 'paused' });

    expect(mapPaddleEvent(payload)).toEqual({ recognized: true, event: null });
  });

  it('maps subscription.canceled, preserving null current_period_end as null (not a false period)', () => {
    const payload = subscriptionPayload('subscription.canceled', {
      status: 'canceled',
      current_billing_period: null,
    });

    const result = mapPaddleEvent(payload);
    expect(result.recognized).toBe(true);
    expect((result as { event: { type: string; status: string; currentPeriodEnd: string | null } }).event).toEqual(
      expect.objectContaining({ type: 'subscription.canceled', status: 'canceled', currentPeriodEnd: null }),
    );
  });

  it('maps subscription.past_due', () => {
    const result = mapPaddleEvent(subscriptionPayload('subscription.past_due', {}));

    expect(result.recognized).toBe(true);
    expect((result as { event: { type: string; status: string } }).event).toMatchObject({
      type: 'subscription.past_due',
      status: 'past_due',
    });
  });

  it('leaves subscription.created unmapped — entitlement comes from activated/trialing only', () => {
    expect(mapPaddleEvent(subscriptionPayload('subscription.created', { status: 'active' }))).toEqual({
      recognized: true,
      event: null,
    });
  });

  it('leaves subscription.paused unmapped (out of scope today)', () => {
    expect(mapPaddleEvent(subscriptionPayload('subscription.paused', { status: 'paused' }))).toEqual({
      recognized: true,
      event: null,
    });
  });
});

describe('mapPaddleEvent — transactions', () => {
  it('maps a one-time transaction.completed (no subscription_id) to purchase.completed', () => {
    const payload = {
      event_id: 'evt_2',
      event_type: 'transaction.completed',
      occurred_at: '2024-04-12T10:18:49Z',
      data: {
        id: 'txn_123',
        subscription_id: null,
        customer_id: 'ctm_123',
        custom_data: { userId: 'user-1', courseId: 'course-1' },
        details: { totals: { total: '1999', currency_code: 'USD' } },
      },
    };

    expect(mapPaddleEvent(payload)).toEqual({
      recognized: true,
      event: {
        provider: 'paddle',
        eventId: 'evt_2',
        eventType: 'transaction.completed',
        occurredAt: '2024-04-12T10:18:49Z',
        type: 'purchase.completed',
        userId: 'user-1',
        courseId: 'course-1',
        providerRef: 'txn_123',
        amountCents: 1999,
        currency: 'USD',
      },
    });
  });

  it('leaves a subscription-linked transaction.completed unmapped (entitlement already covered)', () => {
    const payload = {
      event_id: 'evt_3',
      event_type: 'transaction.completed',
      occurred_at: null,
      data: {
        id: 'txn_456',
        subscription_id: 'sub_123',
        custom_data: { userId: 'user-1' },
      },
    };

    expect(mapPaddleEvent(payload)).toEqual({ recognized: true, event: null });
  });

  it('leaves a one-time transaction.completed unmapped when courseId is missing from custom_data', () => {
    const payload = {
      event_id: 'evt_4',
      event_type: 'transaction.completed',
      occurred_at: null,
      data: {
        id: 'txn_789',
        subscription_id: null,
        custom_data: { userId: 'user-1' },
        details: { totals: { total: '500', currency_code: 'USD' } },
      },
    };

    expect(mapPaddleEvent(payload)).toEqual({ recognized: true, event: null });
  });
});

describe('mapPaddleEvent — adjustments (refunds)', () => {
  function adjustmentPayload(eventType: string, action: string, status: string) {
    return {
      event_id: 'evt_5',
      event_type: eventType,
      occurred_at: '2024-04-15T08:48:20Z',
      data: {
        id: 'adj_1',
        action,
        status,
        transaction_id: 'txn_123',
        subscription_id: null,
      },
    };
  }

  it('maps an approved refund on adjustment.created to refund.issued', () => {
    expect(mapPaddleEvent(adjustmentPayload('adjustment.created', 'refund', 'approved'))).toEqual({
      recognized: true,
      event: {
        provider: 'paddle',
        eventId: 'evt_5',
        eventType: 'adjustment.created',
        occurredAt: '2024-04-15T08:48:20Z',
        type: 'refund.issued',
        providerRef: 'txn_123',
      },
    });
  });

  it('maps an approved refund on adjustment.updated (pending_approval -> approved transition)', () => {
    const result = mapPaddleEvent(adjustmentPayload('adjustment.updated', 'refund', 'approved'));
    expect(result).toEqual({
      recognized: true,
      event: expect.objectContaining({ type: 'refund.issued', providerRef: 'txn_123' }),
    });
  });

  it('leaves a pending refund unmapped — nothing has moved yet', () => {
    expect(mapPaddleEvent(adjustmentPayload('adjustment.created', 'refund', 'pending_approval'))).toEqual({
      recognized: true,
      event: null,
    });
  });

  it('leaves a rejected refund unmapped', () => {
    expect(mapPaddleEvent(adjustmentPayload('adjustment.updated', 'refund', 'rejected'))).toEqual({
      recognized: true,
      event: null,
    });
  });

  it('leaves a credit adjustment unmapped (out of scope today)', () => {
    expect(mapPaddleEvent(adjustmentPayload('adjustment.created', 'credit', 'approved'))).toEqual({
      recognized: true,
      event: null,
    });
  });
});

describe('mapPaddleEvent — unrecognized input', () => {
  it('reports an unknown event_type as unrecognized', () => {
    const payload = { event_id: 'evt_6', event_type: 'customer.created', occurred_at: null, data: {} };

    expect(mapPaddleEvent(payload)).toEqual({ recognized: false });
  });

  it('reports a non-object payload as unrecognized', () => {
    expect(mapPaddleEvent('not-json')).toEqual({ recognized: false });
    expect(mapPaddleEvent(null)).toEqual({ recognized: false });
  });

  it('reports a payload missing event_id/event_type/data as unrecognized', () => {
    expect(mapPaddleEvent({ event_type: 'subscription.activated' })).toEqual({ recognized: false });
  });
});
