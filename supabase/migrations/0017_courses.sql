-- Courses (hidden): the paid part of the site. A PREMIUM subscription
-- (`user_subscriptions`, 0010) unlocks every course with `included_in_premium
-- = true`; a user can ALSO buy a single course outright for LIFETIME access
-- (`course_purchases`, one row per (user, course) — no expiry, no renewal).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0016_activity_provenance.sql.
--
-- Everything under `/[lang]/cursos/**` stays UNLINKED (no nav/hub/menu
-- entry) until payments actually exist — this migration only builds the
-- data shape underneath it.
--
-- Same security posture as every table since `exercise_likes` (the 0002
-- lesson): RLS enabled, ZERO policies, only the service-role key (BYPASSRLS)
-- reads or writes. The anon/authenticated key gets nothing; every access
-- check (login, plan, ownership, moderator) happens in application code via
-- `src/lib/courses/access.ts`, exactly like `src/lib/access.ts` and
-- `src/lib/roles.ts` already do for `user_subscriptions` and `user_roles`.

begin;

-- One row per course. `slug` is the public URL segment
-- (`/[lang]/cursos/[slug]`) — kebab-case, enforced with a regex check so a
-- bad slug fails at insert time, not at render time.
create table public.courses (
  id                  uuid        primary key default gen_random_uuid(),
  slug                text        not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text        not null check (char_length(title) <= 120),
  subtitle            text        check (subtitle is null or char_length(subtitle) <= 200),
  description         text,
  level               text        check (level is null or level in ('A1','A2','B1','B2','C1','C2')),
  cover_path          text,
  status              text        not null default 'draft' check (status in ('draft','published','archived')),
  included_in_premium boolean     not null default true,
  price_cents         integer     check (price_cents is null or price_cents >= 0),
  currency            text        not null default 'USD',
  created_by          uuid        references auth.users(id) on delete set null,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- `price_cents` null means "not sold individually" — the landing page's
-- lifetime-purchase CTA only renders a price when this is set.
comment on column public.courses.price_cents is
  'Lifetime individual-purchase price in cents. NULL = this course is not sold individually (premium-only or not for sale).';

alter table public.courses enable row level security;
grant select on table public.courses to service_role;
grant insert, update, delete on table public.courses to service_role;

-- One row per module inside a course, ordered by `position`. The deferrable
-- unique constraint lets a single transaction reorder every module in a
-- course (swap positions 1 and 2) without a transient duplicate tripping the
-- constraint mid-statement.
create table public.course_modules (
  id         uuid        primary key default gen_random_uuid(),
  course_id  uuid        not null references public.courses(id) on delete cascade,
  position   integer     not null check (position >= 0),
  title      text        not null check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_modules_course_position_key unique (course_id, position) deferrable initially immediate
);

create index course_modules_course_id_idx on public.course_modules (course_id);

alter table public.course_modules enable row level security;
grant select on table public.course_modules to service_role;
grant insert, update, delete on table public.course_modules to service_role;

-- One row per lesson inside a module, ordered by `position` (same deferrable
-- reorder trick as `course_modules`). `content` is a closed-shape jsonb blob
-- keyed off `kind`:
--   text:     { "markdown": string }              -- rendered sanitized, no raw HTML
--   video:    { "url": string }                    -- https, YouTube/Vimeo only (app-validated)
--   activity: { "activityId": uuid }                -- must reference a LIVE (published) activity
-- The exact shape per kind is application-validated (`src/lib/courses/`),
-- not a jsonb schema constraint — the same tradeoff `activities.content`
-- already makes elsewhere in this codebase.
create table public.course_lessons (
  id           uuid        primary key default gen_random_uuid(),
  module_id    uuid        not null references public.course_modules(id) on delete cascade,
  position     integer     not null check (position >= 0),
  title        text        not null check (char_length(title) <= 120),
  kind         text        not null check (kind in ('text','video','activity')),
  content      jsonb       not null default '{}'::jsonb,
  duration_min integer     check (duration_min is null or duration_min > 0),
  is_preview   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint course_lessons_module_position_key unique (module_id, position) deferrable initially immediate
);

create index course_lessons_module_id_idx on public.course_lessons (module_id);

alter table public.course_lessons enable row level security;
grant select on table public.course_lessons to service_role;
grant insert, update, delete on table public.course_lessons to service_role;

-- Lifetime entitlements: one row per (user, course) means the user owns that
-- course forever, regardless of plan. `source` distinguishes a real purchase
-- from an admin-granted comp or a promo code — all three grant the same
-- access, but "Otorgar acceso" (the admin grant screen) only ever writes
-- `source = 'grant'` with `granted_by` set to the acting moderator.
create table public.course_purchases (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  course_id     uuid        not null references public.courses(id) on delete cascade,
  source        text        not null check (source in ('purchase','grant','promo')),
  amount_cents  integer     check (amount_cents is null or amount_cents >= 0),
  currency      text,
  provider      text,
  provider_ref  text,
  granted_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint course_purchases_user_course_key unique (user_id, course_id)
);

create index course_purchases_course_id_idx on public.course_purchases (course_id);

alter table public.course_purchases enable row level security;
grant select on table public.course_purchases to service_role;
grant insert, update, delete on table public.course_purchases to service_role;

commit;
