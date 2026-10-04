-- Billing foundation: links `user_subscriptions` / `course_purchases` to an
-- external payment provider (Paddle Billing first; the columns below are
-- provider-agnostic) and adds an idempotency ledger for inbound webhooks.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0018_activity_view_dedupe.sql.
--
-- No Paddle account exists yet (see `src/lib/billing/`): this migration only
-- builds the data shape underneath that work, exactly like 0017_courses.sql
-- built the courses shape before anything linked to it.
--
-- Same security posture as every table since `exercise_likes` (the 0002
-- lesson): RLS enabled, ZERO policies, only the service-role key (BYPASSRLS)
-- reads or writes. The anon/authenticated key gets nothing.

begin;

-- --- user_subscriptions: link to an external provider's subscription -----
--
-- NULL `provider`/`provider_ref` is the existing shape (0010): a manual/test
-- grant with no billing provider behind it. Once set, (provider, provider_ref)
-- identifies the Paddle (or future provider) subscription this row mirrors.
--
-- `provider_event_at` is the ordering guard `src/lib/billing/apply.ts`
-- (`applySubscriptionState`) reads before writing: it stores the `occurred_at`
-- of the last provider event actually applied to this row, so a delayed,
-- out-of-order delivery (e.g. an older `subscription.canceled` arriving after
-- a newer `subscription.activated` already applied) is detected and skipped
-- instead of silently reverting the row to a stale state.
alter table public.user_subscriptions
  add column provider              text,
  add column provider_ref          text,
  add column provider_customer_ref text,
  add column provider_event_at     timestamptz;

-- Paddle (and presumably any future provider) can put a subscription into a
-- trialing state before the first charge — `status` must accept it, or
-- `src/lib/access.ts#getPlan` could never represent a trial as premium.
-- Extends the 0010 vocabulary; never narrows it.
alter table public.user_subscriptions drop constraint if exists user_subscriptions_status_check;
alter table public.user_subscriptions add constraint user_subscriptions_status_check
  check (status in ('active','trialing','canceled','past_due'));

-- One external subscription maps to exactly one user_subscriptions row.
-- Partial (provider_ref is not null) so any number of NULL/manual-grant rows
-- never collide with each other or with this index.
create unique index user_subscriptions_provider_ref_key
  on public.user_subscriptions (provider, provider_ref)
  where provider_ref is not null;

-- --- course_purchases: same linkage, columns already exist (0017) ---------
--
-- `provider`/`provider_ref` were already added in 0017_courses.sql for a
-- future purchase integration; this migration only adds the uniqueness that
-- integration needs — one external transaction maps to exactly one lifetime
-- entitlement row.
create unique index course_purchases_provider_ref_key
  on public.course_purchases (provider, provider_ref)
  where provider_ref is not null;

-- --- billing_events: idempotency ledger for inbound webhooks -------------
--
-- One row per (provider, event_id). The webhook endpoint
-- (`src/pages/api/webhooks/[provider].ts`) inserts a row BEFORE applying the
-- event; a unique violation on a retried delivery means "already seen" and
-- the endpoint skips re-applying it. `processed_at` is set only after the
-- entitlement write succeeds, so a row with `processed_at is null` means the
-- event was recorded but the apply step never finished (worth investigating,
-- never silently retried into a duplicate effect).
create table public.billing_events (
  id           uuid        primary key default gen_random_uuid(),
  provider     text        not null,
  event_id     text        not null,
  event_type   text        not null,
  occurred_at  timestamptz,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_events_provider_event_key unique (provider, event_id)
);

alter table public.billing_events enable row level security;
grant select on table public.billing_events to service_role;
grant insert, update, delete on table public.billing_events to service_role;

commit;
