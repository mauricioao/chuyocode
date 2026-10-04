/**
 * Idempotent entitlement writes for provider-agnostic billing events
 * (`src/lib/billing/events.ts`), plus the `billing_events` idempotency
 * ledger (`supabase/migrations/0019_billing_foundation.sql`) that
 * `src/pages/api/webhooks/[provider].ts` uses to skip re-applying a retried
 * webhook delivery.
 *
 * Every write goes through the service-role client — `user_subscriptions`,
 * `course_purchases`, and `billing_events` all have RLS on with zero
 * policies, so nothing here is reachable any other way (same posture as
 * `src/lib/courses/admin.ts`).
 *
 * "Idempotent" here means two things, deliberately layered:
 *   1. The webhook endpoint records each (provider, event_id) in
 *      `billing_events` before applying it, so a retried delivery of the
 *      SAME event is never applied twice (see `recordBillingEvent`).
 *   2. Even if it somehow were applied twice, every write below is an
 *      UPSERT keyed on the table's real identity (`user_id` for
 *      `user_subscriptions`, `(user_id, course_id)` for `course_purchases`)
 *      carrying the event's (provider, provider_ref) along — so applying the
 *      same external state twice converges on the same row instead of
 *      duplicating it. The partial unique index on (provider, provider_ref)
 *      from 0019 is the safety net: it rejects an attempt to link the same
 *      external subscription/transaction to a SECOND user_id, which would
 *      indicate a bug or a forged event rather than a legitimate retry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../supabase';
import { USER_SUBSCRIPTIONS_TABLE } from '../access';
import { COURSE_PURCHASES_TABLE } from '../courses/access';
import type { BillingEvent, PurchaseCompletedEvent, RefundIssuedEvent, SubscriptionStateEvent } from './events';

export const BILLING_EVENTS_TABLE = 'billing_events';

/**
 * Lazily-created service-role client — same pattern as `src/lib/access.ts`
 * and `src/lib/courses/admin.ts`: created on first use, not at module load,
 * so the app still boots with `SUPABASE_SERVICE_ROLE_KEY` unset (every
 * function below then fails closed instead of throwing at import time).
 */
let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

/** Test isolation only — see `src/lib/access.ts#clearAccessClient`. */
export function clearBillingClient(): void {
  serviceClient = null;
}

export type ApplyResult = { ok: true } | { ok: false; error: string };

export interface RecordEventInput {
  provider: string;
  eventId: string;
  eventType: string;
  occurredAt: string | null;
}

export interface RecordResult {
  ok: boolean;
  /** True when (provider, event_id) was already in the ledger — the caller must NOT apply the event again. */
  duplicate: boolean;
  error?: string;
}

/**
 * Insert `(provider, event_id)` into the ledger. A unique violation means
 * this exact event was already recorded by an earlier delivery — the caller
 * must treat that as `duplicate: true` and skip applying it again, never as
 * a failure.
 */
export async function recordBillingEvent(input: RecordEventInput): Promise<RecordResult> {
  const client = getClient();
  if (!client) return { ok: false, duplicate: false, error: 'unavailable' };

  try {
    const { error } = await client.from(BILLING_EVENTS_TABLE).insert({
      provider: input.provider,
      event_id: input.eventId,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
    });

    if (error) {
      if (error.code === '23505') {
        return { ok: true, duplicate: true };
      }
      console.error('[billing/apply] recordBillingEvent failed:', error.message);
      return { ok: false, duplicate: false, error: 'db_error' };
    }
    return { ok: true, duplicate: false };
  } catch (err) {
    console.error('[billing/apply] recordBillingEvent threw:', err);
    return { ok: false, duplicate: false, error: 'db_error' };
  }
}

/** Marks a previously-recorded event as processed. Best-effort: a failure here is logged, never thrown. */
export async function markBillingEventProcessed(provider: string, eventId: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const { error } = await client
      .from(BILLING_EVENTS_TABLE)
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', provider)
      .eq('event_id', eventId);

    if (error) {
      console.error('[billing/apply] markBillingEventProcessed failed:', error.message);
    }
  } catch (err) {
    console.error('[billing/apply] markBillingEventProcessed threw:', err);
  }
}

/**
 * Upserts `user_subscriptions` keyed on `user_id` (the table's real primary
 * key). `current_period_end` is read back first so an event that carries no
 * period end (Paddle nulls it on cancellation) PRESERVES the last known
 * value instead of blanking the grace-period check in `getPlan` relies on.
 *
 * ORDERING GUARD: webhook deliveries are not guaranteed to arrive in the
 * order the provider emitted them (retries, queueing, network jitter can all
 * reorder two deliveries). `provider_event_at` (0019) stores the `occurredAt`
 * of the last event actually applied; an incoming event strictly OLDER than
 * that is a stale, out-of-order delivery — e.g. a delayed `canceled` arriving
 * after a newer `activated` already granted access — and is skipped as a
 * successful no-op rather than reverting the row to stale state. An event
 * with no `occurredAt` (unknown time) can never be judged stale, so it always
 * applies; an equal timestamp also applies (idempotent re-delivery of the
 * exact same event).
 */
