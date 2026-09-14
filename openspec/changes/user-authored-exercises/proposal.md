# Proposal: User-Authored Exercises

**Artifact**: `gentle-ai.sdd-proposal/v1` · **Revision**: 2 · **Change**: `user-authored-exercises`
**Store mode**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/proposal`)
**Delivery**: `auto-chain`, 400 changed lines per PR
**Upstream**: `exploration.md` · `research.md` rev 3 · `preproposal.md` rev 3 · gatekeeper corrections rev 1

> **Revision 2 corrects four false premises and one semantic bug.** The library is not 300+ rows — it is **one row**. There were four `published` read sites, not three. The proposed `published = (status = 'published')` expression would have hidden `auditing` rows, silently rebuilding the exact censorship vector the owner ruled out. The PR chain was stacked against a `main` baseline that does not exist. See *Corrections applied*.

---

## Corrections applied (rev 1 → rev 2)

| # | Was | Is | Consequence |
|---|---|---|---|
| 1 | "300+ existing rows" | **1 row** — `daily-standup-routine`, A2/writing/`present-simple`, 5 mixed slots. `0004:26` says "at ~5 published rows". Batch seeds were never tracked. | Migration risk drops to near-zero. Backfill is one row. Ceremony removed. |
| 2 | 3 read sites | **4** — `exercises.ts:141, 200, 250, 356`. `:200` is the facets query behind entry-screen navigation. Plus 4 test assertions (`exercises.test.ts:154, 353, 420, 638`) and `seeds/exercises_a1_test.sql:8`. | Migration and read-layer work is ONE atomic slice. |
| 3 | `published boolean generated as (status = 'published')` | **Semantic bug.** `auditing` would evaluate false at all four sites → invisible. That IS the content-DoS weapon the owner rejected. Present in both rev-1 options. | `published` is **dropped entirely**. See *Data model*. |
| 4 | Progress manifests "go stale" | **They are fiction.** Six files describe **402 exercises**; one exists. `A1.json` is internally inconsistent too (`focusCounts.present-simple: 16`, `usedSlugs` lists 18). | Real task: reset to truth or delete. Not a footnote. |
| 5 | 23 stacked PRs to `main` | `origin/main...HEAD` = **`0 62`**. HEAD is `feat/ingles-likes-and-qr`, 62 ahead / 0 behind. The whole English section is unmerged. | **Blocking owner decision.** Options below; not resolved here. |
| 6 | User content supplements a curated library | With 1 exercise, user content **IS** the content engine. | Cold start becomes THE central risk. Value ordering shifts; dependency graph does not. |

---

## Owner prerequisites — START TODAY

External lead time. None are code tasks.

| # | Action | Where | Lead time | Gates |
|---|---|---|---|---|
| 0 | **Decide the PR baseline** (see *PR chain → blocking prerequisite*) | — | — | **Everything** |
| 1 | Create **Resend** account | resend.com | Minutes | 2–5 |
| 2 | Verify a **transactional subdomain** (`mail.chuyocode.com`), not the apex | Resend → Domains | Hours | 3–5 |
| 3 | Publish **SPF, DKIM, DMARC** | Registrar | **Up to 48h propagation** | 4, 5, Phase 6 |
| 4 | **Disable open/click tracking** on that subdomain | Resend → Domain settings | Minutes | Phase 0 |
| 5 | Configure **custom SMTP** in Supabase Auth (`smtp.resend.com:587`, user `resend`, pass = API key) | Supabase → Auth → SMTP | Minutes, gated on 3 | Phase 0 |
| 6 | Set **Site URL** + **redirect allow-list** (local, Netlify deploy-preview pattern, production) | Supabase → Auth → URL Configuration | Minutes | Phase 0 |
| 7 | Review the **magic-link template** — the server flow needs a `token_hash` link, not an implicit fragment link | Supabase → Auth → Email Templates | Minutes | Phase 0 |
| 8 | Run `select version();` and report it | Supabase SQL editor | Seconds | Phase 1 |

> **#4 is the one people forget.** Link tracking rewrites URLs. A rewritten magic link is a broken magic link — sign-in fails silently for every user.

**Resend plan**: free tier 3,000/month with a **100/day cap**, shared between magic links and moderation email. Pro ($20/mo) removes the daily cap.

---

## Intent

The exercise library contains **one exercise**. Six CEFR levels × a closed focus vocabulary sit empty. The owner-authored pipeline — hand-written SQL batches — has produced one durable row since `0003`.

So this change is not "add community contributions to a curated library." **It builds the content engine.** User authorship is the primary supply mechanism, not a supplement.

Quality control is **post-hoc by design**: learners dislike with a reason, a threshold flips the exercise to `auditing`, and a role-gated moderator either removes it or emails the author. No pre-publish human gate — a deterministic structural validator is the only thing between an author and live content.

This is the first change in the project's history to introduce **real user identity**. That is why it is large, and why it is phased.

---

## Scope

### In scope

| # | Deliverable |
|---|---|
| 1 | Magic-link authentication (`@supabase/ssr`), server-verified session on `context.locals` |
| 2 | `user_roles` many-to-many + server-side role checks for moderation routes |
| 3 | **Three-axis exercise model**: `status` lifecycle, generated `visible`, audit timestamps. `published` dropped. |
| 4 | Exercise ownership (`author_id`) and soft delete |
| 5 | Per-user reactions with dislike reasons; tunable threshold flips `status = 'auditing'` via trigger |
| 6 | Deterministic structural pre-publish validator (server-side, payload shape only) |
| 7 | `blocks` payload contract — `prose`, `media`, **single-slot** `row` |
| 8 | Authoring UI (plain `<textarea>` + `BLANK_MARKER`, drag-reorder blocks) |
| 9 | "My exercises" — drafts / live / `needs_work`, with an edit entry point |
| 10 | Editing a live exercise: re-runs the validator, clears `needs_work` |
| 11 | Moderation dashboard: audit queue, manual hide, remove, email the author |
| 12 | Transactional email via **Resend** (HTTP API for moderation, SMTP relay for Supabase Auth) |
| 13 | Terms acceptance checkbox recorded on first publish |
| 14 | **Reset or delete the fictional progress manifests** (402 claimed vs 1 real) |
| 15 | Documentation updates (see *Documentation changes*) |

### Out of scope — explicitly, and ruthlessly

| Deferred | Why |
|---|---|
| **Multi-slot `row` blocks + `ExerciseIsland` stepper rework** | Highest-regression item in the feature. `ExerciseIsland.tsx:347-353` binds the stepper 1:1 to `payload.slots`; generalizing to "the current step's slot set" touches focus management, aria-live narration and retry logic against ~250-350 tests. Own follow-up change (`4b`). |
| **Astro 5 → 7 upgrade** | On `astro@^5.18.2`; latest 7.3.2, `@astrojs/netlify@8` peers `astro@^7`. `@supabase/ssr` has **zero** Astro dependency. A two-major upgrade inside an auth change is how you lose a weekend to an unrelated regression. |
| **Hard delete / purge** | `exercise_likes.exercise_id` is `ON DELETE CASCADE` (`0005:32-34`). A hard `DELETE` destroys the reaction evidence justifying the removal. Soft only. |
| **Rate limiting on authorship** | No rate limiting exists anywhere today. Genuinely new surface, unsized. v1's only anti-abuse mechanism is `UNIQUE(user_id, exercise_id)` on reactions. |
| **Account recovery beyond magic link** | Losing email access loses the account. No recovery story exists today. |
| **First-time-author review gate** | Owner decision: new authors publish directly. The state machine makes enabling a gate later a config flip, not a redesign. |
| **RLS policies** | None needed. See *Approach → security posture*. |
| **Migrating `exercise_likes`** | A like is decoration; a dislike drives moderation. Different signals, different tables. Existing table and RPCs untouched. |
| **New publishable/secret API key scheme** | Worth doing, but defence-in-depth on the existing read path, not a dependency. Separate small change. |
| **Automatic hiding on dislike volume** | Ruled out on principle. See *Data model*. |

---

## Capabilities

> Contract with `sdd-spec`. `openspec/specs/` is **empty** — this change establishes the first specs.

### New Capabilities

- `user-identity`: magic-link sign-in/out, server-verified session, `context.locals.user`, route guards
- `user-roles`: role assignment, server-side authorization for moderation surfaces
- `exercise-lifecycle`: `status` state machine, generated `visible`, ownership, soft delete, audit timestamps, edit-after-publish
- `exercise-reactions`: per-user like/dislike with reason taxonomy, threshold-driven `auditing` transition
- `exercise-validation`: deterministic structural pre-publish validator
- `exercise-blocks`: `prose` / `media` / single-slot `row` payload contract
- `exercise-authoring`: authoring UI, block editing and reordering, publish flow, "my exercises"
- `exercise-moderation`: moderation dashboard, manual hide, removal, author notification email

### Modified Capabilities

None. No existing spec files exist to delta against.

---

## Approach

### Data model — three axes, corrected (DEFECT 3)

`published boolean` is **DROPPED ENTIRELY**. One boolean was carrying three unrelated jobs.

| Axis | Storage |
|---|---|
| **Lifecycle** — where the row is | `status text` → `draft \| live \| auditing \| needs_work \| removed` |
| **Visibility** — whether learners see it | `visible boolean generated always as (status in ('live','auditing') and hidden_at is null) STORED` |
| **History / audit** — when and by whom | `published_at timestamptz`, `hidden_at timestamptz`, `hidden_by uuid` |

Why each piece:

- **`published` → `live`.** The old state name collided with the visibility concept. `status = 'live'` and `visible = true` are now different questions with different answers, and the names say so.
- **`auditing` stays visible.** `status in ('live','auditing')` is the whole point of the correction. Automatic auditing NEVER hides. Hiding on N dislikes is a content-DoS vector — any coordinated group could delete content by disliking it.
- **`hidden_at` / `hidden_by` are the manual override.** The real case is "this one is bad enough to hide while I contact the author." A named human, a timestamp, an auditable act. Never automatic.
- **`STORED` is load-bearing.** PG 12–17 made omitting it a syntax error; current Postgres defaults generated columns to **VIRTUAL**. Omitting it now silently produces the wrong column kind with no error. Write it explicitly and review it as such. (Owner prerequisite #8 confirms the version.)
- **CHECK constraint** enforces legal `status`/`hidden_at` combinations, consistent with this schema's existing philosophy (`listening_requires_audio` in `0003`). Exact predicate pinned in design; shape is "`hidden_at` and `hidden_by` are both null or both set, and a hidden row is `live` or `auditing`."

**Design rule, stated once and applied everywhere:** *an enum describes WHERE you are, never HOW you got there or WHO decided.* Why a row is in `auditing` lives in the reactions table. Who changed its state lives in the moderation log. Neither belongs on `exercises`.

**Why a generated column at 1 row.** Not performance — the visibility rule is **non-trivial**: two columns, three conditions. Left in application code it would be duplicated across four call sites where someone eventually forgets half. That is the exact "forgotten flag" bug class `0004`'s own commentary was written against. A non-trivial invariant belongs where the database enforces it, at any row count.

**All four read sites collapse to `.eq('visible', true)`.** The partial index becomes `(level, focus) where visible`.

### Security posture — unchanged, and that is the headline

Every table runs **RLS enabled with zero policies**; only the service-role client has ever touched data. Research confirmed this posture **survives authentication intact**: Supabase evaluates access against RLS policies *and* the JWT together, and with zero policies there is nothing to grant. An authenticated JWT receives exactly what an anonymous one does — nothing.

**No RLS policies are written in this change.** Auth adds identity; it does not add client database access. Every new table follows the identical posture.

### Phase plan — dependencies unchanged, value order shifted (DEFECT 6)

| Phase | Deliverable | Depends on | Value now |
|---|---|---|---|
| **0** | Identity — `@supabase/ssr` session, magic link, route guards | — | Gate for everything |
| **1** | Ownership + three-axis model | 0 | Gate for everything |
| **2** | Reactions + audit trigger | 0, 1 | **Dormant** until traffic exists |
| **3** | Deterministic structural validator | — (pure library) | Buildable in parallel with 0–2 |
| **4a** | `blocks` contract — `prose` / `media` / single-slot `row` | 3 | Backward-compatible by construction |
| **5** | Authoring UI + "my exercises" | 0, 1, 3, 4a | **⬆ THE value delivery.** Where content starts existing. |
| **6** | Moderation dashboard + email | 0, 1, 2, 5 | **⬇ Dormant.** Moderating an empty pool delivers nothing. |
| ~~4b~~ | ~~Multi-slot rows + stepper rework~~ | — | Deferred to a separate change |

The DEPENDENCY graph is untouched — identity and ownership still precede authoring. Only the **value argument** moved: build phases 2 and 6 knowing they stay dormant until volume exists, rather than assuming they work from day one. Phases 2 and 6 can be deferred to a follow-up change without blocking any value, if the owner wants a shorter path to first content.

### Ratified design decisions

| Decision | Choice | Why |
|---|---|---|
| Auth library | `@supabase/ssr` `createServerClient` wired to `AstroCookies` | First-party Astro quickstart; library owns refresh rotation, PKCE, cookie chunking |
| Session verification | **`getUser()`**, never `getSession()` | `getSession()` reads client storage and is insecure on the server. Decides every route guard. |
| Magic link flow | `signInWithOtp` → emailed `token_hash` → server confirm route calls `verifyOtp({ type: 'email', token_hash })`, then strips `token_hash`/`type` from the redirect | Fragment implicit flow is client-only, unreachable by SSR middleware. `magiclink`/`signup` types are deprecated. |
| Cookie flags | Explicit `{ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }` | `@supabase/ssr` `DEFAULT_COOKIE_OPTIONS` ships `httpOnly: false` and **never sets `secure`**. `sameSite: 'strict'` breaks magic link — withholds cookies on the cross-site top-level navigation into the confirm route. |
| Visibility | Generated `visible` column, `published` dropped | See *Data model*. |
| Remove | Soft, `status = 'removed'` | Hard delete cascades away the moderation audit trail |
| Roles | `user_roles(user_id, role)`, checked server-side via service-role | JWT custom claims need a token refresh for a role change to take effect |
| Reactions | Per-user rows, `UNIQUE(user_id, exercise_id)`, counter by trigger | Closes the cookie-clearing loophole the existing like counter openly documents |
| Reason taxonomy | `ambiguous \| wrong_answer \| too_hard \| typo`; **`too_hard` does NOT count toward the threshold** | `too_hard` is difficulty calibration, not a defect signal. Counting it flags correct-but-hard exercises. |
| Threshold storage | Single-row config table, service-role only | Tunable without a deploy |
| Audit transition | `AFTER INSERT` trigger, not cron | Atomic with the triggering reaction; zero scheduled-function infrastructure here |
| `prose` blocks | Context-only; the graded gap sentence never leaves `slot.label` | Any other option forces all four renderers to learn a second text-sourcing path |
| Slug collisions | Keep `UNIQUE(level, focus, slug)`; try verbatim, retry once with a short suffix, show the final URL before publish | Preserves the one-slug-one-URL deep-link contract |
| Authoring input | Plain `<textarea>` live-parsed with the existing `BLANK_MARKER = /_{3,}/` | `contenteditable` has unsolved cursor/IME bugs and zero test infrastructure here |
| Email | **Resend** — HTTP API for moderation, SMTP relay for Supabase Auth | One verified domain + one API key serves both. SMTP on every plan. Runtime deps are `postal-mime` + `standardwebhooks`; `@react-email/render` is an optional peer and is not pulled in. |
| Account deletion | Exercises survive as community content; author reference moves to a placeholder | `updated_by` has **no `ON DELETE` action** (`0003:25`), so a user owning rows cannot be deleted from `auth.users` at all today. Fixed in the same migration. |

### HARD RULE — never set `middlewareMode: 'edge'`

`astro.config.mjs:13` calls `netlify()` with no options, so middleware runs inside the Netlify Function on the Node runtime — the same execution model as `@astrojs/node`, which is what `@supabase/ssr` is verified against.

With **edge** middleware the adapter serializes `context.locals` to JSON and ships it in a header to the rendering function. A Supabase session client cannot survive that serialization. Auth breaks **silently**. Document this in `astro.config.mjs` alongside the setting.

### Mandatory prerequisite — dependency bump

`@supabase/ssr@0.12.x` peers on `@supabase/supabase-js@^2.114.0`. The project is on `^2.58.0`. **The entire 0.12 line requires `^2.108`+ and only raises it — there is no escape hatch.**

| Package | Installed | Required | Note |
|---|---|---|---|
| `@supabase/supabase-js` | `^2.58.0` | `^2.114.0` | **Blocking bump** |
| `@supabase/ssr` | — | `0.12.7` | New |
| `@dnd-kit/sortable` | — | `10.0.0` | Peers `@dnd-kit/core@^6.3.0` — **compatible with installed 6.3.1, no core bump** |
| `@dnd-kit/utilities` | — | — | Pulled in for `CSS.Transform`; budget two packages, not one |
| `resend` | — | `6.28.0` | `engines: node >=20` — satisfied |
| `astro` | `^5.18.2` | unchanged | Upgrade explicitly out of scope |

### The migration — no longer the riskiest step (DEFECT 1)

Rev 1 called this "the single riskiest step" and built ordering ceremony around not corrupting 300+ rows. **There is one row.** The data-volume risk is gone. Say it plainly:

- Backfill is **one row**: `daily-standup-routine`, `published: true` → `status = 'live'`, `published_at = created_at`.
- Adding a `STORED` generated column rewrites the table. At one row this is instantaneous.
- No branch-database rehearsal ceremony is warranted by row count. Still wrap in `BEGIN; … COMMIT;` — that is baseline hygiene, not risk mitigation.

What remains genuinely risky is **breadth, not volume**: dropping `published` breaks every reader at once. All of it lands in one atomic slice.

**Write-site audit — CLOSED.**

| Site | Verdict |
|---|---|
| `seeds/exercises_a1_test.sql:8` — `insert (… , published)` | **BREAKS.** Must write `status` instead. Same slice. |
| `0004_exercises_focus.sql:108` — `set focus='unassigned', published=false` | **Safe.** Historical migration; on a fresh DB it runs before the new one while `published` is still plain. No change. |
| `src/**` TypeScript | **Zero writes.** `exercises.ts` only reads. |

**Read-site audit — CORRECTED (DEFECT 2).** Four sites, not three, plus four test assertions:

| Site | Function | Change |
|---|---|---|
| `exercises.ts:141` | `getExerciseBySlug` | `.eq('published', true)` → `.eq('visible', true)` |
| `exercises.ts:200` | `getExerciseFacetRows` — **entry-screen navigation** (missed in rev 1) | same |
| `exercises.ts:250` | `getPublishedExercises` | same |
| `exercises.ts:356` | `getRelatedExercises` | same |
| `exercises.test.ts:154, 353, 420, 638` | `expect(eqMock).toHaveBeenCalledWith('published', true)` | → `('visible', true)` |
| `0004:149-151` index | `exercises_level_focus_published_idx … where published` | → `… where visible` |

Missing `:200` in rev 1 would have left the entry screen's facet query filtering on a dropped column — a hard failure on the site's main navigation.

### The progress manifests are fiction, not stale (DEFECT 4)

| File | Claims | Reality |
|---|---|---|
| `A1.json` | `current: 81`, `nextBatchNumber: 3`, per-focus counts, 81 slugs | — |
| `A2.json` | `current: 81` | — |
| `B1` / `B2` / `C1` / `C2`.json | `current: 60` each | — |
| **Total claimed** | **402 exercises** | **1 exercise** |

`A1.json` does not even agree with itself: `focusCounts["present-simple"] = 16`, while `usedSlugs["present-simple"]` lists 18. The batch seed files these manifests track (`exercises_a1_1.sql` etc.) were **never tracked on any branch** — `git ls-files "supabase/"` returns 6 migrations, one test seed, and these 6 manifests.

Rev 1 treated this as documentation staleness with mitigation "Accepted, nothing reads them." That is wrong. Nothing reads them **programmatically**; humans read them, and they will conclude the library has 402 exercises. These files actively mislead. **Reset to true values or delete them.** It is a scope item (#14), not a footnote.

---

## PR chain

### Blocking prerequisite — the baseline does not exist (DEFECT 5)

```
git rev-list --left-right --count origin/main...HEAD  →  0   62
git branch --show-current                             →  feat/ingles-likes-and-qr
```

HEAD is **62 commits ahead of `origin/main` and 0 behind**. The entire English exercises section — everything this change builds on — is **unmerged**. Rev 1's "23 stacked PRs to `main`" assumed a clean `main` baseline that does not exist; stacking on `main` today would produce slices that cannot even compile against it.

**This is an owner decision, not a proposal decision.** Options, with the tradeoff each carries:

| Option | Baseline | Tradeoff |
|---|---|---|
| **A** — Merge `feat/ingles-likes-and-qr` into `main` first | `main` | Cleanest. But it is a 62-commit review event of its own, ahead of any work here. |
| **B** — Treat `feat/ingles-likes-and-qr` as the integration branch; stack slices onto it | `feat/ingles-likes-and-qr` | No upfront review cost. But the branch keeps growing and the eventual merge gets larger, not smaller. |
| **C** — Cut `feat/user-authored-exercises` from HEAD as a tracker; children chain onto it (Feature Branch Chain) | new tracker off HEAD | Isolates this feature from the 62 commits. Adds one long-lived branch and the drift that comes with it. |

**Nothing below can start until the owner picks one.** The slice list and dependency graph are baseline-agnostic — only the root node changes.

### Strategy and slicing

**Stacked chain, rooted at the chosen baseline.** Phases 0–4a are each independently mergeable and invisible to existing users. Phases 5–6 ship behind **unlinked routes**; slice 18 adds the navigation entry.

**The chain SHRINKS: 23 slices → 21.** Where it shrank and why:

| Rev 1 | Rev 2 | Reason |
|---|---|---|
| 1 + 2 separate | merged into 1 | Dep bump was ~60 lines. With near-zero migration risk there is no reason to isolate it. |
| 6 (migration) + 8 (read layer) separate | merged into 5 | **Forced.** Dropping `published` breaks all four readers at once — they cannot land in different PRs. |
| 23 (nav + docs) separate | folded into 21 | Trivial once moderation lands. |
| Progress-manifest note | folded into 5 | Same work unit: telling the truth about content volume. |

It does not shrink further. What binds now is the **400-line budget**, not risk — the remaining slices are each a distinct deliverable work unit with its own tests.

Estimates are `additions + deletions`, excluding lockfile.

| # | Slice | Phase | Est. | Independently valuable because |
|---|---|---|---|---|
| 1 | Bump `supabase-js` → `^2.114`, add `@supabase/ssr`, session client factory, hardened `cookieOptions` + tests | 0 | ~360 | Existing client suite proves the bump; factory is unit-testable in isolation |
| 2 | Middleware wiring — `getUser()` → `context.locals.user`; `middlewareMode` rule documented | 0 | ~250 | Session becomes observable; nothing consumes it yet |
| 3 | Sign-in / confirm (`verifyOtp` + strip `token_hash`) / sign-out routes | 0 | ~350 | Full auth round trip, verifiable end to end |
| 4 | Sign-in UI + es/en `COPY` | 0 | ~300 | Auth is usable |
| 5 | **Migration + full read-layer cutover**: drop `published`; add `status`, `visible` (STORED), `published_at`, `hidden_at`, `hidden_by`, CHECK; reindex on `visible`; `author_id`; `updated_by ON DELETE`; seed SQL fix; all 4 read sites; 4 test assertions; reset/delete progress manifests | 1 | ~380 | Atomic by necessity — this is the one place the old column dies |
| 6 | `user_roles` + server-side role lookup + tests | 1 | ~250 | Moderator identity exists |
| 7 | Lifecycle-aware queries — exclude `removed`, author-scoped reads | 1 | ~250 | "My exercises" data layer exists before its UI |
| 8 | Migration: `exercise_reactions`, threshold config table, `AFTER INSERT` trigger | 2 | ~300 | Threshold behavior testable in SQL alone |
| 9 | Reaction API route + UI + tests | 2 | ~350 | Learners can react |
| 10 | Validator core — block/shape rules + tests | 3 | ~400 | Pure library, no callers |
| 11 | Validator — mechanic-specific rules + tests | 3 | ~400 | Completes the validator contract |
| 12 | `blocks` parsing in `exercisePayload.ts` + types + tests | 4a | ~300 | Contract lands; absent `blocks` = identical behavior |
| 13 | Renderer integration — `prose`/`media` around the single slot | 4a | ~350 | Blocks render |
| 14 | `@dnd-kit/sortable` + `@dnd-kit/utilities`; block reorder component | 5 | ~300 | Reorder is demoable standalone |
| 15 | Block editors — prose / media / slot textarea with live `BLANK_MARKER` parse | 5 | ~400 | Authoring surface exists |
| 16 | Mechanic-specific answer and pool editors | 5 | ~400 | Every mechanic authorable |
| 17 | Publish flow — validator call, slug collision retry, final URL preview, terms checkbox | 5 | ~350 | **End-to-end authoring works. Content can exist.** |
| 18 | "My exercises" + edit entry + **navigation entry** | 5 | ~350 | **Feature goes live for authors** |
| 19 | Migration: `exercise_moderation_actions` + moderation queries | 6 | ~250 | Audit log exists |
| 20 | Moderation dashboard, role-gated, incl. manual hide (`hidden_at`/`hidden_by`) | 6 | ~350 | Moderators can triage |
| 21 | Resend integration — email route, `Resend-Idempotency-Key`, moderation log write, docs | 6 | ~350 | The `needs_work` loop closes |

**Dependency chain** (📍 marks the current PR in each child's body; root is the owner-chosen baseline):

```
<baseline>          ← owner decision: main | feat/ingles-likes-and-qr | new tracker
 └─ 1 → 2 → 3 → 4                  (Phase 0 — identity)
       └─ 5 → 6 → 7                (Phase 1 — lifecycle)
             └─ 8 → 9              (Phase 2 — reactions, DORMANT until traffic)
       10 → 11                     (Phase 3 — validator, parallel from baseline)
             └─ 12 → 13            (Phase 4a — blocks)
                   └─ 14 → 15 → 16 → 17 → 18   (Phase 5 — authoring ⬅ VALUE)
                         └─ 19 → 20 → 21       (Phase 6 — moderation, DORMANT)
```

**Deferral option**: slices 8–9 and 19–21 (phases 2 and 6) are dormant at launch. Cutting the chain at slice 18 delivers the content engine in 16 slices; moderation follows once there is a pool worth moderating.

**`size:exception` candidates**: slices 5, 10, 11, 15, 16 sit at or near the boundary and are dominated by test code under strict TDD. Slice 5 cannot split — the column drop is atomic. Per the review-workload guard, tests stay with the unit they verify; do not shrink a slice by deleting its tests.

---

## Affected Areas

| Area | Impact | What changes |
|---|---|---|
| `src/lib/supabase.ts` | Modified | Third client kind — session-bearing. Anon/service content clients untouched. |
| `src/middleware.ts` | Modified | `context.locals.user` via `getUser()`; currently sets only `lang` |
| `src/lib/env.ts` | Modified | New optional keys via the `OPTIONAL_ENV_KEYS` pattern (`:57-64`) — Resend API key |
| `astro.config.mjs` | Modified | Documented prohibition on `middlewareMode: 'edge'` |
| `supabase/migrations/0007+` | New | Three-axis model + ownership, `user_roles`, reactions + trigger + config, moderation actions |
| `supabase/seeds/exercises_a1_test.sql` | Modified | `published` → `status` in the insert column list (`:8`) |
| `supabase/seeds/progress/*.json` | **Reset or deleted** | Claim 402 exercises; one exists |
| `src/lib/exercises.ts` | Modified | **All four** `.eq('published', true)` → `.eq('visible', true)` (`:141, :200, :250, :356`); lifecycle-aware and author-scoped reads |
| `src/lib/exercises.test.ts` | Modified | Four assertions at `:154, 353, 420, 638` |
| `src/lib/exercisePayload.ts` | Modified | `blocks` parsing; `slot.label` gap contract unchanged |
| `src/components/islands/ExerciseIsland.tsx` | Modified | Renders `prose`/`media` around the single slot. **No stepper change.** |
| `src/lib/exerciseValidator.ts` | New | Deterministic structural validator |
| `src/pages/[lang]/auth/**` | New | Sign-in, confirm, sign-out |
| `src/pages/[lang]/crear/**`, `mis-ejercicios/**` | New | Authoring UI, "my exercises" |
| `src/pages/[lang]/moderacion/**` | New | Moderation dashboard |
| `src/pages/api/**` | New | Reaction, validate, publish, moderation-email routes |
| `src/lib/i18n.ts` | Modified | es/en `COPY` for all authoring/auth/moderation chrome |
| `src/lib/likes.ts`, `0005`, `0006` | **Untouched** | Like and dislike are different signals |
| `src/lib/exerciseStepper.ts` | **Untouched** | Single-slot scope makes this a non-event |
| `docs/exercise-model.md` | Modified | Non-goals rewrite (below) |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Cold start — no content, so no learners, so no reaction signal** | **High** | **High** | **THE central risk now.** The dislike-threshold model needs traffic to produce signal. Phase 5 is the only phase that changes this; sequence it first and accept that phases 2 and 6 are dormant. Owner seeding remains available in parallel. |
| PR chain blocked on the 62-commit baseline decision | **Certain** | High | Owner prerequisite #0. Surfaced with three options; not resolved here. |
| Migration breaks all four readers at once | Medium | High | They land in the same slice (5). Byte-identical read behavior asserted by the existing suite. |
| `visible` created VIRTUAL instead of STORED | Low | High | `STORED` written explicitly, called out in review, verified by `select is_generated, generation_expression from information_schema.columns`. Owner prerequisite #8 confirms the PG version. |
| `middlewareMode: 'edge'` set later by someone unaware | Medium | **Critical, silent** | Documented in `astro.config.mjs` and in the design; auth breaks with no error if violated |
| `@supabase/ssr` insecure cookie defaults shipped as-is | Medium | **Critical** | Explicit `cookieOptions` in slice 1, asserted by test. Never copy Astro's own Supabase guide, which sets `path` only. |
| `@supabase/ssr` unverified against `@astrojs/netlify` | Low | High | Netlify Function runs Node, same model as `@astrojs/node`; confirm with a preview-deploy spike in slice 2 before 3–4 build on it |
| Resend link tracking deforms magic links | Medium | High | Owner prerequisite #4; verify before slice 3 |
| Resend 100/day free cap binds once authoring opens | Medium | Medium | Known. Upgrade to Pro when magic-link volume approaches the cap. |
| Dislike brigade floods the audit queue | Medium | Medium | `UNIQUE(user_id, exercise_id)` requires one real account per dislike; `visible` keeps `auditing` rows readable, so brigading routes to review and **cannot suppress** |
| Partial index not matched by PostgREST's parameterized `.eq` | Unknown | Low | **Pre-exists today.** At one row it is unmeasurable. `EXPLAIN` during slice 5 and record the result for later. |
| Regression against ~250-350 existing exercise tests | Low | High | Single-slot scope keeps the stepper untouched; `blocks` absent = identical behavior; strict TDD per slice |
| `@dnd-kit` docs describe a newer package line than installed | Medium | Low | This project is on the **classic** line (`DndContext`/`useSortable`). Treat any `DragDropProvider` / `@dnd-kit/react` example as not applicable. Confirm the `preventActivation` equivalent — without it, Space inside a block textarea starts a drag instead of typing. |

### Accepted limitations — owner acknowledged

1. **Cold start is structural.** Post-hoc quality control cannot distinguish "unseen" from "flawless." With one exercise this is not a footnote — it is the operating condition for the first months.
2. **Exposure window.** A bad exercise reaches some learners before the threshold trips. The deliberate trade for having no pre-publish human gate.
3. **Moderation ships dormant.** Phases 2 and 6 deliver no value until content volume exists. Build them knowing that; do not measure them on day one.

---

## Rollback Plan

| Scope | Rollback |
|---|---|
| Slices 1–4 (auth) | Revert the PRs. No schema change. Middleware returns to setting `lang` only. |
| Slice 5 (migration) | Down migration: drop the `visible` index, `DROP COLUMN visible, published_at, hidden_at, hidden_by, author_id`, `ADD COLUMN published boolean NOT NULL DEFAULT false`, backfill `published = (status = 'live')`, recreate the original index, `DROP COLUMN status`, revert the four read sites. **One row of data — the down path is as cheap as the up path.** |
| Slices 6–9, 19 (new tables) | `DROP TABLE`. No existing table is modified; `exercise_likes` is never touched. |
| Slices 10–13 (validator, blocks) | Revert. `blocks` is additive — absent `blocks` is exactly today's behavior. |
| Slices 14–21 (UI) | Routes are unlinked until slice 18. Reverting slice 18 alone hides the feature without touching data. |
| Emergency kill — bad content | Set `hidden_at`/`hidden_by` on the row. Takes effect immediately via `visible`; no deploy. |
| Emergency kill — runaway auditing | Set the dislike threshold to an unreachable value in the config table. No deploy. |

---

## Documentation changes

### `docs/exercise-model.md` — Non-goals table (`:756-765`)

| Line | Action |
|---|---|
| "No accounts" (`:762` rationale) | **Strike.** Directly invalidated — authoring and moderation both require real identity. |
| "Per-user progress, scores, streaks" (`:762`) | **Narrow to learners explicitly.** Author identity is a different population; leaving the wording as-is reads as this feature reversing the decision. |
| "Server-side answer validation" (`:763`) | **Keep, add one clarifying sentence.** Client-side grading is unaffected. The new server-side check is a *structural* pre-publish validator — payload shape, never a learner's answer. |
| "A `mechanics` database table" (`:765`) | **Leave untouched.** Not implicated. |

Add: the `published` → `status`/`visible`/audit-timestamp model, and the rule that *an enum describes where you are, never how you got there or who decided*.

### `supabase/seeds/progress/*.json` — reset or delete

Not a note. Either delete the six files, or reset every `current`, `focusCounts` and `usedSlugs` to the actual database state. The authoritative live count is:

```sql
select level, focus, count(*) from exercises where visible group by 1, 2;
```

---

## Dependencies

- **Blocking (owner)**: PR baseline decision — 62 unmerged commits on `feat/ingles-likes-and-qr`
- **Blocking (code)**: `@supabase/supabase-js` `^2.58.0` → `^2.114.0`
- **New runtime**: `@supabase/ssr@0.12.7`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities`, `resend@6.28.0`
- **External**: Resend account + verified subdomain + SPF/DKIM/DMARC (prerequisites 1–5)
- **Configuration**: Supabase Site URL, redirect allow-list, magic-link template, custom SMTP (prerequisites 5–7)
- **Postgres version**: confirmed via `select version();` (prerequisite 8) — decides `STORED` review emphasis
- **Unchanged**: `astro@^5`, `@astrojs/netlify@^6`, `@dnd-kit/core@^6.3.1`

---

## Success Criteria

- [ ] A signed-out visitor requests a magic link, clicks it, and lands authenticated with an `httpOnly; secure` session cookie
- [ ] Every server-side authorization check calls `getUser()`; no route guard calls `getSession()` — enforced by test
- [ ] `published` no longer exists on `exercises`; `visible` exists and `information_schema.columns.is_generated` reports it **STORED**
- [ ] A direct write to `visible` errors
- [ ] After slice 5 all **four** read sites query `visible`, the single pre-existing row (`daily-standup-routine`) is still reachable at its deep link, and the entry-screen facet grid is unchanged
- [ ] `exercises_level_focus_published_idx` is replaced by an equivalent partial index on `(level, focus) where visible`
- [ ] A CHECK constraint rejects an illegal `status`/`hidden_at` combination
- [ ] N quality-reason dislikes flip `status` to `auditing` and the exercise **remains visible**; `too_hard` dislikes do not count
- [ ] A moderator setting `hidden_at` makes the exercise invisible, and `hidden_by` records who did it
- [ ] The threshold changes with a SQL update and takes effect with no deploy
- [ ] An authenticated user authors, validates, and publishes an exercise end to end; the final URL is shown before publish and resolves afterward
- [ ] A slug collision auto-resolves with a suffix and the author sees the resolved URL
- [ ] A moderator (and only a moderator) opens the dashboard, soft-removes an exercise, and emails its author; the action is recorded in `exercise_moderation_actions`
- [ ] An author receives the `needs_work` email, opens "my exercises", edits, and republishing clears `needs_work` after re-validation
- [ ] Deleting a user from `auth.users` succeeds; their exercises survive with a placeholder author reference
- [ ] `supabase/seeds/progress/*.json` either do not exist or match the real row count
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm test:e2e` pass on every slice
- [ ] `docs/exercise-model.md` non-goals read consistently with the shipped feature
- [ ] No RLS policy exists on any new table; every new table is RLS-enabled and service-role only
