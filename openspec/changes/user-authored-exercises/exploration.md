# Exploration: User-Authored Exercises

Scope: end users author exercises through an interactive UI; quality control is
post-hoc (dislikes → auto `auditing` state → role-based moderation dashboard).
This document builds strictly on the constraints and decisions the owner has
already fixed (see prompt) and does not relitigate them.

## Current State (summary)

The exercise system today is entirely owner-authored, unauthenticated end to
end: content is written as hand-crafted SQL inserts, served through two
service-role Supabase clients with `persistSession: false` (`src/lib/supabase.ts:20-26`),
graded 100% client-side against an answer key shipped in the payload
(`src/lib/exerciseGrading.ts`), and rendered through a fixed
one-slot-per-step stepper (`src/lib/exerciseStepper.ts`,
`src/components/islands/ExerciseIsland.tsx`). There is no identity, no role,
no reaction beyond an anonymous, cookie-deduped "like" toggle
(`src/lib/likes.ts`, `supabase/migrations/0005_exercise_likes.sql`,
`0006_exercise_like_toggle.sql`). RLS is enabled with zero policies on every
table; only the server (service-role client) has ever touched this data.

## Affected Areas

- `src/lib/supabase.ts`, `src/middleware.ts` — auth session must be introduced here.
- `src/lib/exerciseStepper.ts`, `src/components/islands/ExerciseIsland.tsx` — the stepper collision (Q2).
- `src/lib/exercisePayload.ts`, `src/components/islands/mechanics/BlankSentence.tsx` and the four renderers — the `blocks` contract (Q3).
- `src/lib/likes.ts`, `supabase/migrations/0005_*.sql`, `0006_*.sql` — reaction model template (Q4).
- `supabase/migrations/0003_exercises.sql`, `0004_exercises_focus.sql`, `src/lib/exercises.ts` — status/state machine, ownership (Q5, Q7).
- `src/lib/exerciseTaxonomy.ts` — unaffected in shape, but every new author-facing focus/topic value must still pass through this closed vocabulary (no new implied requirement here beyond what already exists).
- `docs/exercise-model.md` — non-goals table needs a deliberate update (Q12).
- `supabase/seeds/progress/*.json`, `docs/exercise-authoring-brief.md` — manual bookkeeping, not code (Q10).

---

## Detailed Analysis — the 12 open questions

Each entry separates **Verified fact** (with `path:line`) from **Design
recommendation** (mine, to be ratified in proposal/design).

### Q1 — Auth for Astro SSR + Supabase on Netlify

**Verified facts**
- `src/lib/supabase.ts:20-26` — both existing clients set `persistSession: false, autoRefreshToken: false`; they are stateless, per-request, content-read clients, not session-bearing.
- `src/middleware.ts:18-52` — only sets `context.locals.lang`; no auth concept exists.
- `package.json:24-46` — `@supabase/supabase-js` `^2.58.0` is installed; `@supabase/ssr` is **not** a dependency today.
- `src/lib/pass.ts` (whole file) — the project's only precedent for "who is allowed to do X" is a hand-rolled HMAC-signed, HttpOnly cookie for an **anonymous** premium-access grant, explicitly documented as **"design decision #6: signed cookie, NOT Supabase anonymous auth"**. This is a real precedent for avoiding Supabase's own session machinery, but it is scoped to an anonymous, no-PII, short-lived grant — not to real user identity (email, password reset, a moderator emailing "the author").
- Astro's own official guide (fetched: `https://docs.astro.build/en/guides/backend/supabase/`) shows the "vanilla" pattern used by the framework's maintainers: raw `@supabase/supabase-js`, manual `Astro.cookies.set('sb-access-token', …)` / `Astro.cookies.set('sb-refresh-token', …)`, and `supabase.auth.setSession()` re-hydrated per request — **no `@supabase/ssr` required**.
- `@supabase/ssr` (Context7, `/supabase/ssr`) exposes `createServerClient(url, key, { cookies: { getAll, setAll } })`, handles refresh-token rotation, PKCE state, and large-JWT cookie chunking, and is framework-agnostic (no first-party Astro adapter, but the `getAll`/`setAll` contract maps directly onto `Astro.cookies`).

