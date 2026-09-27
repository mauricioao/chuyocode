-- Identity-backed reactions and the auditing threshold (feature:
-- user-authored-exercises, slice 8).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0008_user_roles.sql.
--
-- Same security posture as every table before it: RLS enabled, ZERO
-- policies, only the service-role key (server-side) reads or writes. The
-- browser never talks to Supabase directly (slice 9's endpoint is the only
-- writer).
--
-- It creates:
--   1. `exercise_reactions`        — one row per (user_id, exercise_id).
--   2. `exercise_reaction_counts`  — the quality/too-hard tallies the
--      trigger below maintains. A SEPARATE table, not a column on
--      `exercises`: every reaction would otherwise rewrite the exercise row
--      and fire `exercises_set_updated_at` (0003), turning `updated_at` from
--      "when the CONTENT was edited" into "when someone last reacted".
--   3. `exercise_moderation_config` — a single tunable row (the audit
--      threshold), so changing it is a SQL UPDATE, never a deploy.
--   4. `is_quality_dislike` / `is_too_hard_dislike` — the reason taxonomy,
--      spelled once so the trigger and any future report agree on it.
--   5. `sync_exercise_reaction_counts()` — the delta-based trigger that keeps
--      the counts (and the `auditing` flip) in the SAME transaction as the
--      reaction that caused them.
--   6. The `service_role` grants all three tables need (the 0002 lesson).

