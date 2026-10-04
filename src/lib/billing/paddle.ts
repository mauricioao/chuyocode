/**
 * Paddle Billing adapter: webhook signature verification + mapping Paddle's
 * own event payloads onto the provider-agnostic vocabulary in
 * `src/lib/billing/events.ts`. No Paddle account exists yet — this module is
 * exercised only by its own tests until `PADDLE_WEBHOOK_SECRET` is set (see
 * `src/pages/api/webhooks/[provider].ts`'s 503 inert path).
 *
 * Docs cited (Paddle Billing, not Classic):
 *   - Signature verification: https://developer.paddle.com/webhooks/signature-verification
 *   - Event overview / full type list: https://developer.paddle.com/webhooks/overview
 *   - subscription.activated payload: https://developer.paddle.com/webhooks/subscriptions/subscription-activated
 *   - subscription.canceled payload + access semantics: https://developer.paddle.com/webhooks/subscriptions/subscription-canceled
 *   - transaction.completed payload: https://developer.paddle.com/webhooks/transactions/transaction-completed
 *   - adjustment.created payload + action/status enums: https://developer.paddle.com/webhooks/adjustments/adjustment-created
 *   - adjustment.updated (pending_approval -> approved/rejected): https://developer.paddle.com/webhooks/adjustments/adjustment-updated
 *
 * SIGNATURE: the `Paddle-Signature` header is `ts=<unix-seconds>;h1=<hex>`.
 * Per the signature-verification doc, the signed payload is the timestamp and
 * the RAW request body "joined with a colon" (`` `${ts}:${rawBody}` ``) —
 * "don't transform or process the raw body of the request, including adding
 * whitespace or applying other formatting." That string is HMAC-SHA256'd
 * with the notification destination's secret and hex-encoded; Paddle's own
 * documented Node example compares with `timingSafeEqual`, and "the default
 * tolerance between the timestamp and the current time is five seconds."
 * The docs also note that "during secret rotation, more than one `h1` is
 * returned while secrets are rotated out" — the header's own grammar is a
 * `;`-separated list of `key=value` pairs, so this codebase parses that as a
 * repeated `h1=` pair and accepts the request if ANY candidate matches.
 *
 * EVENT MAPPING — see the PR description for the full table. Summary:
 *   - subscription.activated / subscription.trialing -> SubscriptionStateEvent
 *     ('active' / 'trialing') — the first real grant.
 *   - subscription.updated -> SubscriptionStateEvent only when `data.status`
 *     is active/trialing/past_due. `paused` and anything else are left
 *     unmapped (out of scope today; see events.ts).
 *   - subscription.canceled -> SubscriptionStateEvent ('canceled').
 *     `current_billing_period` is `null` on this event per Paddle (nulled on
 *     cancellation), so `currentPeriodEnd` is `null` here too — the apply
 *     step preserves whatever period end is already stored, which is what
 *     `getPlan`'s canceled-but-still-in-period grace rule reads.
 *   - subscription.past_due -> SubscriptionStateEvent ('past_due').
 *   - subscription.created / paused / resumed / imported -> unmapped.
 *     `created` is deliberately skipped: entitlement comes from
 *     activated/trialing, never from `created` alone (a subscription can be
 *     created in a future/draft state with no entitlement yet).
 *   - transaction.completed WITHOUT `data.subscription_id` -> PurchaseCompletedEvent
 *     (a true one-time course purchase). WITH a `subscription_id`, it is part
 *     of a subscription's own transaction history — entitlement is already
 *     covered by the subscription.* events — so it is unmapped.
 *   - adjustment.created / adjustment.updated with `action: 'refund'` AND
 *     `status: 'approved'` -> RefundIssuedEvent. `pending_approval` and
 *     `rejected` are unmapped (nothing has actually moved yet); credit /
 *     chargeback / chargeback_reverse / chargeback_warning are unmapped
 *     (out of scope today).
 *   - every other event_type -> unmapped. The endpoint still records it in
 *     `billing_events` for idempotency; it is simply never applied — this
 *     keeps the endpoint forward-compatible with new Paddle event types.
 *
 * The user is identified ONLY by `data.custom_data.userId`, set at checkout —
 * never by email (Paddle's own customer email can change, be reused, or not
 * match the ChuyoCode account that started checkout at all).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillingEvent, SubscriptionStatus } from './events';

/** Header Paddle sends the signature on. `Headers.get` is case-insensitive, so lower-case is fine. */
export const PADDLE_SIGNATURE_HEADER = 'paddle-signature';

/** Paddle's documented default replay-protection tolerance, in seconds, either direction. */
export const PADDLE_TIMESTAMP_TOLERANCE_SECONDS = 5;

interface ParsedSignature {
  ts: string;
  /**
   * Every `h1` candidate the header carried, in header order. Normally one —
   * but Paddle's own docs say "during secret rotation, more than one `h1` is
   * returned while secrets are rotated out", so the header can repeat the
   * `h1=` pair (the same `;`-separated `key=value` grammar as `ts`). ANY
   * candidate matching is a valid signature.
   */
  h1: string[];
}