**Options**
| Option | Pros | Cons |
|---|---|---|
| A. Raw `@supabase/supabase-js` + manual cookies (Astro's own guide) | Zero new deps; matches existing `supabase.ts` style | DIY refresh-token rotation, no PKCE/cookie-chunking handling; more custom code to prove correct and keep tested |
| B. Add `@supabase/ssr`, `createServerClient` wired to `Astro.cookies` in middleware | Supabase-maintained refresh/PKCE/chunking; officially recommended | One new dependency; still needs ~30-50 lines of adapter glue (no first-party Astro binding) |
| C. Hand-roll full accounts (password hashing, sessions) avoiding Supabase Auth entirely, extending the `pass.ts` pattern | Total control; consistent with the one existing precedent | Reinvents password/session security the project has zero infrastructure for; loses free magic-link email delivery; the `pass.ts` precedent was scoped to anonymous grants, not real identity — extending it here is a materially different risk class |

**Recommendation:** **B**, using **magic link** (passwordless) rather than
email+password. Magic link avoids introducing password storage/hashing this
project has never needed, matches the low-friction, no-accounts-until-now
posture of the site, and can have OAuth layered on top later without
revisiting the session-cookie plumbing. Extend `src/middleware.ts` with a
session-aware Supabase client (new, third client kind — the existing anon/service clients
for content reads are unaffected) that calls `supabase.auth.getUser()`
(server-verified, not the unverified `getSession()`) and sets
`context.locals.user`.

**External research flag:** **YES.** Re-verify the exact `getUser()` vs
`getSession()` security guidance and the current `@supabase/ssr` API surface
against live Supabase docs before implementation — my evidence here is a
real, current package (`/supabase/ssr`) and Astro's own guide, but this is
precisely the kind of "official backend auth pattern" the SDD research lane
exists to pin down with dated citations before code is written.

---

### Q2 — Stepper collision (HIGH PRIORITY, confirmed real)

**Verified facts**
- `src/lib/exerciseStepper.ts:29-67` — the stepper is pure arithmetic over an
  index and a total count. It has **no concept of grouping** at all.
- `src/components/islands/ExerciseIsland.tsx:347-353` —
  `const total = payload.slots.length;` and `const slot = payload.slots[current];`
  bind the stepper 1:1 to `payload.slots`.
- `ExerciseIsland.tsx:537-605` — the render tree mounts **exactly one**
  `<Renderer>` (or `UnavailableRenderer`) per step. There is no loop over
  multiple slots inside one step anywhere in this component.
- Every per-slot mechanism assumes singularity: `controls.current.get(slot.id)`
  (line 367), `pendingFocus` (single string, line 370), the aria-live
  announcement narrating `` `${t.stepWord} ${formatStep(...)}: ${slot?.label}` ``
  (line 674).

**Conclusion:** this is a genuine structural collision, not an index-math
nuance. A `row` block containing two answerable slots requires
`ExerciseIsland` to render N renderers within a single step and to
generalize every "the current slot" concept to "the current step's slot(s)".

**Options**
| Option | Description | Effort | Trade-off |
|---|---|---|---|
| A. Stepper indexes **blocks**, not slots | Derive a `steps` array (`payload.blocks ?? slots.map(s => [s])`); render N `<Renderer>`s per step; generalize focus/aria/retry logic to a slot **set** | High | Fully honors the feature; touches `ExerciseIsland.tsx` extensively; backward-compatible by construction (blocks absent → identical behavior) |
| B. `row` grouping renders visually only outside the stepper (single-slot exercises) | Zero stepper changes | Low | Makes `row` a dead feature for any multi-slot exercise — i.e. most exercises per the authoring brief's 4-8 slot sweet spot (`docs/exercise-authoring-brief.md:392`) |
| C. `row` may combine **one** answerable slot with `prose`/`media` blocks only, never two slots | One step = one slot, unchanged | Low-Medium | Narrower than "row" implies, but sidesteps the whole collision safely |

**Recommendation:** Option A is the only one that makes `row` a real
authoring capability rather than a decorative dead end — but it is the
single highest-effort, highest-regression-risk item in the entire feature and
should be its **own isolated task/PR** with full `ExerciseIsland.test.tsx`
regression coverage, not bundled into the base `blocks` contract work. **I
recommend narrowing v1 scope to Option C** and treating true multi-slot row
stepping (Option A) as an explicitly separate, optional follow-up change once
the single-slot `blocks` contract has shipped and proven itself. This is a
scope call for the owner, surfaced here rather than decided silently.

---

### Q3 — `blocks` vs `slot.label`

**Verified facts**
- `src/lib/exercisePayload.ts:82-127` — the gap-bearing sentence lives
  **inside `slot.label`**; `BLANK_MARKER = /_{3,}/`; one blank per slot is a
  documented hard limit (lines 112-116).
- `src/components/islands/mechanics/BlankSentence.tsx` (whole file) — the
  shared component that splices `before + control + after` around the gap;
  it is the **only** place this sentence text is drawn.
- `DropRenderer.tsx:462-491` confirms concrete usage of
  `splitLabelAtBlank`/`BlankSentence`. The other three renderers were not
  individually re-read line-by-line in this pass; they are documented to
  share the same payload contract (`exercisePayload.ts`'s own module
  docstring, lines 1-16) — **flag to confirm in design**, not independently re-verified per file here.

**Options**
| Option | Description | Cost |
|---|---|---|
| (a) `prose` is context-only; `label` keeps the gap sentence exclusively | A `prose` block is pure narrative/instruction chrome around slots; grading text never moves | Zero changes to `parsePayload`, `BlankSentence`, all four renderers, and the 300+ seeded rows |
| (b) `blocks` supersede `label` when present | `prose` fully replaces gapped-sentence rendering; slots become bare answer controls | Rewrites `BlankSentence`, `splitLabelAtBlank`, all four renderers; needs a migration or dual-support path for every existing row |
| (c) `prose` supports a `{{slotId}}` placeholder token as an alternate gap marker | Relocates "where is the gap" from string content to block position | Still requires teaching every renderer a second way to source surrounding text — it is (b)'s cost with prettier syntax |

**Recommendation:** **(a)**. It is the only option compatible with the
owner's own stated invariant, "absent `blocks` = exactly today's behavior,"
the moment `blocks` is present for **any** reason (even just a leading
`media` block) — (b) and (c) both force every renderer to learn a second
text-sourcing path regardless. `prose` blocks sit between/around slots as
scenario-setting text; the graded gap sentence never leaves `slot.label`.

---

### Q4 — Reaction model + threshold trigger

**Verified facts**
- `exercise_likes` (`supabase/migrations/0005_exercise_likes.sql:32-37`) is a
  **denormalized counter**, PK = `exercise_id`, no per-user row at all.
- `increment_exercise_like(uuid)` / `decrement_exercise_like(uuid)`
  (`0005:61-73`, `0006_exercise_like_toggle.sql:67-81`) are atomic,
  `SECURITY DEFINER`, floor-at-zero via `greatest(count - 1, 0)` inside the
  `UPDATE`'s `SET` (race-safe under Postgres row locking — documented in the
  migration itself).
