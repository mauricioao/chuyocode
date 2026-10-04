import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PurchaseCompletedEvent, RefundIssuedEvent, SubscriptionStateEvent } from './events';

/**
 * Mocks `../supabase` the same way `src/lib/access.test.ts` and
 * `src/lib/courses/admin.test.ts` mock the service-role client: a fake
 * `createServiceClient` that either throws (key unconfigured) or returns an
 * object whose `from(table)` is a spy returning a purpose-built, per-test
 * chainable builder (see the `*Builder` factories below) — each mirrors
 * exactly the one chain `apply.ts` actually calls for that operation.
 */
const { clientState, fromMock } = vi.hoisted(() => ({
  clientState: { available: true },
  fromMock: vi.fn(),
}));

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import {
  applyBillingEvent,
  clearBillingClient,
  markBillingEventProcessed,
  recordBillingEvent,
  BILLING_EVENTS_TABLE,
} from './apply';
import { USER_SUBSCRIPTIONS_TABLE } from '../access';
import { COURSE_PURCHASES_TABLE } from '../courses/access';

/** `.insert(...)` / `.upsert(...)` called directly, resolving to `result`. */
function terminalBuilder(method: 'insert' | 'upsert', result: { error: unknown }) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {
    [method]: vi.fn((payload: unknown, options?: unknown) => {
      calls.push([payload, options]);
      return Promise.resolve(result);
    }),
  };
  return { builder, calls };
}

