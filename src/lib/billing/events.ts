/**
 * Provider-agnostic billing events (design: `supabase/migrations/0019_billing_foundation.sql`).
 *
 * `src/lib/billing/paddle.ts` maps Paddle Billing's own webhook payloads onto
 * these types; `src/lib/billing/apply.ts` applies them to `user_subscriptions`
 * / `course_purchases`. Nothing in this module talks to Paddle, Supabase, or
 * any I/O — it is the shared vocabulary between the two, so a second provider
 * (if one is ever added) only needs its own mapper, never a second apply path.
 *
 * 🔴 THE USER IS CARRIED AS `userId` ONLY. Every event below is identified by
 * a ChuyoCode user id, resolved by the provider adapter from the checkout's
 * custom data — never by email. See the Paddle adapter's header for why.
 */

/** Billing providers this codebase knows how to map. Paddle Billing first. */
export type BillingProvider = 'paddle';

/**
 * Mirrors `user_subscriptions.status` (`0019_billing_foundation.sql`):
 * `'trialing'` was added there specifically so a Paddle trial can be
 * represented without inventing a fifth, ChuyoCode-only status.
 */
export type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'past_due';

/** Fields every billing event carries, regardless of provider or kind. */
interface BillingEventMeta {
  provider: BillingProvider;
  /** The provider's own event id — the `billing_events` ledger's dedupe key. */
  eventId: string;
  /** The provider's own event type string (e.g. `subscription.activated`), kept for logging/the ledger. */
  eventType: string;
  /** When the provider says this happened (ISO 8601), or `null` if the payload omitted it. */
  occurredAt: string | null;
}

/**
 * A subscription's entitlement-relevant state changed (activation, a status
 * change, cancellation, or a failed renewal). All four share one shape and
 * one apply path (`applySubscriptionState`) because the write is identical —
 * only `status` (and, for an active/trialing event, the refreshed period end)
 * differs.
 *
 * `currentPeriodEnd: null` means "the provider did not send a period end for
 * this event" (e.g. Paddle nulls it on cancellation) — the apply step
 * PRESERVES whatever is already stored rather than blanking it, since that
 * stored value is exactly what the canceled/past_due grace-period check in
 * `src/lib/access.ts#getPlan` needs.
 */
export interface SubscriptionStateEvent extends BillingEventMeta {
  type: 'subscription.activated' | 'subscription.updated' | 'subscription.canceled' | 'subscription.past_due';
  userId: string;
  /** The provider's subscription id (e.g. Paddle's `sub_...`). */
  providerRef: string;
  /** The provider's customer id (e.g. Paddle's `ctm_...`), or null if unknown. */
  providerCustomerRef: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

/** A one-time course purchase (not a subscription transaction) completed. */
export interface PurchaseCompletedEvent extends BillingEventMeta {
  type: 'purchase.completed';
  userId: string;
  courseId: string;
  /** The provider's transaction id (e.g. Paddle's `txn_...`). */
  providerRef: string;
  amountCents: number | null;
  currency: string | null;
}

/**
 * A completed course purchase was refunded. Scoped to `course_purchases`
 * only (lifetime, one-time entitlements) — a subscription's own lifecycle is
 * governed entirely by the subscription.* events above, never by a refund of
 * one of its transactions.
 */
export interface RefundIssuedEvent extends BillingEventMeta {
  type: 'refund.issued';
  /** The ORIGINAL transaction id being refunded — matches the `course_purchases.provider_ref` set at purchase time. */
  providerRef: string;
}

export type BillingEvent = SubscriptionStateEvent | PurchaseCompletedEvent | RefundIssuedEvent;