-- ---------------------------------------------------------------------------
-- 1. The reaction, one per (user_id, exercise_id)
-- ---------------------------------------------------------------------------
--
-- Identified by the AUTHENTICATED user, never by a cookie or anonymous
-- token — the opposite of `exercise_likes` (0005), and why this is its own
-- table rather than an extension of it. `exercise_reactions_user_exercise_key`
-- is what makes "changing an existing reaction" an update-in-place instead of
-- a second row: the app layer always upserts on it (`src/lib/reactions.ts`).
--
-- `reason` is required for a dislike and forbidden for a like
-- (`exercise_reactions_reason_pairing`) — the taxonomy scenario ("Dislike
-- without a valid reason is rejected") is enforced at the database, not just
-- in the endpoint, so a hand-run `INSERT` cannot bypass it either.
create table public.exercise_reactions (
  id          uuid        primary key default gen_random_uuid(),
  exercise_id uuid        not null references public.exercises(id) on delete cascade,
  user_id     uuid        not null references auth.users(id)       on delete cascade,
  kind        text        not null check (kind in ('like','dislike')),
  reason      text        check (reason in ('ambiguous','wrong_answer','too_hard','typo')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint exercise_reactions_user_exercise_key unique (user_id, exercise_id),
  constraint exercise_reactions_reason_pairing check (
    (kind = 'dislike' and reason is not null) or (kind = 'like' and reason is null)
  )
);

-- ---------------------------------------------------------------------------
-- 2. The counter table — mirrors exercise_likes's shape, not its content
-- ---------------------------------------------------------------------------
--
-- `too_hard_dislikes` is stored but never consulted by the threshold — it is
-- the difficulty-calibration signal the taxonomy exists to collect, and it
-- costs one column to keep.
create table public.exercise_reaction_counts (
  exercise_id       uuid        primary key references public.exercises(id) on delete cascade,
  quality_dislikes  bigint      not null default 0 check (quality_dislikes  >= 0),
  too_hard_dislikes bigint      not null default 0 check (too_hard_dislikes >= 0),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. The tunable threshold — single-row config, writable only by service_role
-- ---------------------------------------------------------------------------
--
-- `id boolean primary key check (id)` admits exactly one row: a second INSERT
-- can only ever try `id = true` again and collide with the primary key, so
-- "single row" is a database guarantee, not a convention. Changing the
-- threshold is `update public.exercise_moderation_config set
-- audit_dislike_threshold = ...` — no deploy required.
create table public.exercise_moderation_config (
  id                      boolean     primary key default true check (id),
  audit_dislike_threshold int         not null default 5 check (audit_dislike_threshold > 0),
  updated_at              timestamptz not null default now()
);
insert into public.exercise_moderation_config (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. The reason taxonomy, spelled once
-- ---------------------------------------------------------------------------
--
-- Two immutable predicates so the taxonomy lives in exactly one place at the
-- database layer. The validator and the API mirror them in TypeScript
-- (`src/lib/reactions.ts`); this SQL copy is the authoritative one, because it
-- is what the trigger below actually evaluates.
create or replace function public.is_quality_dislike(k text, r text)
returns boolean language sql immutable as $$
  select k = 'dislike' and r in ('ambiguous','wrong_answer','typo')
$$;
create or replace function public.is_too_hard_dislike(k text, r text)
returns boolean language sql immutable as $$
  select k = 'dislike' and r = 'too_hard'
$$;

-- ---------------------------------------------------------------------------
-- 5. The threshold trigger — delta, not recount
-- ---------------------------------------------------------------------------
--
-- Fires on INSERT OR UPDATE OR DELETE, not INSERT alone: the spec requires
-- that changing an existing reaction (`typo` -> `ambiguous`, `wrong_answer` ->
-- `too_hard`) updates the counts in place too.
create or replace function public.sync_exercise_reaction_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target    uuid;
  q_delta   int := 0;
  t_delta   int := 0;
  new_q     bigint;
  threshold int;
begin
  -- 🔴 NEW and OLD MUST BE BRANCHED ON, NEVER COALESCED. In PL/pgSQL `NEW` is
  -- UNASSIGNED during DELETE (and `OLD` during INSERT); merely referencing it
  -- raises `record "new" is not assigned yet`, and a CASE guard does not save
  -- you because SQL does not promise short-circuit evaluation.
  if tg_op = 'DELETE' then target := old.exercise_id;
  else                     target := new.exercise_id;
  end if;

  -- Remove OLD's contribution, then add NEW's.
  if tg_op in ('UPDATE','DELETE') then
    if is_quality_dislike(old.kind, old.reason)  then q_delta := q_delta - 1; end if;
    if is_too_hard_dislike(old.kind, old.reason) then t_delta := t_delta - 1; end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if is_quality_dislike(new.kind, new.reason)  then q_delta := q_delta + 1; end if;
    if is_too_hard_dislike(new.kind, new.reason) then t_delta := t_delta + 1; end if;
  end if;

  -- 🔴 THE DELTA IS EVALUATED INSIDE THE SET EXPRESSION (0006's rule, reused
  -- here). A second transaction finding the row locked waits, re-reads the
  -- committed row and RE-EVALUATES the expression against it, so concurrent
  -- reactions cannot lose a count. Computing the value in the server and
  -- sending a literal WOULD race.
  insert into public.exercise_reaction_counts
         (exercise_id, quality_dislikes, too_hard_dislikes)
  values (target, greatest(q_delta,0), greatest(t_delta,0))
  on conflict (exercise_id) do update
     set quality_dislikes  = greatest(exercise_reaction_counts.quality_dislikes  + q_delta, 0),
         too_hard_dislikes = greatest(exercise_reaction_counts.too_hard_dislikes + t_delta, 0),
         updated_at = now()
  returning quality_dislikes into new_q;

  select audit_dislike_threshold into threshold from public.exercise_moderation_config;

  -- `status = 'live'` is the whole guard: idempotent (never re-fires on a row
  -- already auditing), and never drags draft/needs_work/removed into the
  -- queue. `hidden_at` / `hidden_by` are NOT touched here — automatic
  -- auditing never hides.
  if new_q >= threshold then
    update public.exercises set status='auditing' where id=target and status='live';
  end if;

  return null;
end $$;

create trigger exercise_reactions_sync_counts
  after insert or update or delete on public.exercise_reactions
  for each row execute function public.sync_exercise_reaction_counts();

-- ---------------------------------------------------------------------------
-- 6. RLS + grants (the 0002 lesson, repeated at every table since)
-- ---------------------------------------------------------------------------
--
-- `service_role` has BYPASSRLS, which skips policies but NOT table-level
-- GRANTs. Every new table gets RLS on with zero policies, plus explicit
-- grants — omitting them reproduces the 0002 bug: the SECURITY DEFINER
-- trigger above still writes happily, while a direct read from the server
-- fails 42501, and because the read layer is fail-safe the symptom is data
-- written and always displayed as empty.
alter table public.exercise_reactions        enable row level security;
alter table public.exercise_reaction_counts  enable row level security;
alter table public.exercise_moderation_config enable row level security;

grant select on table public.exercise_reactions to service_role;
grant insert, update, delete on table public.exercise_reactions to service_role;

grant select on table public.exercise_reaction_counts to service_role;
grant insert, update, delete on table public.exercise_reaction_counts to service_role;

grant select on table public.exercise_moderation_config to service_role;
grant insert, update, delete on table public.exercise_moderation_config to service_role;