/** Splits a `Paddle-Signature` header (`ts=...;h1=...`, possibly with more than one `h1`) into its parts. `null` for anything malformed. */
function parseSignatureHeader(header: string): ParsedSignature | null {
  let ts: string | null = null;
  const h1: string[] = [];

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') ts = value;
    if (key === 'h1') h1.push(value);
  }

  if (!ts || h1.length === 0) return null;
  return { ts, h1 };
}

export interface VerifyPaddleSignatureParams {
  /** The raw `Paddle-Signature` header value, or `null` if the request carried none. */
  header: string | null;
  /** The EXACT, unparsed request body text — never a re-serialized/reformatted copy. */
  rawBody: string;
  /** The notification destination's secret (`PADDLE_WEBHOOK_SECRET`). */
  secret: string;
  /** Injectable clock (epoch ms) for deterministic tests. Defaults to `Date.now()`. */
  nowMs?: number;
}

/**
 * Verifies a Paddle webhook signature exactly as documented: parse `ts` and
 * every `h1` candidate, recompute `HMAC-SHA256(` `${ts}:${rawBody}` `,
 * secret)` as hex, and accept if ANY `h1` candidate matches it in constant
 * time (secret rotation sends more than one; see {@link ParsedSignature}).
 * Also rejects a timestamp more than {@link PADDLE_TIMESTAMP_TOLERANCE_SECONDS}
 * away from now (replay/staleness protection, either direction). Fails
 * closed (`false`) for every malformed input — missing header, missing
 * secret, unparsable header, non-numeric `ts`.
 */