- The toggle state today is **the anonymous dedup cookie**, not a database
  row (`src/pages/api/me-gusta/[id].ts:88-93`) — explicitly documented as a
  "speed bump, not identity" (`src/lib/dedupCookie.ts:18-24`).
- **There is currently no dislike concept anywhere** — only a single "like" toggle.

**Options**
| Option | Description | Trade-off |
|---|---|---|
| A. Per-user reaction rows, `UNIQUE(user_id, exercise_id, kind)`, counter maintained by a trigger | Real identity-backed dedup (once Q1 lands); a trigger recomputes/upserts a denormalized `exercise_reactions` summary row on insert/delete | Needs Q1 (accounts) first; a genuine architectural upgrade over today's cookie-only dedup |
| B. Extend the exact `increment_exercise_like` RPC pattern: `increment_exercise_dislike(exercise, reason)` as a new atomic upsert-increment, still cookie-deduped | Minimal new surface, reuses a proven, tested pattern | Perpetuates cookie-only dedup for a signal whose whole purpose is triggering a real moderation action — a spoofed dislike wave becomes a spoofed audit-queue flood |

**Reason taxonomy:** `ambiguous | wrong_answer | too_hard | typo` — only
"quality" reasons (`ambiguous`, `wrong_answer`, arguably `typo`) should count
toward the audit threshold; `too_hard` is a difficulty-calibration signal,
not a defect signal, and counting it toward `auditing` would flag correct,
merely-hard exercises for deletion review — a false-positive class the owner
has not asked for.

