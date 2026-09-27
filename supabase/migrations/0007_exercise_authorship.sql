-- Exercise authorship + lifecycle (feature: user-authored-exercises, slice 5).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0006_exercise_like_toggle.sql.
--
-- Replaces the single `published boolean` column with a three-axis model:
--   1. `status`   — WHERE the exercise is in its lifecycle (draft, live,
--                   auditing, needs_work, removed). The enum answers WHERE,
--                   never HOW or WHO — see docs/exercise-model.md.
--   2. hide pair  — `hidden_at`/`hidden_by`, all-or-nothing, the ONLY path to
--                   invisibility. Automatic auditing is a lifecycle move, not
--                   a visibility move (design.md §3, exercise-lifecycle spec).
--   3. `visible`  — a GENERATED, STORED column derived from the two above:
--                   `status in ('live','auditing') and hidden_at is null`.
--                   Every read site filters on THIS, never on `status`
--                   directly, so "is this exercise reachable" has exactly one
--                   answer in exactly one place.
--
-- Also adds `author_id` (ownership) and fixes the `updated_by` FK, which
-- today has no ON DELETE action and would block deleting a user who owns any
-- row at all (0003:25).
--
-- RISK IS BREADTH, NOT VOLUME: one row of data today, four readers
-- (src/lib/exercises.ts) broken simultaneously the moment `published` is
-- gone. This is why the whole migration AND the whole read-layer cutover
-- land in one commit — see the design doc's "Atomic read-layer cutover" note.
-- Do not split this file; do not refactor the four call sites in the same
-- commit into a shared helper — the one-token diff at each site is the
-- evidence that behavior did not change.
--
-- Order matters and is not incidental — see the numbered comments below and
-- design.md §3 ("Ordering — this order *is* the design").

begin;

-- ---------------------------------------------------------------------------
-- 1. NULLABLE first. NOT NULL with a default would stamp every row 'draft'
--    before the backfill below can read `published` — and by the time the
--    backfill ran every row would already (wrongly) say 'draft'.
-- ---------------------------------------------------------------------------
alter table public.exercises add column status text;

-- ---------------------------------------------------------------------------
-- 2. BACKFILL BEFORE THE DROP — the single highest-risk line in this file.
--    Once `published` is gone in step 7, the source of truth is gone with it.
-- ---------------------------------------------------------------------------
update public.exercises
   set status = case when published then 'live' else 'draft' end
 where status is null;

-- ---------------------------------------------------------------------------
-- 3. Only now can the column carry its constraints — every row already has a
--    value, so NOT NULL cannot abort, and the CHECK cannot reject a backfilled
--    row because both backfill values are in its domain.
-- ---------------------------------------------------------------------------
alter table public.exercises alter column status set not null;
alter table public.exercises alter column status set default 'draft';
alter table public.exercises add constraint exercises_status_valid
  check (status in ('draft', 'live', 'auditing', 'needs_work', 'removed'));

-- ---------------------------------------------------------------------------
-- 4. Audit + ownership. `published_at` is backfilled for rows that are
--    already `live`, so existing published content does not read as "just
--    published" nor as "never published" — both would be a lie about history
--    this migration has no way to reconstruct otherwise.
-- ---------------------------------------------------------------------------
alter table public.exercises add column published_at timestamptz;
update public.exercises set published_at = created_at where status = 'live';
alter table public.exercises add column hidden_at timestamptz;
alter table public.exercises add column hidden_by uuid references auth.users(id) on delete set null;
alter table public.exercises add column author_id uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. The hide pair is all-or-nothing, and only a row that WOULD otherwise be
--    visible can be hidden — hiding a draft or an already-removed row is
--    meaningless and would let `visible` compute the same `false` two
--    different ways, defeating the "exactly one answer" goal above.
-- ---------------------------------------------------------------------------
alter table public.exercises add constraint exercises_hidden_pair
  check (
    (hidden_at is null and hidden_by is null)
    or (hidden_at is not null and hidden_by is not null
        and status in ('live', 'auditing'))
  );

