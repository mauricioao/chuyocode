# Design: User-Authored Exercises

**Artifact**: `gentle-ai.sdd-design/v1` · **Rev**: 1 · **Change**: `user-authored-exercises`
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/design`)
**Upstream**: `proposal.md` rev 2 · 8 delta specs · `research.md` rev 3

> **Size note.** The `sdd-design` skill's 800-word budget is exceeded deliberately: the launch contract requires file paths, type definitions, migration ordering, trigger boundaries and a per-area test strategy across 8 capabilities and 21 slices. Table-first and slice-indexed — read by lookup. Held under 50,000 characters so both stores hold identical bytes.
>
> **Governing principles**: identity is a request fact, never a client fact · the database owns invariants, the application owns transitions · pure logic in `src/lib/`, React is wiring · additive contracts degrade, graded contracts reject · preview reuses the real renderer.

---

## 1. Session client and middleware

### The third client

`supabaseServer` and `createServiceClient()` in `src/lib/supabase.ts` are untouched (header note only).

```ts
// src/lib/supabaseSession.ts  (NEW — slice 1)
import { createServerClient, parseCookieHeader, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/**
 * `@supabase/ssr` DEFAULT_COOKIE_OPTIONS ship `httpOnly: false` and NEVER set
 * `secure`. Both are overridden here. `sameSite: 'lax'` — NOT 'strict': the
 * magic link arrives as a cross-site top-level navigation into the confirm
 * route, and 'strict' withholds the cookie on exactly that navigation.
 */
export function sessionCookieOptions(isProd: boolean): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' };
}

export function createSessionClient(args: {
  request: Request; cookies: AstroCookies; isProd: boolean;
}): { client: SupabaseClient; pendingHeaders: Map<string, string> };
```

`setAll` implements **both** parameters of `SetAllCookies(cookies, headers)`. Supabase's own Astro quickstart drops `headers`; that is an abbreviation, not the contract.

- Cookies go straight to `AstroCookies`, which already targets the outgoing response — **no buffering needed** (closes research A6's open question). `headers` **do** need buffering, because middleware cannot reach the `Response` until `next()` resolves: hence `pendingHeaders`.
- Empty `value` means delete → `cookies.delete(name, options)`, never `set(name, '')`.
- `parseCookieHeader` returns `{ name, value?: string }` in current `@supabase/ssr`; filter out `undefined` values or `getAll` violates its own `{name, value}[]` type.

**`secure: isProd` is a deliberate, tested concession.** On `http://localhost` a `Secure` cookie is dropped outright and magic-link sign-in cannot work locally at all — the same concession `src/pages/api/me-gusta/[id].ts:107` already makes, so it is the house rule, not a new one. `httpOnly: true` is unconditional. The `user-identity` cookie scenario describes the issued production cookie and is satisfied there.

**RED test (slice 1):** `sessionCookieOptions(true)` → `{httpOnly:true, secure:true, sameSite:'lax', path:'/'}`; `(false)` → same with `secure:false`; **plus** an assertion that the factory passes the object to `createServerClient` as `cookieOptions`. Without the third, the constant can be correct and unused.

**No new environment variable.** The session client uses `env.SUPABASE_ANON_KEY` — already **required** (`src/lib/env.ts:53`), and the anon key *is* the legacy publishable key. Every auth call happens in middleware or an API route, so it stays **server-only, no `PUBLIC_` prefix**. Research A8/A5(a) resolves in the cheaper direction: the auth slice adds zero env vars. `RESEND_API_KEY` (slice 21) is the only new key.

### Middleware

`src/middleware.ts` currently returns early on `/api/**`, which auth must cover. New ordering:

```
onRequest(context, next):
  locals.user = null                    ← FIRST, always. Type is never undefined.
  1. pathname === '/'        → 302 redirect        (no session work; nothing renders)
  2. invalid lang segment    → 404                 (no session work)
  3. valid lang segment      → locals.lang = segment
  4. needsSession(pathname)  → { client, pendingHeaders } = createSessionClient(...)
                               locals.user = (await client.auth.getUser()).data.user ?? null
                               ↑ this call is also what refreshes the session
  5. response = await next()
  6. flush pendingHeaders onto response.headers
  7. return response
```

`needsSession(pathname)` is a **pure exported predicate**: `false` for `_astro/*` and any first segment containing `.`; `true` otherwise. It is the only thing between the site and a round trip per static asset, so it is unit-tested directly rather than through the middleware.

`getUser()` costs one authenticated round trip per page/API request. Accepted — it is the documented safe cost. `getClaims()` is a real optimization but research A3 did not verify its per-algorithm semantics: **explicitly deferred, not forgotten.**

In `src/env.d.ts`, `App.Locals` gains `user: import('@supabase/supabase-js').User | null` beside the existing `lang?`. **Never optional**: a route reading `undefined` and one reading `null` must not be able to diverge. **The Supabase client is deliberately NOT on `locals`** — locals carries plain, serializable data only, and API routes build their own with `createSessionClient` (construction does no I/O, so this is free).

### HARD RULE — never set `middlewareMode: 'edge'`

`astro.config.mjs:13` is `netlify()` with no options, so middleware runs in the Netlify Function on Node — the model `@supabase/ssr` is verified against. Under **edge** middleware the adapter JSON-serializes `context.locals` into a header, which a Supabase session client cannot survive. **Auth breaks silently: no error, no log.**

Guard (slice 2): a unit test reads `astro.config.mjs` as text and asserts it contains neither `middlewareMode` nor `cacheOnDemandPages`. Crude, and correct for the failure mode — the risk is a future edit, and the config exports an opaque integration, so a text assertion is the only thing that catches it.

### Magic-link flow