/** `.select(...).eq(...).maybeSingle()` — resolves only at `maybeSingle()`. */
function selectBuilder(result: { data: unknown; error: unknown }) {
  const eqArgs: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((...args: unknown[]) => {
    eqArgs.push(args);
    return builder;
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  return { builder, eqArgs };
}

/**
 * `.update(...).eq(...).eq(...)` or `.delete().eq(...).eq(...).eq(...)` —
 * a thenable chain, same trick `src/lib/access.test.ts` uses: every method
 * returns the SAME builder, and the builder itself resolves `result` when
 * finally awaited, regardless of how many `.eq()` calls preceded it.
 */
function chainBuilder(method: 'update' | 'delete', result: { error: unknown }) {
  const eqArgs: unknown[][] = [];
  const methodArgs: unknown[][] = [];
  const builder: Record<string, unknown> = {
    then: (onfulfilled: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  };
  builder[method] = vi.fn((...args: unknown[]) => {
    methodArgs.push(args);
    return builder;
  });
  builder.eq = vi.fn((...args: unknown[]) => {
    eqArgs.push(args);
    return builder;
  });
  return { builder, eqArgs, methodArgs };
}

const paddleMeta = { provider: 'paddle' as const, eventId: 'evt_1', eventType: 'x', occurredAt: null };

function subscriptionEvent(overrides: Partial<SubscriptionStateEvent> = {}): SubscriptionStateEvent {
  return {
    ...paddleMeta,
    type: 'subscription.activated',
    userId: 'user-1',
    providerRef: 'sub_123',
    providerCustomerRef: 'ctm_123',
    status: 'active',
    currentPeriodEnd: '2024-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function purchaseEvent(overrides: Partial<PurchaseCompletedEvent> = {}): PurchaseCompletedEvent {
  return {
    ...paddleMeta,
    type: 'purchase.completed',
    userId: 'user-1',
    courseId: 'course-1',
    providerRef: 'txn_123',
    amountCents: 1999,
    currency: 'USD',
    ...overrides,
  };
}

function refundEvent(overrides: Partial<RefundIssuedEvent> = {}): RefundIssuedEvent {
  return {
    ...paddleMeta,
    type: 'refund.issued',
    providerRef: 'txn_123',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  clearBillingClient();
});

describe('recordBillingEvent', () => {
  const input = {
    provider: 'paddle',
    eventId: 'evt_1',
    eventType: 'subscription.activated',
    occurredAt: '2024-01-01T00:00:00Z',
  };

  it('inserts the ledger row and reports no duplicate', async () => {
    const { builder, calls } = terminalBuilder('insert', { error: null });
    fromMock.mockReturnValueOnce(builder);

    const result = await recordBillingEvent(input);

    expect(fromMock).toHaveBeenCalledWith(BILLING_EVENTS_TABLE);
    expect(calls[0]?.[0]).toEqual({
      provider: 'paddle',
      event_id: 'evt_1',
      event_type: 'subscription.activated',
      occurred_at: '2024-01-01T00:00:00Z',
    });
    expect(result).toEqual({ ok: true, duplicate: false });
  });

  it('reports a duplicate (never a failure) on a unique violation', async () => {
    const { builder } = terminalBuilder('insert', { error: { code: '23505', message: 'duplicate key' } });
    fromMock.mockReturnValueOnce(builder);

    expect(await recordBillingEvent(input)).toEqual({ ok: true, duplicate: true });
  });

  it('fails on any other database error', async () => {
    const { builder } = terminalBuilder('insert', { error: { code: '42501', message: 'permission denied' } });
    fromMock.mockReturnValueOnce(builder);

    expect(await recordBillingEvent(input)).toEqual({ ok: false, duplicate: false, error: 'db_error' });
  });

  it('fails closed when the service-role key is unconfigured', async () => {
    clientState.available = false;

    expect(await recordBillingEvent(input)).toEqual({ ok: false, duplicate: false, error: 'unavailable' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('markBillingEventProcessed', () => {
  it('updates processed_at for the (provider, event_id) row', async () => {
    const { builder, eqArgs, methodArgs } = chainBuilder('update', { error: null });
    fromMock.mockReturnValueOnce(builder);

    await markBillingEventProcessed('paddle', 'evt_1');

    expect(fromMock).toHaveBeenCalledWith(BILLING_EVENTS_TABLE);
    expect(methodArgs[0]?.[0]).toHaveProperty('processed_at');
    expect(eqArgs).toEqual([['provider', 'paddle'], ['event_id', 'evt_1']]);
  });

  it('swallows a database error (logged, never throws)', async () => {
    const { builder } = chainBuilder('update', { error: { message: 'down' } });
    fromMock.mockReturnValueOnce(builder);

    await expect(markBillingEventProcessed('paddle', 'evt_1')).resolves.toBeUndefined();
  });

  it('is a no-op when the client is unavailable', async () => {
    clientState.available = false;

    await expect(markBillingEventProcessed('paddle', 'evt_1')).resolves.toBeUndefined();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('applyBillingEvent — subscription state', () => {
  it('upserts a brand-new subscription (no existing row) keyed on user_id', async () => {
    const { builder: select } = selectBuilder({ data: null, error: null });
    const { builder: upsert, calls } = terminalBuilder('upsert', { error: null });
    fromMock.mockReturnValueOnce(select).mockReturnValueOnce(upsert);

    const result = await applyBillingEvent(subscriptionEvent());

    expect(fromMock).toHaveBeenNthCalledWith(1, USER_SUBSCRIPTIONS_TABLE);
    expect(fromMock).toHaveBeenNthCalledWith(2, USER_SUBSCRIPTIONS_TABLE);
    expect(calls[0]?.[0]).toEqual({
      user_id: 'user-1',
      plan: 'premium',
      status: 'active',
      current_period_end: '2024-02-01T00:00:00.000Z',
      provider: 'paddle',
      provider_ref: 'sub_123',
      provider_customer_ref: 'ctm_123',
    });
    expect(calls[0]?.[1]).toEqual({ onConflict: 'user_id' });
    expect(result).toEqual({ ok: true });
  });

  it('preserves the stored current_period_end when canceled carries none', async () => {
    const { builder: select } = selectBuilder({
      data: { current_period_end: '2024-02-01T00:00:00.000Z' },
      error: null,
    });
    const { builder: upsert, calls } = terminalBuilder('upsert', { error: null });
    fromMock.mockReturnValueOnce(select).mockReturnValueOnce(upsert);

    await applyBillingEvent(
      subscriptionEvent({ type: 'subscription.canceled', status: 'canceled', currentPeriodEnd: null }),
    );

    expect(calls[0]?.[0]).toMatchObject({
      status: 'canceled',
      current_period_end: '2024-02-01T00:00:00.000Z',
    });
  });

  it('reports provider_ref_conflict on a unique violation instead of a generic db_error', async () => {
    const { builder: select } = selectBuilder({ data: null, error: null });
    const { builder: upsert } = terminalBuilder('upsert', { error: { code: '23505', message: 'dup' } });
    fromMock.mockReturnValueOnce(select).mockReturnValueOnce(upsert);

    expect(await applyBillingEvent(subscriptionEvent())).toEqual({
      ok: false,
      error: 'provider_ref_conflict',
    });
  });

  it('fails closed when the client is unavailable, with no query attempted', async () => {
    clientState.available = false;

    expect(await applyBillingEvent(subscriptionEvent())).toEqual({ ok: false, error: 'unavailable' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('applyBillingEvent — purchase completed', () => {
  it('upserts course_purchases keyed on (user_id, course_id)', async () => {
    const { builder, calls } = terminalBuilder('upsert', { error: null });
    fromMock.mockReturnValueOnce(builder);

    const result = await applyBillingEvent(purchaseEvent());

    expect(fromMock).toHaveBeenCalledWith(COURSE_PURCHASES_TABLE);
    expect(calls[0]?.[0]).toEqual({
      user_id: 'user-1',
      course_id: 'course-1',
      source: 'purchase',
      amount_cents: 1999,
      currency: 'USD',
      provider: 'paddle',
      provider_ref: 'txn_123',
    });
    expect(calls[0]?.[1]).toEqual({ onConflict: 'user_id,course_id' });
    expect(result).toEqual({ ok: true });
  });
});

describe('applyBillingEvent — refund issued', () => {
  it('deletes the matching purchase row by (provider, provider_ref, source=purchase)', async () => {
    const { builder, eqArgs, methodArgs } = chainBuilder('delete', { error: null });
    fromMock.mockReturnValueOnce(builder);

    const result = await applyBillingEvent(refundEvent());

    expect(fromMock).toHaveBeenCalledWith(COURSE_PURCHASES_TABLE);
    expect(methodArgs).toHaveLength(1);
    expect(eqArgs).toEqual([
      ['provider', 'paddle'],
      ['provider_ref', 'txn_123'],
      ['source', 'purchase'],
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('is a no-op (still ok) when nothing matches', async () => {
    const { builder } = chainBuilder('delete', { error: null });
    fromMock.mockReturnValueOnce(builder);

    expect(await applyBillingEvent(refundEvent({ providerRef: 'txn_unknown' }))).toEqual({ ok: true });
  });
});
