-- Premium plan entitlement (Login step 1b: user menu plan badge).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0008_user_roles.sql.
--
-- One row per subscribed user, keyed on `user_id` itself (no surrogate id):
-- the only query this table answers is "what plan is this user on?"
-- (`where user_id = $1`), same reasoning as `user_roles`'s primary key.
--
-- `current_period_end` is NULLABLE on purpose: null means "no end date", the
-- shape a manually/test-granted subscription takes when there is no billing
-- cycle behind it. `src/lib/access.ts#getPlan` reads this table and treats a
-- row as premium only when `status = 'active'` AND (`current_period_end` is
-- null OR still in the future) — anything else, including a missing row or a
-- failed query, fails CLOSED to the free plan.
--
-- Same security posture as every table since `exercise_likes` (the 0002
-- lesson): RLS enabled, ZERO policies, only the service-role key (server-side)
-- reads or writes. The anon key gets nothing.

begin;

create table public.user_subscriptions (
  user_id            uuid        primary key references auth.users(id) on delete cascade,
  plan               text        not null check (plan in ('premium')),
  status             text        not null check (status in ('active','canceled','past_due')),
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- RLS on with no policies: only the service-role key (BYPASSRLS) reads or
-- writes this. The anon key gets nothing — a subscription must never be
-- readable or writable by the browser.
alter table public.user_subscriptions enable row level security;

-- BYPASSRLS does NOT bypass table-level GRANTs (the 0002 lesson, repeated at
-- every new table since): the server role needs them explicitly or every
-- query fails with 42501 while a SECURITY DEFINER write would still have
-- succeeded, which is a check that fails OPEN — the one failure mode
-- src/lib/access.ts#getPlan exists to rule out.
grant select on table public.user_subscriptions to service_role;
grant insert, update, delete on table public.user_subscriptions to service_role;

commit;