```
POST /api/auth/signin {email,lang,next}
  → signInWithOtp({ email, options:{ data:{lang},
        emailRedirectTo: <origin>/api/auth/confirm?next=<safe> }})
  → 200, body IDENTICAL whether or not the address has an account
GET  /api/auth/confirm?token_hash=…&type=email      (from the emailed link)
  → verifyOtp({type:'email', token_hash})
  → setAll → AstroCookies (httpOnly / secure / lax)
  → 303 to safeNextPath(next), token_hash + type STRIPPED
```

| Route | File | Method and behavior |
|---|---|---|
| `/api/auth/signin` | `src/pages/api/auth/signin.ts` | POST — always the same body; no account enumeration by construction |
| `/api/auth/confirm` | `src/pages/api/auth/confirm.ts` | GET — `verifyOtp`, strip `token_hash`/`type`, 303 to `safeNextPath(next)` |
| `/api/auth/signout` | `src/pages/api/auth/signout.ts` | POST — `signOut()` (library clears chunked cookies), 303 home |
| `/[lang]/auth/entrar` | `src/pages/[lang]/auth/entrar.astro` | GET — localized sign-in **page** |

**Why endpoints are `/api/auth/*`, not `/[lang]/auth/*`** (refines the proposal's Affected Areas): the confirm URL is registered in Supabase's redirect allow-list, and lang-prefixing means two entries that can drift. `next` carries the locale instead, and middleware already treats `/api` as non-locale. The **page** stays localized.

`safeNextPath(raw)` in `src/lib/authRedirect.ts` — pure. Returns `raw` only when it starts with `/`, does **not** start with `//` or `/\`, and carries no scheme; otherwise `/${DEFAULT_LANG}/`. This is the open-redirect guard, tested first in slice 3.

**CSRF, unstated elsewhere:** `sameSite: 'lax'` means the browser does not attach the session cookie to a cross-site POST. Every mutating route here is POST-only, so lax cookies *are* the CSRF defense. A future GET mutation would silently void it.

---

## 2. Auth-dependent rendering

| Rule | Mechanism | Enforcement |
|---|---|---|
| Gating is server-side; unauthenticated visitors never receive authenticated-only markup | `.astro` frontmatter reads `Astro.locals.user`; markup inside `{user && (…)}` | E2E fetches anonymously and asserts the response **HTML string** lacks the marker — never a visibility assertion |
| Islands receive auth state as a prop | `<Island authed={user !== null} authorId={user?.id} />` | Unit test walks `src/components/islands/**`, asserts no file imports `@supabase/*` or `@lib/supabase*` |
| Hiding is not securing | Every mutating route runs the guard itself | Per endpoint: anonymous → 401, wrong owner/role → 403, **and no row changed** |

**CDN caching is the fourth rule and the one with no natural test.** `cacheOnDemandPages` is off today only because `astro.config.mjs:13` passes no options — an accident of configuration, not a guarantee. `src/lib/httpCache.ts` (slice 2) exports `PRIVATE_CACHE_CONTROL = 'private, no-store'` and `markPrivate(headers: Headers): void`. Every auth-dependent page calls `markPrivate(Astro.response.headers)` in frontmatter; every auth-dependent endpoint sets the same header (`me-gusta` already sets `no-store`). With the `astro.config.mjs` text assertion, both halves of the hazard are covered.

---

## 3. The migration (`0007`) — highest-risk item

Risk is **breadth, not volume**: one row of data, four readers broken at once. All of it in slice 5.

One migration per slice: `0007_exercise_authorship` (slice 5 — three-axis model, `author_id`, `updated_by` FK fix, index swap) · `0008_user_roles` (6) · `0009_exercise_reactions` (8 — reactions, counts, config, trigger) · `0010_user_terms_acceptance` (17) · `0011_exercise_moderation_actions` (19). Per `0006`'s own header: a handed-out migration is history — never edit a previous number.

### Ordering — this order *is* the design

```sql
begin;

-- 1. NULLABLE first. NOT NULL with a default would stamp every row 'draft'
--    before the backfill can read `published`.
alter table public.exercises add column status text;

-- 2. BACKFILL BEFORE THE DROP — the single highest-risk line in the change.
--    Once `published` is gone the source of truth is gone with it.
update public.exercises
   set status = case when published then 'live' else 'draft' end
 where status is null;

-- 3. Only now can the column carry its constraints.
alter table public.exercises alter column status set not null;
alter table public.exercises alter column status set default 'draft';
alter table public.exercises add constraint exercises_status_valid
  check (status in ('draft','live','auditing','needs_work','removed'));

-- 4. Audit + ownership.
alter table public.exercises add column published_at timestamptz;
update public.exercises set published_at = created_at where status = 'live';
alter table public.exercises add column hidden_at timestamptz;
alter table public.exercises add column hidden_by uuid references auth.users(id) on delete set null;
alter table public.exercises add column author_id uuid references auth.users(id) on delete set null;

-- 5. The hide pair is all-or-nothing; only a would-be-visible row can be hidden.
alter table public.exercises add constraint exercises_hidden_pair
  check (
    (hidden_at is null and hidden_by is null)
    or (hidden_at is not null and hidden_by is not null
        and status in ('live','auditing'))
  );

-- 6. EXPLICITLY, never via `drop column ... cascade` (see note below).
drop index if exists public.exercises_level_focus_published_idx;

-- 7. The old column dies.
alter table public.exercises drop column published;

-- 8. STORED IS LOAD-BEARING (see note below).
alter table public.exercises add column visible boolean
  generated always as (status in ('live','auditing') and hidden_at is null) stored;

-- 9. The partial index, on the new predicate, under a truthful name.
create index exercises_level_focus_visible_idx
  on public.exercises (level, focus) where visible;

-- 10. `updated_by` has NO on-delete action (0003:25), so today a user owning
--     any row cannot be deleted from auth.users at all.
alter table public.exercises drop constraint exercises_updated_by_fkey;
alter table public.exercises add constraint exercises_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

commit;
```

- **Step 6**: `drop column ... cascade` would drop the index *silently*; if step 9 were then forgotten the index vanishes with no error.
- **Step 8**: current Postgres defaults generated columns to VIRTUAL. PG 12–17 made omitting `STORED` a syntax error, so an omission that used to fail loudly now yields the wrong column kind in silence.

### Verifying `STORED` — the proposal's success criterion is not sufficient

`information_schema.columns.is_generated` reports `ALWAYS` for **both** STORED and VIRTUAL and cannot tell them apart. The only reliable proof is the catalog — paste its output into the slice-5 PR body, and confirm the interpretation against the version from owner prerequisite #8:

```sql
select a.attgenerated                     -- EXPECT 's'  ('s'=STORED, 'v'=VIRTUAL)
  from pg_attribute a join pg_class c on c.oid = a.attrelid
 where c.relname = 'exercises' and a.attname = 'visible';
```

### Rollback

Migrations here are hand-run from the SQL editor with no down-migration convention, and a `migrations/rollback/` directory for one file would be a convention with one user. **The rollback ships as a commented `-- ROLLBACK` block at the foot of `0007`** — same file, same review, impossible to lose. Tradeoff: not executable without uncommenting, the right friction for a destructive path.

Sequence — one row of data, so the down path costs what the up path costs: `drop index …_visible_idx` → `drop column visible` → `add column published boolean not null default false` → `update … set published = (status='live')` → recreate `…_published_idx … where published` → drop both new constraints → `drop column status, published_at, hidden_at, hidden_by, author_id` → revert the four read sites and four assertions.

### Atomic read-layer cutover — same slice, no exceptions

| Site | Change |
|---|---|
| `src/lib/exercises.ts:141` `getExerciseBySlug` · `:200` `getExerciseFacetRows` (entry-screen navigation) · `:250` `getPublishedExercises` · `:356` `getRelatedExercises` | `.eq('published', true)` → `.eq('visible', true)` |
| `src/lib/exercises.test.ts:154, 353, 420, 638` | `toHaveBeenCalledWith('published', true)` → `('visible', true)` |
| `supabase/seeds/exercises_a1_test.sql:8` | column list `published` → `status`; value `true` → `'live'` |
| `supabase/seeds/progress/*.json` | **Deleted** |

The diff at each read site is one token, intentionally: the existing suite then proves byte-identical behavior, the only evidence that matters here. **Do not refactor these four calls into a helper in this slice** — that changes the shape the tests assert and destroys the evidence. `0004:108` (`set focus='unassigned', published=false`) is **safe and unchanged**: on a fresh database it runs before `0007`, while `published` is still plain.

**Progress manifests: delete, do not reset.** Six files claim 402 exercises; one exists, and `A1.json` disagrees with itself. Nothing reads them programmatically; humans do. A reset produces a scaffold that re-rots the moment the next batch is skipped. If batch seeding resumes, regenerate from `select level, focus, count(*) from exercises where visible group by 1,2`.

### Status state machine — enforced in TypeScript, not SQL

| Transition | Actor | Gate |
|---|---|---|
| `draft` → `live` | author | validator passes + terms accepted (first publish) |
| `live` → `auditing` | trigger | quality dislikes ≥ threshold |
| `live`/`auditing` → `needs_work` | moderator | — |
| `auditing` → `live` | moderator | audit resolved as fine |
| `needs_work` → `live` | author | validator passes |
| any → `removed` | moderator | soft delete, logged |
| `removed` → — | — | terminal in v1 |

The database enforces the **value domain** (`exercises_status_valid`) and the **hide pair**. It does not enforce the **graph**: only the service-role client can write, there is exactly one server path per transition, and a `BEFORE UPDATE` transition trigger would be a second copy of the state machine that no client can reach. `src/lib/exerciseLifecycle.ts` holds `canTransition(from, to)` as a pure, exhaustively-tested table. Accepted tradeoff: a hand-run SQL `UPDATE` can produce an illegal transition — already true of every other business rule in this schema.

---

## 4. Reactions and the threshold trigger (`0009`)

```sql
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

create table public.exercise_reaction_counts (
  exercise_id       uuid        primary key references public.exercises(id) on delete cascade,
  quality_dislikes  bigint      not null default 0 check (quality_dislikes  >= 0),
  too_hard_dislikes bigint      not null default 0 check (too_hard_dislikes >= 0),
  updated_at        timestamptz not null default now()
);

-- Single row: `id boolean primary key check (id)` admits exactly one.
create table public.exercise_moderation_config (
  id                      boolean     primary key default true check (id),
  audit_dislike_threshold int         not null default 5 check (audit_dislike_threshold > 0),
  updated_at              timestamptz not null default now()
);
insert into public.exercise_moderation_config (id) values (true) on conflict do nothing;
```

**The counter is its own table**, mirroring `exercise_likes` (`0005`) — *not* a column on `exercises`: every reaction would then rewrite the exercise row and fire `exercises_set_updated_at` (`0003:61`), turning `updated_at` from "when the CONTENT was edited" into "when someone last reacted". `too_hard_dislikes` is stored but never consulted by the threshold — it is the difficulty-calibration signal the taxonomy exists to collect, and it costs one column.

### The trigger — delta, not recount

The spec requires that changing an existing reaction (`typo` → `ambiguous`, `wrong_answer` → `too_hard`) updates in place, so the trigger must fire on `INSERT OR UPDATE OR DELETE`, not `AFTER INSERT` alone. **This closes a real gap in the proposal.**

A naive `select count(*)` recount inside an `AFTER` trigger races: under READ COMMITTED two concurrent inserts can each count N, miss each other, and both write N. `0006:47-54` already documents the fix — the clamp lives *inside* the `UPDATE ... SET` expression. Reuse it:

```sql
-- Two immutable predicates so the reason taxonomy is spelled ONCE. The validator
-- and the API mirror them in TypeScript; the SQL copy is the authoritative one.
create or replace function public.is_quality_dislike(k text, r text)
returns boolean language sql immutable as $$
  select k = 'dislike' and r in ('ambiguous','wrong_answer','typo')
$$;
create or replace function public.is_too_hard_dislike(k text, r text)
returns boolean language sql immutable as $$
  select k = 'dislike' and r = 'too_hard'
$$;

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

  -- 🔴 THE DELTA IS EVALUATED INSIDE THE SET EXPRESSION (0006's rule). A second
  -- transaction finding the row locked waits, re-reads the committed row and
  -- RE-EVALUATES the expression against it, so concurrent reactions cannot lose
  -- a count. Computing the value in the server and sending a literal WOULD race.
  insert into public.exercise_reaction_counts
         (exercise_id, quality_dislikes, too_hard_dislikes)
  values (target, greatest(q_delta,0), greatest(t_delta,0))
  on conflict (exercise_id) do update
     set quality_dislikes  = greatest(exercise_reaction_counts.quality_dislikes  + q_delta, 0),
         too_hard_dislikes = greatest(exercise_reaction_counts.too_hard_dislikes + t_delta, 0),
         updated_at = now()
  returning quality_dislikes into new_q;

  select audit_dislike_threshold into threshold from public.exercise_moderation_config;

  -- `status = 'live'` is the whole guard: idempotent, never re-fires on a row
  -- already auditing, never drags draft/needs_work/removed into the queue.
  -- hidden_at / hidden_by are NOT touched: automatic auditing never hides.
  if new_q >= threshold then
    update public.exercises set status='auditing' where id=target and status='live';
  end if;

  return null;
end $$;

create trigger exercise_reactions_sync_counts
  after insert or update or delete on public.exercise_reactions
  for each row execute function public.sync_exercise_reaction_counts();
```

**Transaction boundary.** An `AFTER ROW` trigger runs inside the triggering statement's transaction, so the count write and the `auditing` flip commit or roll back *with* the reaction. There is no window where a reaction exists without its count, nor one where the count crossed the threshold without the status moving. If the `update exercises` deadlocks, the reaction insert fails too and the learner retries — the correct trade, and why this is a trigger and not a cron job.

**Grants (the `0002` lesson).** `service_role` has `BYPASSRLS`, which skips policies but **not** table-level `GRANT`s. Every new table gets `enable row level security` (zero policies, as everywhere) plus `grant select, insert, update, delete … to service_role`. Omitting them reproduces the `0002` bug: `SECURITY DEFINER` writes succeed, direct reads fail `42501`, and because the read layer is fail-safe the symptom is data written and always displayed as empty.

**API.** `POST /api/reacciones/[exerciseId]` (slice 9), body `{ kind, reason? }`. `locals.user` null → **401** (unlike `me-gusta`, anonymous by design and untouched). Upsert on `(user_id, exercise_id)`. Response is `{ ok }` only — exposing the dislike count invites brigade coordination and it has no learner-facing use.

---

## 5. Roles (`0008`)

`user_roles`: `user_id uuid not null references auth.users(id) on delete cascade`, `role text not null check (role in ('moderator'))`, `granted_at timestamptz not null default now()`, `primary key (user_id, role)`. RLS on, zero policies, `service_role` grants.

No secondary index: the PK's leftmost prefix already serves `where user_id = $1`, and `0005:39-41` states the house rule that an unused index is write cost for nothing.

`src/lib/roles.ts` (slice 6) exports `type Role = 'moderator'`, `getUserRoles(userId): Promise<readonly Role[]>`, `hasRole(userId, role): Promise<boolean>`, and the route guard `requireRole(user: User | null, role: Role): Promise<User | null>` — the user on success, `null` on any denial.

**No round trip on hot paths.** Role lookup is *not* in middleware — only `requireRole` calls it, and only the four moderation surfaces call that, so an ordinary exercise page pays zero role queries. **A role change takes effect on the next request** because there is no cache and no JWT claim; an in-memory TTL cache is explicitly rejected, since it reintroduces exactly the staleness that disqualified JWT custom claims while hiding its window.

**Roles fail CLOSED.** A Supabase error returns `[]` → denied. This inverts the house fail-safe idiom (`exercises.ts` degrades to empty *content*), deliberately: an outage must never open a moderation dashboard. `roles.ts`'s header must say so, or a future reader will "fix" it to match its neighbours.

| Surface | Denial | Why |
|---|---|---|
| `/[lang]/moderacion/**` (page) | **404** | A 403 confirms the route exists; 404 leaks nothing and still renders no moderation markup |
| `/api/moderacion/**` | **401** anonymous, **403** authenticated non-moderator | The caller is a program needing an actionable code, and has already proved identity |

---

## 6. The `blocks` contract

```ts
// src/lib/exercisePayload.ts — additions (slice 12)

export interface ProseBlock { kind: 'prose'; id: string; text: string; }
export interface MediaBlock { kind: 'media'; id: string; image?: string; audio?: string; alt?: string; }
/** A row REFERENCES a slot; it does not contain one. See the note below. */
export interface RowBlock { kind: 'row'; id: string; slotId: string; }
export type Block = ProseBlock | MediaBlock | RowBlock;

export interface Payload {
  media?: { audio?: string };
  pools: Record<string, Pool>;
  slots: Slot[];
  layout?: Layout;
  /** OPTIONAL. Absent means exactly today's rendering. */
  blocks?: Block[];
}

/** Count of 3+-underscore runs. Shares BLANK_MARKER's rule, same comment block. */
export function countBlanks(label: string): number;
```

**Why a row references its slot instead of containing it.** `payload.slots` stays the single source of truth for grading, the stepper, `claimedTileIds` and `isSubmittable`; embedding slots would create a SECOND slot list all of those must learn — precisely how "absent `blocks` renders exactly as today" stops being true. `slotId` is singular, so "one answerable slot per row" is enforced by the **type**, and nesting is structurally impossible: a row holds no children, so depth cannot exceed 1. Multi-slot rows later become `slotIds: string[]` — additive, out of scope here.

**Which side of the parse asymmetry: `blocks` degrades like `parseLayout`; it never rejects like `parseSlot`.** `parseSlot` kills the payload because a broken slot is *ungradeable* and drawing it would lie to the learner. Nothing in `blocks` can be ungradeable — every graded thing lives in `payload.slots`, already guarded. A malformed block costs only presentation and ordering, exactly the class `parseLayout`'s header was written against ("a typo in an optional presentation hint must not turn real, answerable content into a 404"). The fallback already exists and is already correct: no `blocks` = today's rendering.

**All-or-nothing coverage rule.** A dangling `slotId`, or a slot referenced by no block, would half-render an exercise — worse than either extreme. One condition settles it:

> `payload.blocks` is kept **only when**, after parsing, the multiset of row-block `slotId`s is exactly the set of `payload.slots` ids — each once, none missing, none extra. Otherwise `blocks` is dropped entirely and rendering takes the legacy path.

One predicate, one place, no partial state. `parseBlocks` is tested against: valid, unknown `kind`, missing `id`, dangling/duplicate `slotId`, coverage gap, empty array, `null`.

**Renderer integration (slice 13) — the stepper does not change.** `ExerciseIsland.tsx:347-353` still binds 1:1 to `payload.slots`. `blocks` supplies context *around* the current slot via a pure module:

`src/lib/exerciseBlocks.ts` (slice 13) exports `blocksForStep(payload: Payload, index: number): Block[]` — the non-row blocks belonging to step `index`, plus that step's row block. Grouping (pure, deterministic, no React): walk `blocks` in order accumulating non-row blocks; on reaching a row block, that buffer plus the row is the group for that slot; trailing non-row blocks attach to the last group. `ExerciseIsland` renders the group's `prose`/`media` above the mechanic renderer and passes `slot` through unchanged.

`prose` is context-only: the graded sentence never leaves `slot.label`. Nothing structural enforces it because nothing needs to — the renderers read `slot.label` and only `slot.label`. Any other design forces all four mechanics to learn a second text source.

---

## 7. The deterministic structural validator

```ts
// src/lib/exerciseValidator.ts (NEW — slices 10-11). PURE. ZERO I/O.

/** Closed union. 'payload_unparseable' is emitted by the endpoint when
 *  parsePayload returns null; the rest are the rules tabled below. */
export type ValidationCode =
  | 'payload_unparseable' | 'slot_answer_empty' | 'slot_answer_unknown_id'
  | 'slot_pool_missing' | 'slot_multiple_blanks' | 'slot_unknown_mechanic'
  | 'pool_duplicate_id' | 'pool_duplicate_text' | 'pool_empty'
  | 'drop_pool_too_small' | 'listening_requires_audio' | 'slug_invalid'
  | 'block_coverage_mismatch' | 'exercise_too_few_mechanics';

export interface ValidationIssue {
  code: ValidationCode;
  severity: 'error' | 'warning';
  /** Where the author must look; null when exercise-wide. */
  slotId: string | null;
  poolName: string | null;
  blockId: string | null;
  /** Machine-readable context, e.g. the offending id. Never prose. */
  detail?: string;
}
export interface ValidationResult { ok: boolean; issues: ValidationIssue[]; }
export interface ValidatorInput {
  skill: string; level: string; focus: string; slug: string; payload: Payload;
}
export function validateExercise(input: ValidatorInput): ValidationResult;
```

Three properties make the spec's determinism requirement true:

1. **No human strings.** Codes only; bilingual copy lives in `exerciseValidatorCopy.ts` (es/en, existing `COPY` pattern). The validator is testable without a locale, and per-slot rendering is `issues.filter(i => i.slotId === slot.id)`.
2. **Issues are sorted before return** — slot index, then `code`, then `detail`. Without this the list depends on `Object.entries` order, and the spec requires the same *error list*, not just the same verdict.
3. **`ok = issues.every(i => i.severity !== 'error')`.** `exercise_too_few_mechanics` is the only `warning` in v1: the ≥2-mechanics rule is a *convention* (brief §5.5), and blocking publish on a style convention would be wrong. Warnings render; they never gate.

| Code | Rule (authoring-brief §) |
|---|---|
| `slot_answer_empty` | Every slot has a non-empty `answer` (§6.8) |
| `slot_answer_unknown_id` | For a pooled slot, every `answer` entry is an id in that pool (§6.1) |
| `slot_pool_missing` | Slot names a pool that does not exist (§6.1) |
| `slot_multiple_blanks` | `countBlanks(label) <= 1` (§6.4) |
| `slot_unknown_mechanic` | `input` outside `choice \| select \| text \| drop` (§6.10) |
| `pool_duplicate_id` / `pool_duplicate_text` | Duplicate ids fatal; duplicate visible text an error — one option becomes meaninglessly unselectable (§6.2) |
| `drop_pool_too_small` | Tiles in a shared drop pool > `drop` slots drawing from it (§6.9) |
| `pool_empty` | A referenced pool with zero items |
| `listening_requires_audio` | Mirrors the DB CHECK (`0003:41`) so the author sees it before the insert fails |
| `slug_invalid` | Non-empty, kebab-case, English (§6.5) |
| `block_coverage_mismatch` | Row blocks cover `payload.slots` exactly (design) |
| `exercise_too_few_mechanics` | **warning** — fewer than 2 distinct `input` values (§5.5) |

**What it is NOT** — stated so "the validator missed it" is not filed as a bug: §6.11 (a distractor also correct *in that sentence*), §6.3 (every acceptable `text` answer), §6.7/§6.12 (`focus`/`level` match the sentence). All three require reading English. This is a **structural** gate, not a semantic or LLM gate; the proposal accepts the exposure window for exactly these.

**Where it runs.** `src/pages/api/ejercicios/[id]/guardar.ts` calls it — that call is the gate; the authoring island runs the same pure function for live feedback. Predicate: `mustValidate = publish || currentStatus !== 'draft'`. In one sentence: *validation is required whenever the row is, or is about to become, publicly visible.* Drafts may be incomplete; nothing else may.

---

## 8. The authoring UI

| Path (under `src/`) | Kind | Slice |
|---|---|---|
| `pages/[lang]/crear/index.astro` · `crear/[id].astro` | Pages, SSR, gated; edit checks ownership in frontmatter | 15, 18 |
| `pages/[lang]/mis-ejercicios/index.astro` | Page — "my exercises" | 18 |
| `pages/api/ejercicios/[id]/guardar.ts` | Endpoint — save / publish / republish | 17 |
| `pages/api/ejercicios/validar.ts` | Endpoint — server validation for the panel | 17 |
| `components/islands/authoring/ExerciseAuthorIsland.tsx` | Island shell | 15 |
| `…/authoring/BlockList.tsx` · `SortableBlock.tsx` | `DndContext` + `SortableContext` + `arrayMove`; `useSortable` + `CSS.Transform.toString` | 14 |
| `…/authoring/{Prose,Media,Row}BlockEditor.tsx` | Block editors | 15 |
| `…/authoring/SlotAnswerEditor.tsx` | Per-mechanic answer + pool editors | 16 |
| `…/authoring/ExercisePreview.tsx` | **Mounts the real `ExerciseIsland`** | 15 |
| `lib/authoringDraft.ts` | Pure `Draft` model and mutations | 15 |
| `lib/exerciseSlug.ts` | `slugify`, `withCollisionSuffix` | 17 |

Astro-first: all three surfaces are `.astro` pages. React exists only where interactivity does — the block editor and the preview. "My exercises" is plain server-rendered markup with links and needs no island.

**Live gap parsing.** Plain `<textarea>`, parsed as the author types with the existing `BLANK_MARKER = /_{3,}/` and `splitLabelAtBlank`. `contenteditable` is rejected: unsolved cross-browser cursor/selection/undo/IME behavior, accented Spanish input is the most exposed population here, and this codebase has zero rich-text test infrastructure — the bug class would be invisible to every test we could write. `countBlanks` sits beside `splitLabelAtBlank` under the same comment block so the 3-underscore floor is defined once; `BLANK_MARKER` stays module-private.

**Drag reorder.** `@dnd-kit/sortable@10.0.0` peers `@dnd-kit/core@^6.3.0`, satisfied by the installed `6.3.1` — **no core bump**, `DropRenderer.tsx` untouched. Budget **two** packages: `@dnd-kit/utilities` for `CSS.Transform`.

Research left unknown #7 open: the classic-line equivalent of next-gen `preventActivation`, without which **Space inside a block's textarea starts a drag instead of typing a space**. The classic line has no such option and does not need one:

> **`{...attributes} {...listeners}` bind to a dedicated `<button>` drag handle with an accessible name. `setNodeRef` binds to the block container.**

Space in the textarea never reaches a drag listener because none is attached there — and a real, nameable, tabbable handle beats suppression on accessibility anyway. `KeyboardSensor` is registered exactly as `DropRenderer.tsx` already registers it, so arrow-key reordering works and the project keeps one pattern.

**WYSIWYG preview.** `ExerciseIsland` is pure-prop: no fetch, no storage, no identity. So `<ExerciseIsland lang={lang} payload={draftToPayload(draft)} badges={draftBadges} />` is the whole preview. Authoring is WYSIWYG **by construction** — there is no second renderer to keep in sync, so preview drift is not a bug that can be introduced.

**Publish flow** — `POST /api/ejercicios/[id]/guardar`, body `{ payload, blocks, publish, acceptedTerms }`:

```
1. locals.user null                      → 401
2. row.author_id !== user.id             → 403
3. parsePayload(raw) === null            → 422 { code:'payload_unparseable' }
4. mustValidate && !validate().ok        → 422 { issues }
5. first publish && !acceptedTerms       → 422 { code:'terms_required' }
6. insert/update; 23505 on the slug key  → retry ONCE with a suffix
7. status='live', published_at ??= now() → 200 { ok, slug, url }
```

**Slug collisions.** `UNIQUE(level, focus, slug)` is kept — the one-slug-one-URL deep-link contract is permanent (brief §6.6). Try verbatim; on `23505` retry **once** with a random 4-character base-36 suffix (random, not `-2`, which can collide again when one retry is the whole budget). If that also collides, return `slug_collision_unresolved` and let the author rename. The resolved URL is shown before publish completes.

**Terms acceptance (`0010`).** `user_terms_acceptance`: `user_id uuid primary key references auth.users(id) on delete cascade`, `accepted_at timestamptz not null default now()`, `terms_version text not null`. `terms_version` lets a future terms change require re-acceptance without a migration. The checkbox appears only when no row exists.

**Account deletion.** `author_id` and `updated_by` are both `ON DELETE SET NULL`. A `null` `author_id` **is** the placeholder — a real placeholder `auth.users` row would need a fabricated email and be indistinguishable from a real account in moderation. Reads render "Community" for `author_id is null`; the notify endpoint skips a null author with `author_deleted` rather than erroring.

---

## 9. Moderation dashboard and email

| Path (under `src/`) | Kind | Slice |
|---|---|---|
| `pages/[lang]/moderacion/index.astro` · `[id].astro` | Role-gated SSR queue; preview via the real renderer | 20 |
| `pages/api/moderacion/{ocultar,quitar,avisar}.ts` | POST — set `hidden_at`+`hidden_by` · `status='removed'` · `status='needs_work'`+email | 20, 21 |
| `lib/moderation.ts` | `getAuditQueue()`, `recordAction()` | 19 |
| `lib/email.ts` · `lib/emailCopy.ts` | Resend wrapper, es/en bodies | 21 |

Queue: `status='auditing'` joined to `exercise_reaction_counts`, ordered `quality_dislikes desc, published_at asc` — worst signal first, oldest as tiebreak so nothing starves. Every mutating endpoint calls `requireRole(locals.user, 'moderator')` itself, independently of the page.

`exercise_moderation_actions` (`0011`): `id uuid pk`, `exercise_id uuid not null references exercises(id) on delete cascade`, `moderator_id uuid references auth.users(id) on delete set null`, `action text not null check (action in ('hide','unhide','remove','needs_work','notify'))`, `reason text`, `notified_at timestamptz`, `created_at timestamptz not null default now()`; index on `(exercise_id, created_at desc)`. RLS on, zero policies, `service_role` grants as above.

**Double-email defence, two independent layers:**

1. **Our log is the authority.** Before sending: `select 1 from exercise_moderation_actions where exercise_id=$1 and action='notify' and created_at > now() - interval '24 hours'` → skip with `already_notified`. Stops the double-click and the second impatient moderator.
2. **`Resend-Idempotency-Key` is the provider-level net**, for the case where our write and the send cross. Order matters: insert the `notify` row with `notified_at` null (id = `A`) → send with `Resend-Idempotency-Key: notify-<A>` → on success set `notified_at`. A retry of the *same* row reuses key `A`, so Resend dedupes; a *new*, deliberate action creates a new row and key and sends again — correct.

**Resend.** `resend@6.28.0` (`engines: node >=20`, satisfied). `@react-email/render` is an **optional** peer and is not installed, so the budget is one package and no React reaches an email path. `RESEND_API_KEY` follows `src/lib/env.ts:57-64` (`OPTIONAL_ENV_KEYS`) plus the `createServiceClient` idiom: **fails loudly at call time, never at module load**, so the app still boots without email configured. Server-only, no `PUBLIC_` prefix; `validar-anuncio.ts:77-87` is the reference fail-closed shape.

**Bilingual message.** The author's locale is recorded at sign-in — `signInWithOtp({ options: { data: { lang } } })` writes it to user metadata — and read server-side at notify time; fallback `DEFAULT_LANG`. Copy lives in `emailCopy.ts` as plain text plus minimal HTML in the existing `COPY` shape, neutral Spanish with no voseo (already guarded by `neutralSpanish.test.ts`).

---

## 10. Dependency bump

`@supabase/supabase-js` `^2.58.0` → `^2.114.0` (required by `@supabase/ssr@0.12.7`; the whole 0.12 line needs `^2.108+`, no escape hatch). Same major, two existing clients. Verify in order:

| # | What to verify · how |
|---|---|
| 1 | `createClient(url, key, { auth: { persistSession, autoRefreshToken } })` still typechecks · `pnpm typecheck` |
| 2 | **`PostgrestBuilder implements PromiseLike` still holds.** `exercises.test.ts:36` mocks `then` and cites an exact vendored path (`@supabase+postgrest-js@2.110.7`); a bump moves it. Re-read the path, **update the comment**, run `pnpm test`. If the builder stopped being thenable, all four list reads break while the mock keeps passing. |
| 3 | `.maybeSingle() / .eq() / .order() / .limit()` signatures · `pnpm typecheck` |
| 4 | `rpc('increment_exercise_like', { exercise })` / `decrement_…` · `pnpm typecheck` + `likes.test.ts` |
| 5 | **One resolved copy of `@supabase/supabase-js`** · `pnpm why @supabase/supabase-js` must report a single version. Two copies means two `GoTrueClient` instances and a session that works intermittently. |
| 6 | Full suite green before slice 2 builds on it · `pnpm test && pnpm typecheck && pnpm test:e2e` |

Also added: `@supabase/ssr@0.12.7`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities`, `resend@6.28.0`. `astro@^5.18.2` and `@astrojs/netlify@^6.6.5` unchanged — the 5→7 upgrade stays out of scope.

---

## File changes

New files are listed in the section that designs them (1–9). This table holds only what is **modified or deleted**, plus three new modules with no natural home above. `(+ test)` = a colocated `*.test.ts(x)` sibling, mandatory under strict TDD.

| File | Action | Slice | Description |
|---|---|---|---|
| `package.json` | Modify | 1 | Bump `supabase-js`; add `@supabase/ssr` |
| `src/lib/supabase.ts` | Modify | 1 | Header note only — two clients untouched |
| `src/env.d.ts` | Modify | 2, 21 | `Locals.user`; `RESEND_API_KEY` |
| `src/middleware.ts` (+ test) | Modify | 2 | `needsSession`, `getUser()` → `locals.user`, header flush |
| `astro.config.mjs` | Modify | 2 | Prohibition on `middlewareMode:'edge'` / `cacheOnDemandPages` |
| `src/lib/i18n.ts` | Modify | 4, 15, 20 | es/en `COPY` for auth, authoring, moderation chrome |
| `src/lib/exercises.ts` (+ test) | Modify | 5, 7 | 4 read sites → `visible`; author-scoped, lifecycle-aware reads |
| `supabase/seeds/exercises_a1_test.sql` | Modify | 5 | `published` → `status='live'` |
| `supabase/seeds/progress/*.json` | **Delete** | 5 | Claim 402 exercises; one exists |
| `src/lib/exercisePayload.ts` (+ test) | Modify | 12 | `Block` types, `parseBlocks`, `countBlanks` |
| `src/components/islands/ExerciseIsland.tsx` | Modify | 13 | `prose`/`media` around the single slot. **No stepper change.** |
| `src/lib/env.ts` (+ test) | Modify | 21 | `RESEND_API_KEY` in `OPTIONAL_ENV_KEYS` |
| `docs/exercise-model.md` | Modify | 5, 21 | Non-goals rewrite; `status`/`visible` model |
| `src/lib/exerciseLifecycle.ts` (+ test) | Create | 5 | `canTransition` state-machine table |
| `src/lib/reactions.ts` (+ test) | Create | 9 | Reaction upsert data layer; `ReactionControl.tsx` island takes `authed` as a prop |
| `src/lib/exerciseValidatorCopy.ts` (+ test) | Create | 11 | `ValidationCode` → es/en message |
| `src/lib/{likes,exerciseStepper}.ts`, `0005`, `0006` | **Untouched** | — | Different signal; single-slot scope |

**~42 created · ~14 modified · 6 deleted** across sections 1–9 and this table.

---

## Testing strategy

| Layer | Area | What |
|---|---|---|
| Unit | `sessionCookieOptions` | `httpOnly` always true; `secure` per env; **and** passed through to `createServerClient` |
| Unit | `needsSession` | `_astro` and dotted segments false; pages and `/api` true |
| Unit | `canTransition` | Every legal edge; one illegal edge per state |
| Unit | `parseBlocks` | Valid; unknown `kind`; dangling/duplicate `slotId`; coverage gap; `null` → degrade, never throw |
| Unit | `blocksForStep` | Grouping incl. leading and trailing non-row blocks |
| Unit | `exerciseValidator` | One case per `ValidationCode`, plus **determinism**: run twice, `toEqual` on the full issue list. Largest suite in the change |
| Unit | `authoringDraft` | `moveBlock`, `setSlotAnswer`, `draftToPayload` round trip. Pure, no React |
| Unit | `roles` | `[]` on Supabase error → denied (**fail closed**) |
| Unit | `exercises.ts` | Four reads filter `visible`; author reads exclude `removed`. Existing mock-chain style |
| Component | Authoring islands | Gap appears on typing `___`; reorder via the **handle**, keyboard and pointer; Space in the textarea types a space |
| Component | `ExerciseIsland` + blocks | Absent `blocks` → markup identical to current; regression against the existing ~250-350 tests |
| SQL | `0007` (hand-run, output in the PR) | `attgenerated='s'`; direct write to `visible` errors; CHECK rejects `hidden_at` without `hidden_by` |
| SQL | `0009` trigger (hand-run) | N `too_hard` → stays `live`; N quality → `auditing` **and still `visible`**; reason change decrements; threshold update works with no deploy |
| E2E | Auth · gating · authoring · moderation (Playwright) | Request link → confirm → authenticated (expired token → no session); anonymous `fetch` asserted on the **HTML string**, never visibility; author → validate → publish → open the URL; non-moderator 404, moderator triages |

Rows **T1–T9 of the threat matrix below are additional RED tests**, not repeated here. Strict TDD is active: every row is a RED test written before its production code. `pnpm test`, `pnpm typecheck`, `pnpm test:e2e` gate every slice.

---

## Threat matrix

The design changes **HTTP routing** but introduces no shell, subprocess, VCS or PR automation.

| Boundary | Applicability | Reason |
|---|---|---|
| Documentation-like paths | **N/A** | No file-classification or execution boundary |
| Git repo selection / commit state / push state / PR commands | **N/A** | No VCS or PR automation in this change |

### Applicable HTTP-routing adversarial cases — carry unchanged into `tasks.md`

| # | Case | Expected safe behavior · RED test |
|---|---|---|
| T1 | `next=//evil.com`, `/\evil`, `https://evil`, `javascript:` at confirm | Redirect to `/${DEFAULT_LANG}/` · `authRedirect.test.ts` |
| T2 | `token_hash` present in the post-confirm redirect URL | Stripped before the 303 · `confirm.test.ts` |
| T3 | Anonymous POST to publish / reaction / any moderation endpoint | 401, **no row changed** · one test per endpoint |
| T4 | Authenticated non-owner POST editing another author's exercise | 403, **no row changed** · `guardar.test.ts` |
| T5 | Authenticated non-moderator POST to hide / remove / notify | 403, **no row changed** · one test per endpoint |
| T6 | Anonymous GET of a page with an authenticated-only section | Section absent from the HTML string · Playwright |
| T7 | Session-dependent response reaching a shared cache | `cache-control: private, no-store` present · `httpCache.test.ts` + endpoint tests |
| T8 | Direct write to `visible` | Postgres error · SQL script, slice 5 |
| T9 | Second reaction row for the same `(user_id, exercise_id)` | Unique violation → upsert, never a duplicate · `reactions.test.ts` |

---

## Rollout

Migrations run in order, each immediately before its slice merges. No feature flags: phases 0–4a are invisible to existing users, and phases 5–6 ship behind **unlinked routes** until slice 18 adds navigation, so reverting slice 18 alone hides the feature without touching data. Emergency levers, both deploy-free: `hidden_at`/`hidden_by` to kill one exercise, or `audit_dislike_threshold` set unreachably high to stop runaway auditing.

---

## Open questions

- [ ] **Postgres version** (owner prerequisite #8). Decides whether `attgenerated='v'` is reachable and how loudly `STORED` must be reviewed. Blocks slice-5 sign-off, not the design.
- [ ] **`@supabase/ssr` on `@astrojs/netlify`** — unverified by research (A7). Slice 2 must include a Netlify preview-deploy spike proving a session survives a real deploy **before** slices 3–4 build on it.
- [ ] **Magic-link email template** — `token_hash` link or implicit fragment link? Owner prerequisite #7. The server flow requires `token_hash`.
- [ ] **PR baseline** (proposal DEFECT 5) — owner picks `main`, `feat/ingles-likes-and-qr`, or a new tracker. Blocks slice 1, not the design.
- [ ] **`EXPLAIN` on the partial index** (slice 5) — PostgREST's parameterized `.eq` may not match `where visible`. Pre-existing, unmeasurable at one row. Record the plan for later.