**Threshold location:** a single-row config table (`app_config` or similar,
service-role only) rather than an environment variable or a hardcoded
constant, so it is tunable without a deploy — this matches the owner's
explicit requirement and needs no new infrastructure beyond one more RLS-on,
service-role-only table, following this schema's now-standard shape.

**Trigger vs cron:** a **Postgres trigger** (`AFTER INSERT` on the reactions
table, checking the quality-reason count against the config value and
flipping `status = 'auditing'` in the same transaction) is strictly simpler
and more consistent than a cron sweep: it requires no scheduled-function
infrastructure (this repo has none today — see Q9), and it makes the
state transition atomic with the triggering reaction, closing any window
where a 6th dislike could land before a periodic sweep notices the 5th.

**Migration path for `exercise_likes`:** leave the existing table and RPCs
untouched — "like" and "dislike" are different signals serving different
purposes (a like is decoration; a dislike drives moderation), and unifying
them into one polymorphic table is not required by anything the owner asked
for. Add a new, parallel table rather than migrating the old one.

**Recommendation:** Option A, gated behind Q1 (accounts), reason-filtered
threshold, trigger-based transition, tunable via a config table, `exercise_likes`
left alone.

---

### Q5 — Status state machine

**Verified facts**
- `published boolean not null default false` (`0003_exercises.sql:22`).
- Partial index `exercises_level_focus_published_idx` on `(level, focus) WHERE published` (`0004_exercises_focus.sql:150-151`).
- Three read sites filter `.eq('published', true)`: `getExerciseBySlug` (`src/lib/exercises.ts:141`), `getPublishedExercises` (`:250`), `getRelatedExercises` (`:356`).
- `exercise_likes.exercise_id … on delete cascade` (`0005:32-34`) — a hard `DELETE FROM exercises` silently destroys all like/dislike history, including the very reaction data a moderator would need to audit *why* something was flagged.
- No `status` column, no `deleted` concept, exists today.

**Options**
| Option | Description | Cost to the 3 existing read sites / index |
|---|---|---|
| A. Add `status text` (`draft\|published\|auditing\|needs_work\|deleted`); **derive** `published` from it via a Postgres **generated column** (`published boolean generated always as (status = 'published') stored`) | Zero — `published` keeps existing semantics automatically | None; index and all 3 queries untouched |
| B. Replace `published` with `status`; rewrite the index and all 3 `.eq('published', true)` sites to `.eq('status', 'published')` | — | Touches the hot read path and the index definition for no functional gain over A |
| C. Two independent columns, kept in sync by application code on every write | — | Reintroduces exactly the "forgotten flag" class of bug `0004`'s own migration commentary explicitly designed around (a write path that forgets to set both) |

**Recommendation:** **A**. A generated column is the only option matching
"zero changes to 300+ existing rows' query behavior" while adding the richer
lifecycle the moderation dashboard needs; the database enforces the
`published ⇔ status` invariant structurally, exactly like this schema's
existing philosophy of pushing invariants into constraints (`listening_requires_audio`, `focus` `NOT NULL` after backfill) rather than trusting every write path to remember.

