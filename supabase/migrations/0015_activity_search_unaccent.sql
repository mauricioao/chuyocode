-- Accent-insensitive community search ("Descubrir", `?q=`).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0014_activity_discovery.sql.
--
-- `0014_activity_discovery.sql`'s `activities_title_trgm_idx` (a trigram GIN
-- index over `activities.title`, queried via `ilike`) is already
-- case-insensitive (`ilike` itself), but NOT accent-insensitive: a search
-- for "cancion" never matched a title of "Canción", and vice versa.
--
-- Fix, PREFERRED approach per the owner's own instruction (a stored
-- generated column, not a query-time function call on every row):
--
--   `extensions.unaccent` — Postgres' own accent-stripping extension.
--   Supabase's convention keeps extensions OUT of `public`, in `extensions`
--   (same posture as `pg_trgm`, 0014).
--
--   `public.immutable_unaccent(text)` — a thin IMMUTABLE wrapper around
--   `unaccent()`. `unaccent()` itself is only STABLE (it depends on the
--   dictionary search path), which a GENERATED COLUMN expression flatly
--   refuses — Postgres requires every expression in a `generated always as`
--   clause to be IMMUTABLE. Pinning the dictionary explicitly
--   (`'extensions.unaccent'::regdictionary`, the same one `create extension
--   unaccent` installs) makes the wrapper's OWN result deterministic for a
--   given input, which is what IMMUTABLE actually promises here — same
--   trick Postgres' own docs recommend for this exact situation.
--
--   `activities.title_search` — a STORED generated column,
--   `lower(public.immutable_unaccent(title))`: computed once per write (not
--   once per search query), and indexable like any ordinary column. A
--   trigram GIN index over IT (mirroring `activities_title_trgm_idx`'s own
--   shape) backs `title_search ilike '%…%'`, which
--   `getPublishedActivities` (`@lib/activities/activities`) now queries
--   instead of `title` directly — the caller folds its own search input the
--   same way (`buildTitleIlikePattern`, `@lib/activities/discoveryQuery`:
--   lowercase, then `normalizeAccents` — the same NFD-decompose-then-strip
--   trick in TypeScript that `unaccent()` performs in SQL) so "cancion" and
--   "canción" both match a title of "Canción".
--
--   The OLD plain-`title` trigram index stays — nothing else in this
--   codebase queries it, but dropping a still-valid index is a separate,
--   unrelated cleanup this migration does not need to make to fix the
--   accent bug.
--
-- Same RLS/grant posture as every migration since `exercise_likes` (the 0002
-- lesson) and the function-EXECUTE lesson every migration since
-- `0012_activity_views.sql` documents: `revoke … from public, anon,
-- authenticated` before granting `service_role` its own EXECUTE, because
-- Supabase grants EXECUTE on a freshly created function to anon/authenticated
-- by default. `immutable_unaccent` is only ever invoked as part of computing
-- the GENERATED column above (by whichever role performs the INSERT/UPDATE
-- on `activities` — `service_role`, same as every other write path in this
-- codebase) — a reader never calls it directly, so the revoke/grant below is
-- the same hygiene rule as always, not a read-path requirement.

begin;

-- ---------------------------------------------------------------------------
-- 1. unaccent extension
-- ---------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. immutable_unaccent — an IMMUTABLE wrapper, usable in a generated column
-- ---------------------------------------------------------------------------
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

revoke all on function public.immutable_unaccent(text) from public;
revoke all on function public.immutable_unaccent(text) from anon, authenticated;
grant execute on function public.immutable_unaccent(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. activities.title_search — stored generated column + its own trigram index
-- ---------------------------------------------------------------------------
alter table public.activities
  add column title_search text generated always as (lower(public.immutable_unaccent(title))) stored;

create index activities_title_search_trgm_idx
  on public.activities using gin (title_search extensions.gin_trgm_ops);

commit;
