-- Moderator identity (feature: user-authored-exercises, slice 6).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0007_exercise_authorship.sql.
--
-- Many-to-many role assignment: a user can hold zero or more roles, and
-- role-gated access is always a ROLE CHECK (src/lib/roles.ts), never a
-- hardcoded user id (user-roles spec, "Server-Side Role Authorization").
--
-- Same security posture as every table before it: RLS enabled, ZERO
-- policies, only the service-role key (server-side) can read or write.

create table if not exists public.user_roles (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null check (role in ('moderator')),
  granted_at  timestamptz not null default now(),

  -- The primary key IS the uniqueness rule: a user cannot hold the same role
  -- twice, and its leftmost column (user_id) already serves the only query
  -- this table answers — "what roles does this user have?"
  -- (`where user_id = $1`). A secondary index on user_id alone would
  -- duplicate that prefix for zero benefit (0005's house rule: an unused
  -- index is write cost for nothing).
  primary key (user_id, role)
);

-- RLS on with no policies: only the service-role key (BYPASSRLS) reads or
-- writes this. The anon key gets nothing — a role assignment must never be
-- readable or writable by the browser.
alter table public.user_roles enable row level security;

-- BYPASSRLS does NOT bypass table-level GRANTs (the 0002 lesson, repeated at
-- every new table since): the server role needs them explicitly or every
-- query fails with 42501 while a SECURITY DEFINER write would still have
-- succeeded, which is a role check that fails OPEN — the one failure mode
-- src/lib/roles.ts exists to rule out.
grant select on table public.user_roles to service_role;
grant insert, update, delete on table public.user_roles to service_role;