export function verifyPaddleSignature(params: VerifyPaddleSignatureParams): boolean {
  const { header, rawBody, secret } = params;
  if (!header || secret.length === 0) return false;

  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const tsSeconds = Number(parsed.ts);
  if (!Number.isFinite(tsSeconds)) return false;

  const nowSeconds = (params.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - tsSeconds) > PADDLE_TIMESTAMP_TOLERANCE_SECONDS) return false;

  const expectedHex = createHmac('sha256', secret).update(`${parsed.ts}:${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'utf8');

  // Each candidate is compared in constant time (same length check as
  // before, now per-candidate); ANY match accepts the request.
  return parsed.h1.some((candidate) => {
    const candidateBuf = Buffer.from(candidate, 'utf8');
    if (expectedBuf.length !== candidateBuf.length) return false;
    return timingSafeEqual(expectedBuf, candidateBuf);
  });
}

/** Outcome of mapping one Paddle webhook payload. */
export type PaddleMapResult =
  | { recognized: true; event: BillingEvent }
  /** A known, intentionally-ignored shape (e.g. a subscription transaction, a still-pending refund). */
  | { recognized: true; event: null }
  /** An unknown/malformed event_type, or a payload too malformed to read at all. */
  | { recognized: false };

const UNMAPPED: PaddleMapResult = { recognized: true, event: null };
const UNRECOGNIZED: PaddleMapResult = { recognized: false };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** A non-empty string, or `null`. Used where an empty id must not be treated as a real one. */
function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** RFC 4122 shape (8-4-4-4-12 hex), case-insensitive — matches a Postgres/Supabase `uuid` column. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A syntactically valid UUID string, or `null`. Used ONLY for
 * `custom_data.userId`/`courseId` (see {@link readCustomData}): unlike
 * `asId`, which accepts any of PADDLE's own id formats (`sub_...`,
 * `txn_...`, never UUIDs), these two are CHUYOCODE's own ids, always UUIDs
 * (Supabase `uuid` primary keys) — a value that is not even shaped like one
 * is never trusted, and the event is left unmapped rather than resolving an
 * arbitrary client-influenced string to a user or course.
 */
function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

/** Any string (including `''`), or `null` — for fields where "absent" and "empty" are both just "no value". */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads `data.custom_data.{userId,courseId}` — the ONLY place a user/course
 * is ever resolved from. Both must be real UUIDs (`asUuid`), not just any
 * non-empty string — an id that is not even shaped like one of ours is
 * never trusted, and the caller treats a `null` the same as "missing".
 *
 * 🔴 WHEN CHECKOUT CREATION IS BUILT: `custom_data.userId` must be set
 * SERVER-SIDE from the authenticated session that starts checkout — never
 * taken from client input. This is the only identity this module trusts;
 * a forged `userId` here would let one visitor grant premium access (or a
 * course purchase) to a different, arbitrary account.
 */
function readCustomData(data: Record<string, unknown>): { userId: string | null; courseId: string | null } {
  const custom = asRecord(data.custom_data);
  if (!custom) return { userId: null, courseId: null };
  return { userId: asUuid(custom.userId), courseId: asUuid(custom.courseId) };
}

function readCurrentPeriodEnd(data: Record<string, unknown>): string | null {
  const period = asRecord(data.current_billing_period);
  return period ? asNullableString(period.ends_at) : null;
}

/** `subscription.updated`'s `data.status` values this codebase currently acts on. `paused`/anything else: unmapped. */
function mapUpdatedStatus(value: unknown): Extract<SubscriptionStatus, 'active' | 'trialing' | 'past_due'> | null {
  return value === 'active' || value === 'trialing' || value === 'past_due' ? value : null;
}

/**
 * Maps one parsed Paddle webhook payload (`JSON.parse`d body) to this
 * codebase's provider-agnostic {@link BillingEvent}, or reports that it is
 * intentionally unmapped / unrecognized. Never throws: any unexpected shape
 * resolves to {@link UNRECOGNIZED} or {@link UNMAPPED}, logged, not thrown —
 * the endpoint still needs to answer 200 for a validly-signed request it
 * cannot act on.
 */
export function mapPaddleEvent(payload: unknown): PaddleMapResult {
  const root = asRecord(payload);
  if (!root) return UNRECOGNIZED;

  const eventType = asId(root.event_type);
  const eventId = asId(root.event_id);
  const occurredAt = asNullableString(root.occurred_at);
  const data = asRecord(root.data);

  if (!eventType || !eventId || !data) return UNRECOGNIZED;

  const meta = { provider: 'paddle' as const, eventId, eventType, occurredAt };

  switch (eventType) {
    case 'subscription.activated':
    case 'subscription.trialing': {
      const providerRef = asId(data.id);
      const { userId } = readCustomData(data);
      if (!providerRef || !userId) {
        console.error(`[billing/paddle] ${eventType}: missing subscription id or custom_data.userId`);
        return UNMAPPED;
      }
      return {
        recognized: true,
        event: {
          ...meta,
          type: 'subscription.activated',
          userId,
          providerRef,
          providerCustomerRef: asNullableString(data.customer_id),
          status: eventType === 'subscription.trialing' ? 'trialing' : 'active',
          currentPeriodEnd: readCurrentPeriodEnd(data),
        },
      };
    }

    case 'subscription.updated': {
      const status = mapUpdatedStatus(data.status);
      if (!status) return UNMAPPED;
      const providerRef = asId(data.id);
      const { userId } = readCustomData(data);
      if (!providerRef || !userId) {
        console.error('[billing/paddle] subscription.updated: missing subscription id or custom_data.userId');
        return UNMAPPED;
      }
      return {
        recognized: true,
        event: {
          ...meta,
          type: 'subscription.updated',
          userId,
          providerRef,
          providerCustomerRef: asNullableString(data.customer_id),
          status,
          currentPeriodEnd: readCurrentPeriodEnd(data),
        },
      };
    }

    case 'subscription.canceled':
    case 'subscription.past_due': {
      const providerRef = asId(data.id);
      const { userId } = readCustomData(data);
      if (!providerRef || !userId) {
        console.error(`[billing/paddle] ${eventType}: missing subscription id or custom_data.userId`);
        return UNMAPPED;
      }
      return {
        recognized: true,
        event: {
          ...meta,
          type: eventType === 'subscription.canceled' ? 'subscription.canceled' : 'subscription.past_due',
          userId,
          providerRef,
          providerCustomerRef: asNullableString(data.customer_id),
          status: eventType === 'subscription.canceled' ? 'canceled' : 'past_due',
          currentPeriodEnd: readCurrentPeriodEnd(data),
        },
      };
    }

    case 'transaction.completed': {
      if (asId(data.subscription_id)) {
        // Part of a subscription's own transaction history; the
        // subscription.* events already cover entitlement for this.
        return UNMAPPED;
      }
      const providerRef = asId(data.id);
      const { userId, courseId } = readCustomData(data);
      if (!providerRef || !userId || !courseId) {
        console.error(
          '[billing/paddle] transaction.completed: missing transaction id or custom_data.userId/courseId',
        );
        return UNMAPPED;
      }
      const totals = asRecord(asRecord(data.details)?.totals);
      const totalRaw = totals?.total;
      const amountCents =
        typeof totalRaw === 'string' ? asFiniteNumber(Number(totalRaw)) : asFiniteNumber(totalRaw);
      return {
        recognized: true,
        event: {
          ...meta,
          type: 'purchase.completed',
          userId,
          courseId,
          providerRef,
          amountCents,
          currency: asNullableString(totals?.currency_code ?? null),
        },
      };
    }

    case 'subscription.created':
    case 'subscription.paused':
    case 'subscription.resumed':
    case 'subscription.imported':
      // Recognized Paddle event types, deliberately not acted on today:
      // `created` carries no entitlement by itself (see the module header),
      // and paused/resumed/imported are out of scope until a pause/resume
      // product flow exists. Distinct from the `default` branch below, which
      // is for event types this codebase has no knowledge of at all.
      return UNMAPPED;

    case 'adjustment.created':
    case 'adjustment.updated': {
      if (data.action !== 'refund' || data.status !== 'approved') {
        // pending_approval / rejected: nothing has moved yet. credit /
        // chargeback / chargeback_reverse / chargeback_warning: out of scope.
        return UNMAPPED;
      }
      const providerRef = asId(data.transaction_id);
      if (!providerRef) {
        console.error(`[billing/paddle] ${eventType}: approved refund with no transaction_id`);
        return UNMAPPED;
      }
      return { recognized: true, event: { ...meta, type: 'refund.issued', providerRef } };
    }

    default:
      return UNRECOGNIZED;
  }
}