-- ---------------------------------------------------------------------------
-- 6. EXPLICITLY, never via `drop column ... cascade`. A cascading drop would
--    take this index down SILENTLY; if step 9 were then forgotten, the index
--    would simply be gone with no error anywhere in this file or in CI.
-- ---------------------------------------------------------------------------
drop index if exists public.exercises_level_focus_published_idx;

-- ---------------------------------------------------------------------------
-- 7. The old column dies. Everything that could still read it was captured
--    in steps 2 and 4.
-- ---------------------------------------------------------------------------
alter table public.exercises drop column published;

-- ---------------------------------------------------------------------------
-- 8. STORED IS LOAD-BEARING. Current Postgres versions require `STORED` to be
--    spelled explicitly (older behavior defaulted a generated column to
--    VIRTUAL and PG 12-17 made omitting the keyword a syntax error) — but an
--    omission that used to fail loudly now risks yielding the wrong column
--    KIND in silence on a version where it is still accepted. Verify with
--    the catalog query in this migration's own file-level test
--    (0007_exercise_authorship.test.ts) and paste `select a.attgenerated …`
--    output in the slice-5 PR body — `information_schema.columns.is_generated`
--    reports `ALWAYS` for BOTH stored and virtual and cannot tell them apart.
-- ---------------------------------------------------------------------------
alter table public.exercises add column visible boolean
  generated always as (status in ('live', 'auditing') and hidden_at is null) stored;

-- ---------------------------------------------------------------------------
-- 9. The partial index, on the new predicate, under a name that describes
--    what it actually indexes.
-- ---------------------------------------------------------------------------
create index exercises_level_focus_visible_idx
  on public.exercises (level, focus) where visible;

-- ---------------------------------------------------------------------------
-- 10. `updated_by` had NO on-delete action (0003:25), so today a user who
--     owns any row at all cannot be deleted from `auth.users` — Postgres
--     refuses the delete with a foreign-key violation. `on delete set null`
--     matches `hidden_by`/`author_id` above and satisfies the exercise-
--     lifecycle spec's "Account Deletion Preserves Exercises" requirement:
--     deleting the author succeeds and the row survives, referencing nothing.
-- ---------------------------------------------------------------------------
alter table public.exercises drop constraint exercises_updated_by_fkey;
alter table public.exercises add constraint exercises_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

commit;

-- =============================================================================
-- ROLLBACK — uncomment and run manually. Not executable as written, which is
-- the right friction for a destructive path (design.md §3, "Rollback"). One
-- row of data exists today, so the down path costs what the up path cost.
-- =============================================================================
--
-- begin;
--
-- drop index if exists public.exercises_level_focus_visible_idx;
-- alter table public.exercises drop column visible;
--
-- alter table public.exercises add column published boolean not null default false;
-- update public.exercises set published = (status = 'live');
--
-- create index if not exists exercises_level_focus_published_idx
--   on public.exercises (level, focus) where published;
--
-- alter table public.exercises drop constraint if exists exercises_hidden_pair;
-- alter table public.exercises drop constraint if exists exercises_status_valid;
--
-- alter table public.exercises drop column status;
-- alter table public.exercises drop column published_at;
-- alter table public.exercises drop column hidden_at;
-- alter table public.exercises drop column hidden_by;
-- alter table public.exercises drop column author_id;
--
-- alter table public.exercises drop constraint exercises_updated_by_fkey;
-- alter table public.exercises add constraint exercises_updated_by_fkey
--   foreign key (updated_by) references auth.users(id);
--
-- commit;
--
-- -- Then, together in the same rollback commit (design.md §3):
-- --   revert src/lib/exercises.ts:141,200,250,356 `.eq('visible', true)` ->
-- --     `.eq('published', true)`
-- --   revert src/lib/exercises.test.ts:161,360,427,645 assertions to
-- --     `toHaveBeenCalledWith('published', true)`
-- --   revert supabase/seeds/exercises_a1_test.sql:8 column list and value
