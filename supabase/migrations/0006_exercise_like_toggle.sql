-- Un-liking an exercise: the decrement half of the like toggle.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0005_exercise_likes.sql.
--
-- WHY THIS IS A NEW FILE AND NOT AN EDIT TO 0005. A migration that has been
-- handed out is history, even if nobody has run it yet. The moment two people
-- can hold different versions of "0005", the file name stops identifying a known
-- database state and every later migration inherits that ambiguity. Adding
-- 0006 costs one file; editing 0005 costs the ability to reason about any
-- environment you did not personally set up.
--
-- It creates:
--   1. A CHECK constraint making a negative counter impossible at the table.
--   2. `decrement_exercise_like()` — the mirror of `increment_exercise_like()`,
--      floored at zero, returning the new count in the same round trip.
--   3. The `service_role` grant the new function needs.

-- ---------------------------------------------------------------------------
-- 1. The floor, as a table invariant
-- ---------------------------------------------------------------------------
--
-- THE FLOOR BELONGS IN THE DATABASE, NOT ONLY IN THE FUNCTION. The function
-- below already clamps, so this constraint should never fire — which is exactly
-- why it is worth having. It converts "every writer remembered to clamp" from a
-- convention that the next writer can forget into a rule the database enforces.
-- A displayed "-1" is the kind of bug that reaches a screenshot before it
-- reaches a log; a constraint violation reaches the log first.
--
-- Existing rows are all `>= 0` (the column starts at 0 and only ever grew), so
-- this validates without a rewrite.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_likes_count_non_negative'
  ) then
    alter table public.exercise_likes
      add constraint exercise_likes_count_non_negative check (count >= 0);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The atomic decrement
-- ---------------------------------------------------------------------------
--
-- 🔴 TWO CONCURRENT DECREMENTS MUST NOT PRODUCE -1, AND THIS IS WHY THEY CANNOT.
-- The clamp lives INSIDE the UPDATE's SET expression, not in a read-then-write
-- pair. Under READ COMMITTED, a second UPDATE that finds the row locked waits
-- for the first to commit, then re-reads the new row version and RE-EVALUATES
-- the SET expression against it — the same mechanism that makes `count = count +
-- 1` safe. So from a count of 1 the two calls settle on 0 and
-- `greatest(0 - 1, 0)` = 0, never -1. Computing the new value in the server and
-- sending a literal WOULD race, which is precisely the shape avoided here.
--
-- NO ROW IS A REAL ZERO, NOT A FAILURE. The row is created by the first like,
-- so an exercise nobody has liked has no row at all; a decrement against it is a
-- no-op whose honest answer is 0. The `coalesce` makes that explicit and makes
-- the function TOTAL: it always returns a non-negative bigint. That keeps `null`
-- in the calling layer meaning one single thing — "the call failed" — instead of
-- being overloaded with "there was nothing to decrement".
--
-- The parameter is named `exercise`, not `exercise_id`, for the same reason as
-- in 0005: a parameter sharing a column's name makes the WHERE clause ambiguous.
--
-- SECURITY DEFINER, mirroring the increment. Callers still need EXECUTE.
create or replace function public.decrement_exercise_like(exercise uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.exercise_likes
       set count = greatest(public.exercise_likes.count - 1, 0),
           updated_at = now()
     where exercise_id = exercise
    returning count as new_count
  )
  select coalesce((select new_count from updated), 0::bigint);
$$;

-- ---------------------------------------------------------------------------
-- 3. Grant
-- ---------------------------------------------------------------------------
--
-- `service_role` has BYPASSRLS, which skips policies but NOT table-level or
-- function-level GRANTs (the asymmetry that cost 0002 an entire follow-up
-- migration). The table grants from 0005 still stand; only the new function
-- needs one.
grant execute on function public.decrement_exercise_like(uuid) to service_role;
