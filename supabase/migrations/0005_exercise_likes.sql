-- Exercise "like" counters (feature: likes on an exercise).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0004_exercises_focus.sql, and BEFORE using the /api/me-gusta/[id] endpoint.
--
-- This mirrors 0001_book_downloads.sql + 0002_book_downloads_grants.sql on
-- purpose — same shape, same security posture, same failure modes — with the
-- grants folded in FROM THE START rather than added later by a follow-up
-- migration. See the note under "Grants" for why that second migration existed.
--
-- It creates:
--   1. `exercise_likes`            — one row per exercise with a running count.
--   2. `increment_exercise_like()` — an atomic upsert-increment that RETURNS the
--      new count, so the server learns the authoritative number in the same
--      round trip that writes it.
--   3. The `service_role` grants both of those need.

-- ---------------------------------------------------------------------------
-- 1. The counter table
-- ---------------------------------------------------------------------------
--
-- KEYED ON THE EXERCISE'S PRIMARY KEY, NOT ITS SLUG. `slug` is unique per
-- `(level, focus)` and NOT globally (docs/exercise-model.md, "Deep links"), so a
-- slug-keyed counter would silently merge `spot-the-error` under
-- `present-perfect` with `spot-the-error` under `passive-voice` into one number.
--
-- The foreign key is doing real work beyond tidiness: the endpoint takes the id
-- from the BROWSER, so this constraint is what makes an invented uuid fail at
-- the database instead of quietly creating a counter for an exercise that does
-- not exist. That saves the server a "does this row exist?" round trip on every
-- like. `on delete cascade` keeps deleting an exercise from leaving an orphan.
create table if not exists public.exercise_likes (
  exercise_id uuid        primary key
                          references public.exercises (id) on delete cascade,
  count       bigint      not null default 0,
  updated_at  timestamptz not null default now()
);

-- NO `count desc` index here, unlike book_downloads. That index exists to serve
-- a "top N" ranking; likes are only ever read for ONE exercise, by primary key,
-- which the PK index already serves. An unused index is write cost for nothing.

-- ---------------------------------------------------------------------------
-- 2. The atomic increment
-- ---------------------------------------------------------------------------
--
-- Insert the exercise at 1, or bump the existing counter by 1 — one statement,
-- so concurrent likes never lose a count to a read-modify-write race.
--
-- IT RETURNS THE NEW COUNT. `increment_download` returns void because nothing
-- reads a book's counter back immediately; the like button DOES — it must show
-- the true number right after the click, and a separate SELECT afterwards would
-- both cost a second round trip and be able to disagree with the write it
-- follows.
--
-- The parameter is named `exercise`, not `exercise_id`: a parameter sharing a
-- column's name makes `on conflict (exercise_id)` an ambiguous reference.
--
-- SECURITY DEFINER so it runs with the function owner's rights, exactly like
-- `increment_download`. Callers still need EXECUTE on it (granted below).
create or replace function public.increment_exercise_like(exercise uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.exercise_likes (exercise_id, count)
  values (exercise, 1)
  on conflict (exercise_id)
  do update set count = exercise_likes.count + 1,
                updated_at = now()
  returning count;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS + grants
-- ---------------------------------------------------------------------------
--
-- Enable RLS with NO policies: only the service-role key (which bypasses RLS)
-- can touch this table. The anon key gets nothing, which is the whole point —
-- the browser must never be able to write this counter directly, or the number
-- means nothing at all.
alter table public.exercise_likes enable row level security;

-- WHY THE GRANTS ARE HERE AND NOT IN A LATER MIGRATION.
--   In Postgres, `service_role` has the BYPASSRLS attribute, so it skips Row
--   Level Security policies — but BYPASSRLS does NOT bypass table-level GRANTs.
--   A table created with `CREATE TABLE` from the SQL Editor is owned by
--   `postgres` and grants NOTHING to `service_role` automatically.
--
--   That asymmetry is what produced the bug 0002_book_downloads_grants.sql had
--   to fix: the SECURITY DEFINER increment ran with the owner's rights and wrote
--   happily (so rows existed), while a direct SELECT from the server ran as
--   `service_role` and failed with:
--     42501  permission denied for table book_downloads
--
--   Because that read is fail-safe, the symptom was a counter that was being
--   written and always displayed as empty. Granting up front is how this table
--   avoids repeating it.
grant select on table public.exercise_likes to service_role;
grant insert, update, delete on table public.exercise_likes to service_role;
grant execute on function public.increment_exercise_like(uuid) to service_role;
