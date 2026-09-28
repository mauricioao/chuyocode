-- Activity views + submit-for-review support (PR D, "Activities practice").
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0011_activities.sql.
--
-- Two additions:
--
--   `activity_revisions.rights_accepted_at` -- set once, when the author
--   submits a revision for review (`POST /api/actividades/[id]/enviar`):
--   the timestamp of their confirmation that they have the right to use the
--   material in THAT revision. Nullable — a draft never submitted has none.
--
--   `public.activity_views` -- one row per (user, activity): how many times
--   a signed-in visitor has opened this activity's practice page
--   (`/[lang]/ingles/actividades/[id]`), written by the atomic
--   upsert-increment function `record_activity_view` below. A visitor who
--   has never opened the page has no row at all — "first time" is the
--   absence of a row, not a row with `view_count = 0`.
--
-- Same RLS posture as every table since `exercise_likes` (the 0002 lesson):
-- RLS on, zero policies, `service_role` only, with explicit table GRANTs
-- (BYPASSRLS does not imply them).

begin;

alter table public.activity_revisions
  add column rights_accepted_at timestamptz;

create table public.activity_views (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  activity_id     uuid        not null references public.activities(id) on delete cascade,
  view_count      int         not null default 1,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at  timestamptz not null default now(),
  primary key (user_id, activity_id)
);

alter table public.activity_views enable row level security;

grant select on table public.activity_views to service_role;
grant insert, update, delete on table public.activity_views to service_role;

-- ---------------------------------------------------------------------------
-- Atomic upsert-increment for a view.
-- ---------------------------------------------------------------------------
--
-- ONE round trip, race-free under concurrent requests from the SAME user
-- (two tabs opened at once): `on conflict ... do update` re-evaluates
-- `view_count + 1` against the row version the winning writer just
-- committed, same mechanism `increment_exercise_like` (0005) relies on for
-- its own `count = count + 1`.
--
-- SECURITY DEFINER so it can write `activity_views` despite RLS having no
-- policy for anyone but `service_role`; `set search_path = public` pins name
-- resolution (the 0008 lesson — an unpinned `search_path` in a SECURITY
-- DEFINER function is a privilege-escalation hole).
--
-- Postgres grants EXECUTE on a newly created function to PUBLIC by default,
-- unlike table privileges — so this function, unlike this codebase's earlier
-- SECURITY DEFINER functions, explicitly revokes that default before
-- granting `service_role` its own EXECUTE. Only the server (via the
-- service-role key) may ever call this; nobody else should be able to
-- increment a stranger's view counter directly through the API layer even
-- if RLS were ever loosened.
create or replace function public.record_activity_view(p_user uuid, p_activity uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  insert into public.activity_views (user_id, activity_id, view_count, first_viewed_at, last_viewed_at)
  values (p_user, p_activity, 1, now(), now())
  on conflict (user_id, activity_id) do update
    set view_count = public.activity_views.view_count + 1,
        last_viewed_at = now()
  returning view_count into new_count;

  return new_count;
end;
$$;

revoke all on function public.record_activity_view(uuid, uuid) from public;
-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon and authenticated explicitly; revoking from PUBLIC does not remove
-- those grants, and PostgREST would expose this as an RPC anyone could call
-- with any user id.
revoke all on function public.record_activity_view(uuid, uuid) from anon, authenticated;
grant execute on function public.record_activity_view(uuid, uuid) to service_role;

commit;
