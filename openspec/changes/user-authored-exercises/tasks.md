# Tasks: User-Authored Exercises

**Artifact**: `gentle-ai.sdd-tasks/v1` · **Change**: `user-authored-exercises`
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/tasks`)
**Upstream**: `proposal.md` rev 2 · 8 delta specs (incl. amended `user-identity`) · `design.md` rev 1

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~6,990 total across 21 slices (avg ~333/slice, range 250–400) |
| 400-line budget risk | Medium — 5 slices sit at/near 400 and are pre-flagged `size:exception` candidates |
| Chained PRs recommended | Yes |
| Suggested split | PR 0 (docs) → 21 stacked slices, sequential, listed below |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium
```

`size:exception` candidates (dominated by TDD test code; do not shrink by cutting tests): **5** (atomic, cannot split — see Slice 5), 10, 11, 15, 16.

---

## Task Zero — Baseline gate — RESOLVED, no merge required

**CORRECTION.** The earlier reading of `origin/main...HEAD` = `0 62` came from a STALE local remote-tracking ref that had never been fetched. After `git fetch origin` the true state is:

- `git rev-list --left-right --count origin/main...HEAD` = `8 0` — HEAD holds **zero** commits that `origin/main` lacks.
- `git merge-base --is-ancestor HEAD origin/main` exits 0 — HEAD is fully contained in `origin/main`.
- `origin/main` is at `0b826d2`, `Merge pull request #9 from mauricioao/feat/ingles-likes-and-qr`. PRs #4–#9 already merged the whole English section.
- 23 of 24 local branches are already merged into `origin/main`. The sole exception is `feat/english-exercises-domain`, the discarded Sanity architecture (engram obs #566, SUPERSEDED).

There was never any unmerged debt. `main` is already the clean, current baseline the `stacked-to-main` chain requires.

The only remaining action is local hygiene: the local `main` ref is 70 commits behind `origin/main`.

- [x] 0.1 Baseline merge — already satisfied by PR #9; nothing to merge
- [ ] 0.2 Owner: sync the stale local branch — `git checkout main` then `git merge --ff-only origin/main`
- [ ] 0.3 Verify: `git rev-list --left-right --count main...origin/main` returns `0 0`

**Lesson recorded**: a remote-tracking ref such as `origin/main` is a local cache. Any claim about remote state is unverified until `git fetch` has run in the same session. Never assert fast-forward or divergence from an unfetched ref.

## PR 0 — Commit SDD planning docs (`size:exception`: bookkeeping, not new logic)

Branch `docs/sdd-user-authored-exercises` · Base `main` (after the 0.2 sync) · `openspec/` is currently untracked.

`openspec/` is untracked, so it survives `git checkout main` — git does not touch untracked files. Branch from the synced `main` and commit it there.

- [ ] 0.4 Single commit: `openspec/changes/user-authored-exercises/{proposal,design,tasks}.md`, `specs/**/spec.md`, `exploration.md`, `research.md`, `preproposal.md`
- [ ] 0.5 Verify: `git status --porcelain openspec` is clean after commit

---

## Owner Prerequisite Gates

| Prereq | Action | Lead time | Gates |
|---|---|---|---|
| 1 | Resend account + subdomain verification + SPF/DKIM/DMARC | Up to 48h — **start now** | Slice 21 fully; Slice 3 E2E (magic-link send needs SMTP relay live) |
| 2 | Disable open/click tracking on the transactional subdomain | Minutes | Slice 3 E2E (rewritten links break `token_hash`) |
| 3 | Supabase Site URL + redirect allow-list | Minutes | Slice 3 E2E (confirm redirect) |
| 4 | Magic-link template reviewed (`token_hash` link, not fragment) | Minutes | Slice 3 E2E |
| 5 | `select version();` reported | Seconds | Slice 5 sign-off (STORED review emphasis) |
| 6 | Baseline fast-forward merge to `main` | — | Everything (Task Zero) |

Unit/component tests in every slice below are independent of these gates. Only **E2E** verification on the noted slices waits on them — implementation should not stall.

---

## Phase 0 — Identity

### Slice 1 — `feat/auth-session-client`

Base `main` · Delivers session client factory + hardened cookie options + the blocking dependency bump · Est. ~360 lines · Rollback: revert PR, no schema change

- [x] 1.1 RED `src/lib/supabaseSession.test.ts`: `sessionCookieOptions(true)` → `{httpOnly:true,secure:true,sameSite:'lax',path:'/'}`; `(false)` → `secure:false`; assert the object is passed to `createServerClient` as `cookieOptions`
- [x] 1.2 Bump `package.json`: `@supabase/supabase-js` `^2.58.0` → `^2.114.0`; add `@supabase/ssr@0.12.7`
- [x] 1.3 GREEN `src/lib/supabaseSession.ts` (NEW): `sessionCookieOptions`, `createSessionClient` (`setAll` implements both `cookies` and `headers`; filter undefined `value` from `parseCookieHeader`; empty value → `cookies.delete`)
- [x] 1.4 `src/lib/supabase.ts`: header-note-only documenting the third client kind
- [x] 1.5 Re-read vendored path in `exercises.test.ts:36` (`PostgrestBuilder implements PromiseLike`), update the comment if the path moved
- [x] 1.6 Verify: `pnpm why @supabase/supabase-js` reports a single resolved version
- [x] 1.7 Verify: `pnpm test && pnpm typecheck` — full suite green before Slice 2 builds on this

### Slice 2 — `feat/auth-middleware`

Base `main` · Delivers `locals.user`, cache-safety, the `edge`-mode guard · Est. ~250 lines · Rollback: revert PR, middleware reverts to setting only `lang`

- [x] 2.1 RED `src/middleware.test.ts`: `needsSession(pathname)` — `false` for `_astro/*` and any dotted first segment; `true` otherwise
- [x] 2.2 RED (HARD RULE guard): unit test reads `astro.config.mjs` as text, asserts it contains neither `middlewareMode` nor `cacheOnDemandPages`
- [x] 2.3 RED T7 `src/lib/httpCache.test.ts`: `markPrivate(headers)` sets `cache-control: private, no-store`
- [x] 2.4 GREEN: add `Locals.user: User | null` (never optional) to `src/env.d.ts`
- [x] 2.5 GREEN `src/middleware.ts`: order per design §1 — `locals.user = null` first, path/lang routing, `needsSession` gate, `getUser()` → `locals.user`, flush `pendingHeaders` after `next()`
- [x] 2.6 GREEN `src/lib/httpCache.ts` (NEW): `PRIVATE_CACHE_CONTROL`, `markPrivate`
- [x] 2.7 GREEN: comment in `astro.config.mjs` documenting the `edge`-mode prohibition
- [ ] 2.8 **Preview-deploy spike** (owner-blocking, design open question) — **BLOCKED, not complete.** Requires a deploy only the owner can trigger. The exact observation checklist is in `apply-progress.md` → "Task 2.8 — owner checklist". Must pass **before** Slices 3–4 branch
- [x] 2.9 Verify: `pnpm test && pnpm typecheck`

### Slice 3 — `feat/auth-routes`

Base `main` · Delivers the full magic-link round trip · Est. ~350 lines · Rollback: revert PR, no schema change · E2E gated by owner prereqs 1–4

- [ ] 3.1 RED T1 `src/lib/authRedirect.test.ts`: `next=//evil.com`, `/\evil`, `https://evil`, `javascript:` → `safeNextPath` returns `/${DEFAULT_LANG}/`
- [ ] 3.2 RED T2 `src/pages/api/auth/confirm.test.ts`: `token_hash`/`type` stripped before the 303 redirect
- [ ] 3.3 RED `src/pages/api/auth/signin.test.ts`: response body identical whether or not the email has an account (no enumeration)
- [ ] 3.4 GREEN `src/lib/authRedirect.ts` (NEW): `safeNextPath` — accepts only a leading `/`, rejects `//`, `/\`, and any scheme
- [ ] 3.5 GREEN `src/pages/api/auth/signin.ts` (NEW): `signInWithOtp({ email, options: { data:{lang}, emailRedirectTo }})`
- [ ] 3.6 GREEN `src/pages/api/auth/confirm.ts` (NEW): `verifyOtp({type:'email', token_hash})` → `setAll` → 303 to `safeNextPath(next)`
- [ ] 3.7 GREEN `src/pages/api/auth/signout.ts` (NEW): `signOut()` → 303 home
- [ ] 3.8 Verify (E2E, gated): request link → confirm → authenticated; expired/used token → no session, invite message
- [ ] 3.9 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e`

### Slice 4 — `feat/auth-signin-ui`

Base `main` · Delivers the localized sign-in page · Est. ~300 lines · Rollback: revert PR, page unlinked

- [ ] 4.1 RED (Playwright, T6-style): anonymous GET of the sign-in page — response HTML has no authenticated-only markup
- [ ] 4.2 GREEN `src/pages/[lang]/auth/entrar.astro` (NEW)
- [ ] 4.3 GREEN `src/lib/i18n.ts`: es/en `COPY` for the sign-in form
- [ ] 4.4 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e`

---

## Phase 1 — Lifecycle

### Slice 5 — `feat/exercise-lifecycle-migration` (`size:exception`, ATOMIC — cannot split)

Base `main` · Delivers the three-axis model + full read-layer cutover in one transaction · Est. ~380 lines · Rollback: commented `-- ROLLBACK` block at the foot of `0007` (drop `visible` index → drop `visible`/`published_at`/`hidden_at`/`hidden_by`/`author_id` → re-add `published boolean` → backfill → recreate old index → drop `status` → revert all 4 read sites + 4 test assertions, together) · Gated by owner prereq 5

Dropping `published` breaks four readers, four test assertions, one seed file, and one index **simultaneously** — see design §3. Do not refactor the four read sites into a helper in this slice; the one-token diff is the evidence.

- [ ] 5.1 RED T8 (SQL): a direct `UPDATE ... SET visible = ...` errors because the column is generated
- [ ] 5.2 RED `src/lib/exerciseLifecycle.test.ts`: `canTransition` — every legal edge (`draft→live`, `live→auditing`, `live|auditing→needs_work`, `auditing→live`, `needs_work→live`, `any→removed`) plus one illegal edge per state
- [ ] 5.3 RED `src/lib/exercises.test.ts:154,353,420,638`: change to `toHaveBeenCalledWith('visible', true)` — RED until source changes in 5.5
- [ ] 5.4 GREEN `supabase/migrations/0007_exercise_authorship.sql` (NEW): apply the 10-step ordering exactly (nullable `status` → backfill from `published` BEFORE the drop → NOT NULL + CHECK → audit columns → hide-pair CHECK → `drop index` explicitly, never `cascade` → `drop column published` → `visible` **STORED** generated column → new partial index → `updated_by` FK `ON DELETE SET NULL`); append the commented `-- ROLLBACK` block
- [ ] 5.5 GREEN `src/lib/exercises.ts`: `:141` `getExerciseBySlug`, `:200` `getExerciseFacetRows`, `:250` `getPublishedExercises`, `:356` `getRelatedExercises` — `.eq('published', true)` → `.eq('visible', true)`
- [ ] 5.6 GREEN `src/lib/exerciseLifecycle.ts` (NEW): `canTransition(from, to)` pure table
- [ ] 5.7 GREEN `supabase/seeds/exercises_a1_test.sql:8`: column list `published`→`status`; value `true`→`'live'`
- [ ] 5.8 GREEN: delete `supabase/seeds/progress/*.json` (six files claim 402 exercises; one exists)
- [ ] 5.9 GREEN `docs/exercise-model.md`: strike "No accounts"; narrow "per-user progress" to learners; add the `status`/`visible`/audit-timestamp model and the "enum = where, never how/who" rule
- [ ] 5.10 Verify SQL (paste output in PR body) — **use the catalog, not `information_schema`**: `select a.attgenerated from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relname='exercises' and a.attname='visible';` — expect `'s'`. `information_schema.columns.is_generated` reports `ALWAYS` for both STORED and VIRTUAL and would pass wrongly
- [ ] 5.11 Verify SQL: hide-pair CHECK rejects `hidden_at` set without `hidden_by`
- [ ] 5.12 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e` — the single pre-existing row (`daily-standup-routine`) still reachable at its deep link; entry-screen facet grid unchanged

### Slice 6 — `feat/user-roles`

Base `main` · Delivers moderator identity · Est. ~250 lines · Rollback: `DROP TABLE user_roles`, revert `roles.ts`

- [ ] 6.1 RED `src/lib/roles.test.ts`: Supabase error → `getUserRoles` returns `[]` → `hasRole`/`requireRole` deny (**fail closed** — inverse of the `exercises.ts` house idiom; document why in the file header)
- [ ] 6.2 GREEN `supabase/migrations/0008_user_roles.sql` (NEW): `user_roles(user_id, role, granted_at)`, PK `(user_id, role)`, RLS on/zero policies, `service_role` grants, no secondary index (PK prefix already serves `where user_id=$1`)
- [ ] 6.3 GREEN `src/lib/roles.ts` (NEW): `type Role='moderator'`, `getUserRoles`, `hasRole`, `requireRole(user, role): Promise<User|null>`
- [ ] 6.4 Verify: `pnpm test && pnpm typecheck`

### Slice 7 — `feat/exercise-lifecycle-queries`

Base `main` · Delivers "my exercises" data layer ahead of its UI · Est. ~250 lines · Rollback: revert PR

- [ ] 7.1 RED `src/lib/exercises.test.ts`: author-scoped read excludes `status='removed'`
- [ ] 7.2 GREEN `src/lib/exercises.ts`: lifecycle-aware, author-scoped read functions
- [ ] 7.3 Verify: `pnpm test && pnpm typecheck`

---

## Phase 2 — Reactions (dormant until traffic exists)

### Slice 8 — `feat/exercise-reactions-migration`

Base `main` · Delivers threshold behavior testable in SQL alone · Est. ~300 lines · Rollback: `DROP TABLE` (3 tables, 1 trigger, 2 functions) · Carries owner prereq 5 (PG version) confirmation

- [ ] 8.1 RED T9 (SQL): second reaction row for the same `(user_id, exercise_id)` → unique violation
- [ ] 8.2 RED (SQL, hand-run): N `too_hard` dislikes → `status` stays `live`; N quality-reason dislikes → `status='auditing'` AND `visible` still `true`; changing an existing reaction's reason decrements the old bucket and increments the new one; a threshold update via SQL takes effect immediately, no deploy
- [ ] 8.3 GREEN `supabase/migrations/0009_exercise_reactions.sql` (NEW): `exercise_reactions`, `exercise_reaction_counts`, `exercise_moderation_config` (single-row, `id boolean pk check(id)`); `is_quality_dislike`/`is_too_hard_dislike` SQL functions
- [ ] 8.4 GREEN: `sync_exercise_reaction_counts()` trigger — `AFTER INSERT OR UPDATE OR DELETE`, branches explicitly on `tg_op` (🔴 never coalesce `NEW`/`OLD` — `NEW` is unassigned during `DELETE`), delta evaluated **inside** the `UPDATE ... SET` expression (concurrency-safe per `0006`'s pattern), `status='auditing'` guard is `where id=target and status='live'` (idempotent, never touches `hidden_at`/`hidden_by`)
- [ ] 8.5 GREEN: RLS on / zero policies / `service_role` grants on all three new tables (the `0002` lesson — `BYPASSRLS` skips policies, not table-level GRANTs)
- [ ] 8.6 Verify: paste SQL trigger test output in PR body; `pnpm typecheck`

### Slice 9 — `feat/exercise-reactions-api`

Base `main` · Delivers learner-facing reactions · Est. ~350 lines · Rollback: revert PR, table untouched

- [ ] 9.1 RED T3: anonymous POST to `/api/reacciones/[exerciseId]` → 401, no row changed
- [ ] 9.2 RED T9 (app-level) `src/lib/reactions.test.ts`: upsert on `(user_id, exercise_id)`, never a duplicate insert
- [ ] 9.3 GREEN `src/lib/reactions.ts` (NEW): upsert data layer
- [ ] 9.4 GREEN `src/pages/api/reacciones/[exerciseId].ts` (NEW): POST `{kind, reason?}`; null `locals.user` → 401; response `{ok}` only (no dislike count exposed)
- [ ] 9.5 GREEN `ReactionControl.tsx` island: takes `authed` as a prop; islands import-scan test (design §2) confirms no `@supabase/*` import
- [ ] 9.6 Verify: `pnpm test && pnpm typecheck`

---

## Phase 3 — Validator (pure library, buildable in parallel from `main`)

### Slice 10 — `feat/exercise-validator-core` (`size:exception` candidate)

Base `main` · Delivers block/shape rules, no callers yet · Est. ~400 lines · Rollback: revert PR, no callers exist yet

- [ ] 10.1 RED `src/lib/exerciseValidator.test.ts`: one case per `slot_answer_empty`, `slot_answer_unknown_id`, `slot_pool_missing`, `pool_duplicate_id`, `pool_duplicate_text`, `pool_empty`, `block_coverage_mismatch`
- [ ] 10.2 RED: determinism — run `validateExercise` twice on identical input, `toEqual` on the full issue list
- [ ] 10.3 GREEN `src/lib/exerciseValidator.ts` (NEW): `ValidationCode`, `ValidationIssue`, `ValidationResult`, `ValidatorInput`, `validateExercise` — shape/pool/coverage rules only; issues sorted (slot index, then code, then detail); `ok = issues.every(i => i.severity !== 'error')`
- [ ] 10.4 Verify: `pnpm test && pnpm typecheck`

### Slice 11 — `feat/exercise-validator-mechanics` (`size:exception` candidate)

Base `main` · Delivers the complete validator contract · Est. ~400 lines · Rollback: revert PR

- [ ] 11.1 RED: one case per `slot_multiple_blanks`, `slot_unknown_mechanic`, `drop_pool_too_small`, `listening_requires_audio`, `slug_invalid`
- [ ] 11.2 RED: `exercise_too_few_mechanics` is a **warning**, not an error — `ok` stays `true` when it is the only issue
- [ ] 11.3 GREEN `src/lib/exerciseValidator.ts`: remaining mechanic-specific rules
- [ ] 11.4 GREEN `src/lib/exerciseValidatorCopy.ts` (NEW, +test): `ValidationCode` → es/en message, existing `COPY` shape — validator itself emits codes only, never prose
- [ ] 11.5 Verify: `pnpm test && pnpm typecheck`

---

## Phase 4a — Blocks (additive by construction)

### Slice 12 — `feat/exercise-blocks-payload`

Base `main` · Delivers the contract; absent `blocks` = identical behavior · Est. ~300 lines · Rollback: revert PR, `blocks` is additive

- [ ] 12.1 RED `src/lib/exercisePayload.test.ts`: `parseBlocks` — valid; unknown `kind`; missing `id`; dangling `slotId`; duplicate `slotId`; coverage gap; empty array; `null` → degrades, never throws
- [ ] 12.2 RED: `countBlanks` shares the `BLANK_MARKER` rule with `splitLabelAtBlank` (same comment block)
- [ ] 12.3 GREEN `src/lib/exercisePayload.ts`: `ProseBlock`, `MediaBlock`, `RowBlock` (`slotId`, not nested slots), `Block` union, `Payload.blocks?`, `parseBlocks` — **all-or-nothing coverage rule**: keep `blocks` only when the multiset of row-block `slotId`s exactly equals `payload.slots` ids
- [ ] 12.4 GREEN: `countBlanks`
- [ ] 12.5 Verify: `pnpm test && pnpm typecheck`

### Slice 13 — `feat/exercise-blocks-renderer`

Base `main` · Delivers rendered blocks, stepper untouched · Est. ~350 lines · Rollback: revert PR

- [ ] 13.1 RED `src/lib/exerciseBlocks.test.ts`: `blocksForStep` grouping, including leading and trailing non-row blocks attaching correctly
- [ ] 13.2 RED (regression guard): absent `blocks` on every existing exercise → markup identical to current; the full existing ~250-350 test suite passes unmodified
- [ ] 13.3 GREEN `src/lib/exerciseBlocks.ts` (NEW): `blocksForStep(payload, index)`
- [ ] 13.4 GREEN `src/components/islands/ExerciseIsland.tsx`: render the group's `prose`/`media` above the mechanic renderer; pass `slot` through unchanged; `:347-353` stepper binding **not modified**
- [ ] 13.5 Verify: `pnpm test && pnpm typecheck`

---

## Phase 5 — Authoring (⬆ the value delivery)

### Slice 14 — `feat/authoring-block-reorder`

Base `main` · Delivers a standalone-demoable reorder component · Est. ~300 lines · Rollback: revert PR

- [ ] 14.1 RED (component): drag reorder via the handle — pointer and keyboard both work; Space typed inside a block's `<textarea>` types a space, never starts a drag
- [ ] 14.2 Bump `package.json`: `@dnd-kit/sortable@10.0.0` (peers installed `@dnd-kit/core@6.3.1`, no core bump), `@dnd-kit/utilities`
- [ ] 14.3 GREEN `components/islands/authoring/BlockList.tsx` (NEW): `DndContext` + `SortableContext` + `arrayMove`
- [ ] 14.4 GREEN `.../SortableBlock.tsx` (NEW): `useSortable` + `CSS.Transform.toString`; `{...attributes}{...listeners}` bind to a dedicated, accessibly-named `<button>` drag handle (never the block container); `setNodeRef` on the container; `KeyboardSensor` registered exactly as `DropRenderer.tsx` already does
- [ ] 14.5 Verify: `pnpm test && pnpm typecheck`

### Slice 15 — `feat/authoring-block-editors` (`size:exception` candidate)

Base `main` · Delivers the authoring surface · Est. ~400 lines · Rollback: revert PR, routes unlinked

- [ ] 15.1 RED T6: anonymous GET of `crear/index.astro` — response HTML has no authoring markup
- [ ] 15.2 RED `src/lib/authoringDraft.test.ts`: `moveBlock`, `setSlotAnswer`, `draftToPayload` round trip — pure, no React
- [ ] 15.3 RED (component): typing `___` in the row editor's sentence textarea produces live gap feedback with no reload
- [ ] 15.4 GREEN `src/pages/[lang]/crear/index.astro`, `crear/[id].astro` (NEW, SSR-gated; edit checks ownership in frontmatter)
- [ ] 15.5 GREEN `authoring/ExerciseAuthorIsland.tsx` (NEW, island shell)
- [ ] 15.6 GREEN `authoring/{Prose,Media,Row}BlockEditor.tsx` (NEW)
- [ ] 15.7 GREEN `authoring/ExercisePreview.tsx` (NEW): mounts the real `<ExerciseIsland payload={draftToPayload(draft)} .../>` — WYSIWYG by construction, no second renderer
- [ ] 15.8 GREEN `src/lib/authoringDraft.ts` (NEW): pure `Draft` model and mutations
- [ ] 15.9 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e`

### Slice 16 — `feat/authoring-answer-editors` (`size:exception` candidate)

Base `main` · Delivers every mechanic authorable · Est. ~400 lines · Rollback: revert PR

- [ ] 16.1 RED (component): per-mechanic (`choice`/`select`/`text`/`drop`) answer and pool editors render the correct controls for that mechanic
- [ ] 16.2 GREEN `authoring/SlotAnswerEditor.tsx` (NEW)
- [ ] 16.3 Verify: `pnpm test && pnpm typecheck`

### Slice 17 — `feat/authoring-publish-flow`

Base `main` · Delivers **end-to-end authoring — content can exist** · Est. ~350 lines · Rollback: revert PR

- [ ] 17.1 RED T3: anonymous POST to `guardar.ts` → 401, no row changed
- [ ] 17.2 RED T4: authenticated non-owner POST editing another author's exercise → 403, no row changed
- [ ] 17.3 RED `src/lib/exerciseSlug.test.ts`: `slugify`, `withCollisionSuffix` — random 4-char base-36 suffix, never a deterministic `-2`
- [ ] 17.4 RED `guardar.test.ts`: `mustValidate = publish || currentStatus !== 'draft'`; 422 `payload_unparseable`; 422 with `issues`; 422 `terms_required` on a first publish with `!acceptedTerms`; a `23505` slug collision retries once with a suffix; a second collision returns `slug_collision_unresolved`
- [ ] 17.5 GREEN `src/lib/exerciseSlug.ts` (NEW)
- [ ] 17.6 GREEN `src/pages/api/ejercicios/[id]/guardar.ts` (NEW): the 7-step flow per design §8
- [ ] 17.7 GREEN `src/pages/api/ejercicios/validar.ts` (NEW): server validation for the live authoring panel
- [ ] 17.8 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e` — author → validate → publish → open the resolved URL

### Slice 18 — `feat/authoring-my-exercises`

Base `main` · Delivers **feature goes live for authors** (adds navigation) · Est. ~350 lines · Rollback: revert this PR alone hides the feature without touching data

- [ ] 18.1 RED T6: anonymous GET of a page carrying the "my exercises" nav entry — response HTML lacks that markup
- [ ] 18.2 GREEN `src/pages/[lang]/mis-ejercicios/index.astro` (NEW): lists own exercises by `draft`/`live`/`needs_work`, edit entry point
- [ ] 18.3 GREEN: add the navigation entry (this is the deploy-free feature flag boundary — routes were unlinked through Slice 17)
- [ ] 18.4 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e`

---

## Phase 6 — Moderation (dormant until content volume exists)

### Slice 19 — `feat/moderation-migration`

Base `main` · Delivers the audit log · Est. ~250 lines · Rollback: `DROP TABLE exercise_moderation_actions`

- [ ] 19.1 RED `src/lib/moderation.test.ts`: `getAuditQueue()` ordered `quality_dislikes desc, published_at asc` (worst signal first, oldest as tiebreak)
- [ ] 19.2 GREEN `supabase/migrations/0011_exercise_moderation_actions.sql` (NEW): table + index `(exercise_id, created_at desc)`; RLS on/zero policies/service_role grants
- [ ] 19.3 GREEN `src/lib/moderation.ts` (NEW): `getAuditQueue`, `recordAction`
- [ ] 19.4 Verify: `pnpm test && pnpm typecheck`

### Slice 20 — `feat/moderation-dashboard`

Base `main` · Delivers triage for moderators · Est. ~350 lines · Rollback: revert PR, routes role-gated and unlinked from learner nav

- [ ] 20.1 RED T5: authenticated non-moderator POST to `ocultar`/`quitar`/`avisar` → 403, no row changed (one test per endpoint)
- [ ] 20.2 RED: dashboard page — non-moderator → **404** (never 403, to avoid confirming the route exists); moderator → 200 with the queue
- [ ] 20.3 GREEN `src/pages/[lang]/moderacion/index.astro`, `[id].astro` (NEW): role-gated SSR, preview via the real renderer
- [ ] 20.4 GREEN `src/pages/api/moderacion/ocultar.ts` (NEW): sets `hidden_at` + `hidden_by` together
- [ ] 20.5 GREEN `src/pages/api/moderacion/quitar.ts` (NEW): `status='removed'`, logs the action
- [ ] 20.6 Every mutating endpoint calls `requireRole(locals.user, 'moderator')` independently of the page — anonymous → 401, non-moderator → 403
- [ ] 20.7 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e` — non-moderator 404, moderator triages

### Slice 21 — `feat/moderation-email`

Base `main` · Delivers the `needs_work` loop closing · Est. ~350 lines · Rollback: revert PR; app still boots with email unconfigured (fails loudly at call time only) · Gated by owner prereqs 1–4 for E2E send verification

- [ ] 21.1 RED `src/lib/env.test.ts`: `RESEND_API_KEY` lives in `OPTIONAL_ENV_KEYS`; missing key fails loudly at call time, never at module load
- [ ] 21.2 RED `src/lib/email.test.ts`: double-email defence — a `notify` action within 24h skips with `already_notified`; `Resend-Idempotency-Key: notify-<id>` is reused on a retry of the *same* row and is new for a *new* action
- [ ] 21.3 GREEN `src/lib/env.ts`: add `RESEND_API_KEY`
- [ ] 21.4 GREEN `src/lib/email.ts` (NEW): Resend wrapper — insert `notify` row (`notified_at` null) → send with the idempotency key → set `notified_at` on success
- [ ] 21.5 GREEN `src/lib/emailCopy.ts` (NEW): es/en plain-text + minimal HTML, existing `COPY` shape, neutral Spanish (guarded by `neutralSpanish.test.ts`)
- [ ] 21.6 GREEN `src/pages/api/moderacion/avisar.ts`: wire the full notify flow (from Slice 20's stub)
- [ ] 21.7 GREEN `docs/exercise-model.md`: final non-goals pass consistent with the shipped feature
- [ ] 21.8 Verify (E2E, gated): `needs_work` email received → author opens "my exercises" → edits → republish clears `needs_work` after re-validation
- [ ] 21.9 Verify: `pnpm test && pnpm typecheck && pnpm test:e2e` — full suite, final slice

---

## Dependency Diagram

```
main (post Task Zero fast-forward merge)
 └─ PR 0 (docs)
     └─ 1 → 2 → 3 → 4                          Phase 0 — identity
           └─ 5 → 6 → 7                        Phase 1 — lifecycle
                 └─ 8 → 9                      Phase 2 — reactions (dormant)
           10 → 11                             Phase 3 — validator (parallel from main)
                 └─ 12 → 13                    Phase 4a — blocks
                       └─ 14 → 15 → 16 → 17 → 18   Phase 5 — authoring ⬅ VALUE
                             └─ 19 → 20 → 21       Phase 6 — moderation (dormant)
```

Deferral option unchanged from the proposal: cutting the chain at Slice 18 delivers the content engine in 16 slices (excluding Phase 2/6); moderation follows once there is a pool worth moderating.

---

## Review Workload Forecast (recap)

- **Chained PRs recommended:** Yes
- **400-line budget risk:** Medium — Slices 5, 10, 11, 15, 16 sit at/near 400 and are pre-approved `size:exception` candidates; none may be shrunk by cutting tests
- **Estimated changed lines:** ~6,990 total, 21 slices, average ~333 lines/slice
- **Decision needed before apply:** No — `auto-chain` with `stacked-to-main` is resolved; proceed with Slice 1 once Task Zero (baseline merge) and PR 0 (docs commit) land