**Delete: soft, not hard.** Use `status = 'deleted'` (excluded from every read site's WHERE clause, same fail-safe pattern already used for `published = false` and `focus = 'unassigned'`). A hard `DELETE` would cascade-destroy the moderation audit trail via `exercise_likes`' `ON DELETE CASCADE`, which is the opposite of what a moderation feature needs. Reserve hard delete for a separate, later, explicitly-audited "purge" action.

---

### Q6 — Roles/permissions

**Verified facts**
- No `profiles`, `user_roles`, or `role` column exists anywhere in the
  migrations (grepped `auth\.users|profiles|user_roles|role text|is_admin`
  across all `.sql` — the only hit is the `updated_by uuid references
  auth.users(id)` FK, `0003_exercises.sql:25`, which nothing ever writes).
- The entire schema follows **one** authorization pattern, without exception:
  RLS enabled, **zero** policies, only `service_role` (which bypasses RLS but
  still needs explicit table/function GRANTs — the exact bug `0002_book_downloads_grants.sql`
  and `0005`'s own commentary describe) ever touches these tables. The
  browser has never been granted anything.

**Options**
| Option | Fit with existing pattern | Per-request cost | Extensibility |
|---|---|---|---|
| A. `profiles.role` (single column, 1:1 with `auth.users`) | Exact match — one more service-role-only SELECT | One indexed round trip (or short-TTL cache) | One role per user only |
| B. `user_roles(user_id, role)` many-to-many | Same server-side check pattern as A | Same as A | Multiple roles per user, natively |
| C. Supabase custom JWT claims via a Postgres Auth Hook | New configuration surface this project has never used | Zero extra round trip (role is on the verified JWT) | Role change needs a token refresh to take effect — a real UX gap for "just promoted, should work now" |

**Recommendation:** **B**, checked from SSR middleware/route guards via the
service-role client. This matches the codebase's own established model
("server checks a table via service-role; RLS stays off for everyone else")
rather than introducing JWT-claim machinery the project has never touched,
and it is natively extensible to multiple roles per user — the owner's
explicit requirement #4. The roles table itself gets the schema's standard
posture: RLS on, no public policies, `service_role` only.

---

### Q7 — Slug collisions

**Verified facts**
- `UNIQUE (level, focus, slug)` (`0004_exercises_focus.sql:138-139`).
- `getExerciseBySlug` resolves the URL via `.eq('level',…).eq('focus',…).eq('slug',…).maybeSingle()` (`src/lib/exercises.ts:134-142`) — it can only ever return **one** row for a given triple.

**Options**
| Option | Description | Verdict |
|---|---|---|
| A. Global per-`(level,focus)` uniqueness kept; on a collision at INSERT, auto-append a short random suffix (e.g. nanoid), transparent to the author | Preserves the one-slug-one-URL invariant for every row; zero visual change to the 300+ existing rows | **Recommended** |
| B. Prefix user-authored slugs with an author handle | Makes ownership visible in the URL | Produces two permanently different slug shapes on the same site (owner rows vs. handle-prefixed rows) forever |
| C. Uniqueness per-author (`UNIQUE(level, focus, slug, author_id)`) | Never collides across authors | Two different authors could publish to the **identical** URL segment; `.maybeSingle()` can then only resolve to one of them non-deterministically, silently hiding the other — breaks the "stable, shareable deep link" contract (`docs/exercise-model.md:485-493`) |
| D. Drop the constraint | — | Rejected outright — reintroduces C's ambiguity for free |

**Recommendation:** **A**. Attempt the author's slug verbatim; on a
unique-violation, retry once with a short suffix and surface the final URL
to the author before publish.

---

### Q8 — Authoring UI input surface

**Verified facts**
- `@dnd-kit/core` `^6.3.1` is an existing dependency (`package.json:27`),
  already used for drag interaction in `DropRenderer.tsx` (`useDraggable`/`useDroppable`/`DndContext`, `KeyboardSensor` + `PointerSensor`, `closestCenter`, lines 26-49, 291-375, 403-408).
- `@dnd-kit/sortable` (the companion package purpose-built for **list
  reordering**) is **not** installed.
- `BLANK_MARKER = /_{3,}/` and `splitLabelAtBlank` (`exercisePayload.ts:102-127`) are already-written, already-tested logic that any gap-detecting input can reuse verbatim.

**Options for "type `___` to create a gap"**
| Option | Pros | Cons |
|---|---|---|
| A. Plain `<textarea>`, live-parsed with the existing `BLANK_MARKER` | Native control → IME, mobile keyboard, undo/redo, screen readers all work for free; source of truth is literally the string | No visual affordance that `___` is special until parsed feedback renders elsewhere |
| B. `contenteditable` with an inline chip widget | Closer to WYSIWYG | Well-known, still-unsolved cross-browser cursor/selection/undo/IME bugs — exactly the population (accented Spanish input) most exposed to them; zero precedent or test infrastructure in this codebase for rich-text editing |
| C. Token/chip-based structured input (explicit "insert blank" action, never raw typing) | No parsing ambiguity | Contradicts the owner's stated mental model verbatim (decision #6) |

**Recommendation:** **A**. Reuses tested code, matches the owner's literal
mental model, avoids introducing `contenteditable`'s open-ended risk into a
project whose testing infrastructure has no story for rich-text editing.

**Block reordering:** `@dnd-kit/core` alone can build a reorder list, but
`@dnd-kit/sortable` is the purpose-built, same-vendor layer for exactly this
(list reordering with strategy/animation handled). Recommend adding it as a
small, same-ecosystem dependency for the block-reorder UI specifically,
leaving `DropRenderer`'s existing `@dnd-kit/core` usage untouched.

---

### Q9 — Transactional email on Netlify

**Verified facts**
- No email-sending dependency exists in `package.json`.
- No Supabase Auth usage exists yet (ties to Q1 — Supabase Auth's own email delivery, if magic-link is adopted, is a *separate* concern from moderation notifications).
- `astro.config.mjs:8-13` — the SSR entry is *already* compiled into a single Netlify Function by the adapter; there is no `netlify/functions/` directory and no existing scheduled-function convention in this repo.
- `src/pages/api/validar-anuncio.ts` establishes the exact pattern for a server-only secret never reaching the client (`AD_HMAC_SECRET` via `loadEnv()`), and `src/lib/env.ts:57-64` shows the established `OPTIONAL_ENV_KEYS` extension point for a new secret.

**Options**
| Option | Fit |
|---|---|
| A. Resend (or comparable) called from a server-only Astro API route, triggered synchronously by the moderator's dashboard click | Matches the existing secret-handling pattern exactly; stays inside the one existing Netlify Function — no new execution environment |
| B. Supabase Auth email hooks/templates | Scoped to Supabase's own auth emails (magic link, invite, password reset) — not a general-purpose API for arbitrary moderation content; wrong tool |
| C. A separate Netlify (Scheduled) Function calling a provider | Only relevant if the emailing itself needs to be periodic, which it does not (see below); introduces genuinely new infrastructure this repo has never had |

**Recommendation:** **A**. The "email the author" action is inherently a
synchronous, on-demand moderator click — not a periodic sweep — so no
scheduled-function infrastructure is needed for emailing itself (a scheduled
function *may* still be relevant for the Q4 dislike-threshold sweep, but Q4's
own recommendation is a transaction-scoped trigger, which needs no schedule
either). Requirements satisfied: templating (basic HTML/template support in
any provider), a moderation log (`exercise_moderation_actions(exercise_id, action, actor_id, created_at)`, same RLS-on/service-role-only posture as every other table here) to prevent double-emailing, and no client-side secret exposure (proven pattern already exists).

**External research flag:** **YES**, specifically for Resend's current
API/integration shape and deliverability practice — outside this codebase's
existing knowledge and outside high-confidence training-data territory; this
is exactly what the SDD research lane is for.

---

### Q10 — Do the seed progress manifests break?

**Verified facts**
- `supabase/seeds/progress/{A1…C2}.json` each carry `level, target, current, nextBatchNumber, focusPool, focusCounts, usedSlugs` (`A1.json:1-25`, read in full).
- A repo-wide grep for `usedSlugs|nextBatchNumber|focusCounts|progress/` across `*.ts,*.js,*.md,*.mjs` returns **zero matches outside the JSON files themselves** — no script, page, build step, or test reads or writes these manifests.
- `docs/exercise-authoring-brief.md:1-8, 727-729` opens by stating it is "self-contained… for an AI model" that produces "one SQL file" — confirming these manifests are a **manual bookkeeping aid** consulted by whoever runs an authoring session, not application state.

**Conclusion:** user-authored exercises cannot corrupt these files in any
code-enforced sense — nothing running depends on them, so there is no crash
risk. What happens instead: the moment a user-authored exercise lands at a
given `(level, focus)`, these manifests go **silently stale** — `current`
under-counts reality, `focusCounts[focus]` under-counts real supply, and
`usedSlugs[focus]` is missing every user-chosen slug (mildly increasing —
never causing, since Q7 handles collisions at the DB level — the odds of
hitting the collision-retry path during a manual owner-authored batch).

**Recommendation:** documentation/process update only, no code or migration:
note that these manifests reflect **owner-authored batches only** going
forward, and that the live authoritative count is
`select level, focus, count(*) from exercises where published group by 1,2`.

---

### Q11 — Cold start & abuse surface

**Verified facts**
- `dedupCookie.ts:18-24` explicitly documents itself as "a SPEED BUMP, not
  identity" — both existing counters (likes, downloads) are openly
  acknowledged as spoofable by clearing a cookie or a bare `curl`.
- No per-IP/per-account rate limiting exists anywhere in the current API routes.
- `exercises` has no author-identity column that is ever written today (`updated_by` exists, unused).

**Two distinct risks**
1. **Cold start** — an exercise nobody has played accumulates zero reactions
   of either sign, so a purely reaction-driven quality signal cannot
   distinguish "unseen" from "flawless." This is inherent to any post-hoc
   model and can only be mitigated (e.g. surfacing "new" content
   differently), not solved — flag to the owner as a known limitation rather
   than a defect to fix in v1.
2. **Abuse** — real accounts (Q1) let a `UNIQUE(user_id, exercise_id)`
   constraint close the cookie-clearing loophole *for the new dislike
   signal* (and incidentally would improve the existing anonymous like
   counter too, if the owner ever wants that — separate decision, not
   assumed here). It does **not** stop a determined account holder from
   disliking every exercise once, nor stop authorship spam. The owner's
   explicit requirement that `auditing` must not hide content is precisely
   what prevents a dislike-brigade from being usable as a censorship tool —
   it can only route to human review, never silently suppress.

**Recommendation — in scope for v1:** reactions require an authenticated
account; the sole anti-abuse mechanism is the per-`(user, exercise)` UNIQUE
constraint (no rate limiting beyond "one reaction per exercise per user").
**Explicitly deferred, flagged to the owner as an undecided requirement:**
authorship rate limiting (exercises published per account per day/hour) and
any velocity-based spam heuristics — nothing in this codebase has ever
needed this kind of guard, so it is genuinely new risk surface the owner has
not yet been asked to size.

---

### Q12 — Non-goals that now conflict

**Verified facts:** `docs/exercise-model.md:756-765`.

| Non-goal | Status under this feature |
|---|---|
| "No accounts" | **Directly invalidated.** Authoring and moderation both require real identity (Q1, Q6). Must be rewritten, not merely footnoted. |
| "Per-user progress, scores, streaks" | **Stays**, but must be **narrowed to learners explicitly.** Author identity (`updated_by`, roles) is a different population than the "no learner progress" decision was ever about; leaving the wording as-is would make a reader think this feature reverses it. |
| "Server-side answer validation" | **Stays as-is for grading** (client-side grading is unaffected). A *different*, new server-side check is added — the deterministic **structural** pre-publish validator (owner decision #7) — which validates payload shape, never the learner's answer. Not a contradiction; needs one clarifying sentence, not removal. |
| "A `mechanics` database table" | **Unaffected.** Not implicated by anything in this feature. |

**Recommendation:** update the non-goals table during `sdd-spec`/`sdd-design`
(not now): strike "No accounts," narrow the progress non-goal to "learners,"
append a clarifying sentence to the server-side-validation non-goal, leave
the mechanics-table line untouched.

---

## Surfaced requirements the owner has not stated

These are implied by the feature but not yet decided — flagging early per
the owner's explicit request, not deciding them here:

1. **Account recovery** — if magic-link auth (Q1) is adopted, what happens
   when an author loses access to their email? No account-recovery story exists anywhere in this project today.
2. **Author-facing "my exercises" view** — the owner described a *moderator*
   dashboard, never an *author's own* view of their drafts/published/`needs_work` exercises. Without one, a "please finish your exercise" email has no obvious destination to act on.
3. **Content policy / terms acceptance** — publishing user-generated content
   typically needs an explicit guidelines/ToS acceptance step; not mentioned.
4. **Account deletion semantics** — `updated_by uuid references auth.users(id)` (`0003_exercises.sql:25`) has no `ON DELETE` action today (defaults to `NO ACTION`), meaning a user cannot currently be deleted from `auth.users` while they still own rows, unless this is changed. What should happen to an author's exercises (and their reaction history) if the account is deleted?
5. **First-time-author quality gate** — nothing distinguishes a brand-new,
   unvetted account from a trusted long-time author. The owner may want new
   authors' first N exercises auto-flagged for review rather than published
   immediately — a stronger alternative to pure post-hoc moderation that
   should be an explicit owner choice, not a silent design decision.
6. **Authoring UI localization** — exercise *content* is English-only by
   contract, but the authoring *chrome* (buttons, validator error messages)
   presumably needs the same es/en `COPY` pattern used everywhere else in
   this codebase; not addressed by the prompt.
7. **Editing a published exercise** — can an author edit after publish? If
   so, does it reset `auditing`/`needs_work`, and does it re-run the
   structural validator? Not stated.

## External research needed vs. codebase-answerable

| # | Topic | Codebase-answerable? | External research needed |
|---|---|---|---|
| 1 | Auth for Astro SSR | Partially | **Yes** — current `@supabase/ssr` API, `getUser()` vs `getSession()` guidance |
| 2 | Stepper collision | Yes | No |
| 3 | `blocks` vs `label` | Yes | No |
| 4 | Reaction model | Mostly | Light — pg_cron/pg_net guidance only if cron is ever chosen over the recommended trigger |
| 5 | Status state machine | Yes | No |
| 6 | Roles/permissions | Mostly | Light — Supabase Auth Hooks/custom claims, only if that path is revisited later |
| 7 | Slug collisions | Yes | No |
| 8 | Authoring UI input | Yes | Light — `@dnd-kit/sortable` current API, if adopted |
| 9 | Transactional email | Partially | **Yes** — Resend (or alternative) integration specifics |
| 10 | Seed manifests | Yes | No |
| 11 | Cold start & abuse | Yes (reasoning-level) | No |
| 12 | Non-goals conflict | Yes | No |

Recommend running `sdd-research` for items 1 and 9 before `sdd-design` locks
in the auth and email approach.

## Phase order — validated, one refinement proposed

The owner's proposed order (`0 Identity → 1 Ownership+state → 2
Reactions+audit → 3 Deterministic validator → 4 blocks contract → 5
Authoring UI → 6 Moderation dashboard`) is sound: each phase's dependencies
are satisfied by the ones before it (roles/identity before ownership,
ownership/state before reactions can flip a status, a validator before the
UI that must call it, the payload contract before the UI that authors
against it, both before a dashboard that needs to display and act on all of
it).

**One refinement:** given Q2's finding, split phase 4 into **4a — `blocks`
contract, `prose`/`media`/single-slot `row` only** (Option C from Q2) and an
explicitly separate, optional **4b — multi-slot row + stepper rework**
(Option A from Q2). Bundling 4b's full `ExerciseIsland` rework into the base
contract phase risks turning the highest-uncertainty item in the whole
feature into a blocker for authoring UI and dashboard work that does not
actually need it.

## Risks

- Q2 (stepper/row rendering) is the single largest source of regression risk
  against the ~250-350 existing exercise tests if scoped as full multi-slot
  rows; scoping to single-slot rows (recommended) contains this.
- Q1 (auth) and Q9 (email) both carry unverified-against-current-docs risk
  until `sdd-research` runs; do not lock design decisions for these two
  before that.
- Q5's generated-column approach requires Postgres 12+ support verification
  against the actual Supabase project's Postgres version before design.
- Q12's non-goals rewrite is a documentation change with no test coverage of
  its own — verify manually during archive that the rewritten non-goals
  table still reads consistently with the shipped feature.

## Ready for Proposal

**Yes**, with two explicit decisions the orchestrator should get the owner
to confirm before `sdd-propose` locks scope:
1. Narrow v1 `row` blocks to single-slot (Q2/Option C), deferring true
   multi-slot stepper rework to a follow-up change.
2. Acknowledge the 7 surfaced-but-undecided requirements above — at minimum
   items 2 (author's own view) and 4 (account deletion semantics) are hard
   to defer once accounts exist, since they touch the same migration that
   introduces `auth.users` references.

## Key Learnings

1. `ExerciseIsland.tsx` renders exactly one slot per stepper step today, confirmed at `payload.slots[current]` with a single `<Renderer>` mount — a `row` block with multiple answerable slots is a structural collision, not an index-math nuance.
2. The `exercise_likes` counter and its `increment_exercise_like`/`decrement_exercise_like` RPCs are a proven, race-safe template (floor-at-zero inside the `UPDATE SET` expression) directly reusable for a new per-user dislike-reaction table.
3. `supabase/seeds/progress/*.json` manifests are pure manual bookkeeping — a repo-wide grep confirms zero code paths read or write them, so user-authored content cannot corrupt them, only make them stale.
4. `src/lib/pass.ts` documents an explicit prior decision to avoid Supabase's own session machinery for an anonymous grant; this precedent does not extend to real user identity, which genuinely needs `@supabase/ssr` or equivalent.
5. Every table in this schema follows one authorization pattern without exception — RLS enabled, zero policies, service-role-only access — so any new roles/reactions/moderation table should follow the identical posture rather than introducing RLS policies for the first time.
