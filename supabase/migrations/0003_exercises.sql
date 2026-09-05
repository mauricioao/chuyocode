-- English exercises store (feature: english-exercises-section).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0002_book_downloads_grants.sql. It creates the single `exercises` table that
-- backs every mechanic — multiple choice, fill-in-the-blank, dropdown, drag and
-- drop, listening — per docs/exercise-model.md.
--
-- The shape is deliberate: columns for what we FILTER by (skill, level, topic,
-- published, slug) and `jsonb` for what we RENDER (media, pools, slots). Adding
-- a new answer mechanic therefore needs a renderer, not a migration.
--
-- Reads go through the server (service-role key), exactly like book_downloads,
-- so RLS stays enabled with NO public policies: the anon key gets nothing.

create table if not exists public.exercises (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null,       -- URL segment: /[lang]/ingles/[level]/[topic]/[slug]
  skill       text        not null,       -- writing | listening | reading (filter label, never a dispatch key)
  level       text        not null,       -- CEFR: A1 A2 B1 B2 C1 C2
  topic       text        not null,
  payload     jsonb       not null default '{}',
  published   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id),

  -- Slugs are unique PER (level, topic), not globally, so `ordering-coffee` can
  -- exist at A1 and at B2 without collision. Changing a published slug breaks
  -- every shared deep link — treat it as permanent.
  constraint exercises_level_topic_slug_key unique (level, topic, slug)
);

-- The only listing access path: published exercises for one (level, topic).
create index if not exists exercises_level_topic_published_idx
  on public.exercises (level, topic) where published;

-- A listening exercise without audio is unplayable. Reject it at the source
-- rather than discovering it on the render path (docs/exercise-model.md,
-- "Media availability": this is the free, authoring-time layer).
alter table public.exercises drop constraint if exists listening_requires_audio;
alter table public.exercises add constraint listening_requires_audio
  check (
    skill <> 'listening'
    or coalesce(payload->'media'->>'audio', '') <> ''
  );

-- `updated_at` is audit metadata, so it is maintained by the database and not
-- by application code — a client that forgets to set it cannot corrupt history.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- RLS on with no policies: only the service-role key (BYPASSRLS) reads this.
alter table public.exercises enable row level security;

-- BYPASSRLS does NOT bypass table-level GRANTs (see 0002 for the full autopsy),
-- so the server role needs them explicitly or every SELECT fails with 42501.
grant select on table public.exercises to service_role;
grant insert, update, delete on table public.exercises to service_role;