async function applySubscriptionState(
  client: SupabaseClient,
  event: SubscriptionStateEvent,
): Promise<ApplyResult> {
  try {
    const { data: existing, error: selectError } = await client
      .from(USER_SUBSCRIPTIONS_TABLE)
      .select('current_period_end, provider_event_at')
      .eq('user_id', event.userId)
      .maybeSingle();

    if (selectError) {
      console.error('[billing/apply] applySubscriptionState select failed:', selectError.message);
      return { ok: false, error: 'db_error' };
    }

    const existingRow = existing as Record<string, unknown> | null;
    const existingPeriodEnd = existingRow?.current_period_end as string | null | undefined;
    const existingProviderEventAt = (existingRow?.provider_event_at as string | null | undefined) ?? null;

    if (
      event.occurredAt != null &&
      existingProviderEventAt != null &&
      new Date(event.occurredAt).getTime() < new Date(existingProviderEventAt).getTime()
    ) {
      // Stale, out-of-order delivery: a newer state is already applied.
      // No-op, not a failure — the caller must still mark it processed.
      return { ok: true };
    }

    const currentPeriodEnd = event.currentPeriodEnd ?? existingPeriodEnd ?? null;
    const providerEventAt = event.occurredAt ?? existingProviderEventAt;

    const { error } = await client.from(USER_SUBSCRIPTIONS_TABLE).upsert(
      {
        user_id: event.userId,
        plan: 'premium',
        status: event.status,
        current_period_end: currentPeriodEnd,
        provider: event.provider,
        provider_ref: event.providerRef,
        provider_customer_ref: event.providerCustomerRef,
        provider_event_at: providerEventAt,
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      if (error.code === '23505') {
        console.error(
          '[billing/apply] applySubscriptionState: provider_ref already linked to a different user:',
          event.providerRef,
        );
        return { ok: false, error: 'provider_ref_conflict' };
      }
      console.error('[billing/apply] applySubscriptionState upsert failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[billing/apply] applySubscriptionState threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

/** Upserts `course_purchases` keyed on `(user_id, course_id)` (0017's existing unique constraint). */
async function applyPurchaseCompleted(
  client: SupabaseClient,
  event: PurchaseCompletedEvent,
): Promise<ApplyResult> {
  try {
    const { error } = await client.from(COURSE_PURCHASES_TABLE).upsert(
      {
        user_id: event.userId,
        course_id: event.courseId,
        source: 'purchase',
        amount_cents: event.amountCents,
        currency: event.currency,
        provider: event.provider,
        provider_ref: event.providerRef,
      },
      { onConflict: 'user_id,course_id' },
    );

    if (error) {
      if (error.code === '23505') {
        console.error(
          '[billing/apply] applyPurchaseCompleted: provider_ref already linked elsewhere:',
          event.providerRef,
        );
        return { ok: false, error: 'provider_ref_conflict' };
      }
      console.error('[billing/apply] applyPurchaseCompleted upsert failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[billing/apply] applyPurchaseCompleted threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

/**
 * Revokes a lifetime course entitlement by deleting the `course_purchases`
 * row that matches the ORIGINAL transaction. Scoped to `source = 'purchase'`
 * as a defense-in-depth guard so a refund can never remove an admin-granted
 * or promo entitlement (those never carry a `provider_ref` to match anyway).
 * No matching row (e.g. the refunded transaction was subscription-linked, not
 * a course purchase) is a no-op, not an error.
 */
async function applyRefundIssued(client: SupabaseClient, event: RefundIssuedEvent): Promise<ApplyResult> {
  try {
    const { error } = await client
      .from(COURSE_PURCHASES_TABLE)
      .delete()
      .eq('provider', event.provider)
      .eq('provider_ref', event.providerRef)
      .eq('source', 'purchase');

    if (error) {
      console.error('[billing/apply] applyRefundIssued failed:', error.message);
      return { ok: false, error: 'db_error' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[billing/apply] applyRefundIssued threw:', err);
    return { ok: false, error: 'db_error' };
  }
}

/** Applies one provider-agnostic billing event. Fails closed (never throws) — see each helper above. */
export async function applyBillingEvent(event: BillingEvent): Promise<ApplyResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'unavailable' };

  switch (event.type) {
    case 'subscription.activated':
    case 'subscription.updated':
    case 'subscription.canceled':
    case 'subscription.past_due':
      return applySubscriptionState(client, event);
    case 'purchase.completed':
      return applyPurchaseCompleted(client, event);
    case 'refund.issued':
      return applyRefundIssued(client, event);
  }
}
