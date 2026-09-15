# Apply Progress: User-Authored Exercises

**Artifact**: `gentle-ai.sdd-apply/v1` · **Rev**: 4 · **Change**: `user-authored-exercises`
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/apply-progress`)
**Mode**: Strict TDD · **Test runner**: `pnpm test` → `vitest run`
**Batches so far**: Slice 1 (`feat/auth-session-client`, merged as PR #13) · Slice 2 (`feat/auth-middleware`, merged as PR #14) · Slice 2 correction (`4813e6d`, same branch) · Slice 3 (`feat/auth-routes`, local)

This artifact is CUMULATIVE. Rev 2 merged slice 2 into rev 1; rev 3 appended the
slice-2 correction; rev 4 appends slice 3. Nothing from revs 1–3 was removed
EXCEPT as recorded in the compression note immediately below.

> **COMPRESSION NOTE (rev 4).** Engram silently truncates an observation at
> 50,000 characters, and rev 3 already stood at ~35,000. Appending slice 3 in
> full would have crossed that line and cut the TAIL — the newest work — with no
> error. Slice 1's section was therefore reduced to the summary below rather than
> losing slice 3. Slice 1 is the safest candidate: it is the only slice already
> merged to `main` and independently reviewed, so its full detail survives in PR
> #13 and in git history. Slices 2 and 3 are untouched and complete.

---

# Slice 1 — `feat/auth-session-client` · COMPLETE, merged as PR #13 (COMPRESSED, rev 4)

Full detail: PR #13 and commits `3ed324c`, `e5030ee`.

**Delivered**: `src/lib/supabaseSession.ts` — `sessionCookieOptions(isProd)`,
`createSessionClient({request, cookies, isProd})`, `SessionClient`; the
`@supabase/supabase-js` `^2.58.0` → `^2.114.0` bump plus `@supabase/ssr@0.12.7`;
a header note in `src/lib/supabase.ts` documenting the third client kind; a
refreshed vendored-path citation in `src/lib/exercises.test.ts`.

**Tasks 1.1–1.7: all complete.**

**TDD**: 13 unit tests written before the module. RED observed as
`Cannot find module './supabaseSession'`; GREEN `13 passed (13)`; triangulated
across 5 behaviors (cookie-flag matrix, explicit-flag proof, `cookieOptions`
pass-through, `getAll` parse/filter, `setAll` set/delete/header buffering).

**Verification**: `pnpm why @supabase/supabase-js` → single resolved version
`2.116.0`. `pnpm test` → `53 passed (53)` · `940 passed | 10 skipped (950)`.
`pnpm typecheck` → 15 errors, ALL pre-existing on `main` and none in a slice-1
file; since fixed by PR #11, so typecheck has been 0 errors from slice 2 onward.

**Deviations**: (1) `parseCookieHeader` no longer emits `undefined` values at
`0.12.7`; the design's filter was implemented anyway so the `GetAllCookies`
contract survives version drift, and the test drives that branch through a spy.
(2) Scope addition within the slice: RED coverage for `getAll`/`setAll` was
written first, because strict TDD forbids shipping them untested.

**Budget**: 445 authored lines, 11% over the 400 budget; 63% of the diff is TDD
test code and house-style comment blocks. `size:exception` accepted.

---

# Slice 2 — `feat/auth-middleware` · COMPLETE except the owner-blocked spike

## Baseline (task 2.0) — recorded BEFORE any change, verbatim

The first reading was **RED**, and the cause was environmental, not code:

| Command | Observed result |
|---|---|
| `pnpm test` (first attempt) | **FAIL** — `Test Files 1 failed \| 52 passed (53)` · `Tests 928 passed \| 10 skipped (938)`. Cause: `Error: Cannot find package '@supabase/ssr' imported from 'mock:@supabase/ssr'` |

`package.json:31` declares `@supabase/ssr: 0.12.7` and `pnpm-lock.yaml` resolves it,
but `node_modules/@supabase/ssr` did not exist: the working tree had merged PR #13
without re-installing. `pnpm install --frozen-lockfile` fixed it
(`+ @supabase/ssr 0.12.7` · `- @supabase/supabase-js 2.110.7` · `+ @supabase/supabase-js 2.116.0`,
`Done in 30.3s`). No source file was touched to reach the baseline.

Baseline after the install, which is the number slice 2 is measured against:

| Command | Observed result |
|---|---|
| `pnpm test` | **PASS** — `Test Files 53 passed (53)` · `Tests 941 passed \| 10 skipped (951)` |
| `pnpm typecheck` | **PASS** — `Result (139 files): 0 errors, 0 warnings, 0 hints` |

Typecheck is 0 errors, so the task-2.0 stop condition did not trigger. **Anything red
after slice 2 is slice 2's**, with the one proven exception recorded under Issues.

## Completed tasks

- [x] 2.1 RED `src/middleware.test.ts`: `needsSession(pathname)` — `false` for `_astro/*` and any dotted first segment; `true` otherwise
- [x] 2.2 RED (HARD RULE guard): unit test reads `astro.config.mjs` as text, asserts it contains neither `middlewareMode` nor `cacheOnDemandPages`
- [x] 2.3 RED T7 `src/lib/httpCache.test.ts`: `markPrivate(headers)` sets `cache-control: private, no-store`
- [x] 2.4 GREEN `Locals.user: User | null` (never optional) in `src/env.d.ts`
- [x] 2.5 GREEN `src/middleware.ts` ordering per design §1
- [x] 2.6 GREEN `src/lib/httpCache.ts` (NEW)
- [x] 2.7 GREEN comment in `astro.config.mjs` documenting the edge-mode prohibition
- [ ] 2.8 Preview-deploy spike — **BLOCKED on the owner.** Not attempted, not faked. Checklist below
- [x] 2.9 Verify `pnpm test && pnpm typecheck`

## Files changed and TDD evidence (COMPRESSED, rev 4 — full detail in PR #14)

**Created**: `src/lib/httpCache.ts` (`PRIVATE_CACHE_CONTROL`, `markPrivate`, using
`set` never `append`) + 5 tests · `src/astroConfig.test.ts`, 4 tests reading
`astro.config.mjs` as raw text and asserting neither forbidden adapter option
appears. **Modified**: `src/middleware.ts` (exported `needsSession`,
`locals.user = null` first, `getUser()` → `locals.user`, `pendingHeaders` flushed
after `next()`, lang behaviour preserved byte-for-byte) + 19 tests ·
`src/env.d.ts` (`Locals.user: User | null`, non-optional) · `astro.config.mjs`
(16-line prohibition comment only) · three page-test harnesses gaining
`user: null`, forced by 2.4.

**TDD**: 28 tests, all written first, all passing. REDs observed as
`TypeError: needsSession is not a function` (2.1), `Failed to load url
./httpCache` (2.3), `18 failed | 7 passed (25)` (2.5), and three `ts(2741)
Property 'user' is missing` errors from the type checker (2.4 — the correct layer
for a non-optional field, and it found three harnesses on its first day).

**Task 2.2's RED was earned by MUTATION, not assumed.** A guard for a condition
that already holds passes at birth and proves nothing, so `adapter: netlify(),`
was temporarily rewritten to
`adapter: netlify({ middlewareMode: 'edge', cacheOnDemandPages: true }),` and the
suite run: `Tests 3 failed | 1 passed (4)`. Reverted with `git checkout` and
re-run green. That is the only proof the assertion has teeth. Slice 3 reused the
technique for `withAuthError`.

Triangulation forced real logic on: `needsSession` (a dot in a LATER segment must
still be `true`, which is what forces "first segment" over "any segment");
`markPrivate` (a live `public, max-age=3600` must be OVERWRITTEN, which `append`
fails); middleware ordering (`createSessionClient` asserted NOT called on `/` and
on an invalid lang); session resolution (signed-in vs a rejected cookie); header
flush (one buffered header vs an empty map). Pure functions created: **2**. No
banned assertion patterns.

## Work unit evidence

Slice 2 is three independent work units, committed separately.

| Unit | Focused test command and result | Rollback boundary |
|---|---|---|
| `httpCache` | `pnpm vitest run src/lib/httpCache.test.ts` → `Test Files 1 passed (1) · Tests 5 passed (5)` | Delete `src/lib/httpCache.ts` and `src/lib/httpCache.test.ts`. Nothing imports them yet |
| config guard | `pnpm vitest run src/astroConfig.test.ts` → `Test Files 1 passed (1) · Tests 4 passed (4)` | Delete `src/astroConfig.test.ts` and revert the 16-line comment in `astro.config.mjs`. No executable config change to unwind |
| middleware | `pnpm vitest run src/middleware.test.ts` → `Test Files 1 passed (1) · Tests 25 passed (25)` | Revert `src/middleware.ts` to setting only `locals.lang`, drop `Locals.user` from `src/env.d.ts`, revert the three harness one-liners. No schema, no route, no UI |

Combined focused run:
`pnpm vitest run src/astroConfig.test.ts src/middleware.test.ts src/lib/httpCache.test.ts src/lib/supabaseSession.test.ts`
→ `Test Files 4 passed (4) · Tests 47 passed (47)`.

**Runtime harness: N/A at this layer, and that gap is exactly task 2.8.** Slice 2
introduces the first real runtime boundary in the change — middleware calling Supabase
inside a Netlify Function — and it cannot be exercised locally in a way that proves
anything about the deployed runtime. The `@supabase/ssr`-on-`@astrojs/netlify`
question is open in design §"Open questions" and was assigned to task 2.8 precisely
because only a deploy can close it. Unit tests here prove **ordering and contract**,
not transport. Slices 3–4 must not branch until 2.8 passes.

## Task 2.8 — owner checklist (BLOCKED, not complete)

Not attempted: it needs a Netlify preview deploy only the owner can trigger. Below is
what must be OBSERVED for the spike to count as passed. Steps 5, 7 and 8 are the ones
that actually decide it.

**Read this first — a scope problem in the task as written.** Task 2.8 asks to confirm
"a `@supabase/ssr` session survives a real request", but slice 2 ships **no way to
create a session**: `/api/auth/signin` and `/api/auth/confirm` arrive in slice 3, and
nothing on this branch renders from `locals.user`. Two honest paths:

- **(a) Recommended — run the spike at the head of slice 3**, where the magic-link
  round trip exists and step 3 is natural. The design's constraint ("before slices 3–4
  build on it") is still met if it is the first thing slice 3 does and slice 4 waits.
- **(b) Run it now with an out-of-band session**: mint tokens against the Supabase
  project outside the app, then set the cookie by hand. This proves transport but needs
  the throwaway probe in step 7.

### Deploy
1. Netlify preview deploy of the branch. In the deploy's **Functions** tab, confirm an
   SSR Node function is listed and that **Edge Functions lists nothing for rendering**.
   If rendering moved to the edge, stop — `context.locals` is being JSON-serialized and
   the session client is already dead.
2. Confirm `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set on the preview deploy context
   (server-only, no `PUBLIC_` prefix). If they are missing, `loadEnv()` throws at module
   load and the failure will read as a middleware bug.

### Prove the session round-trips
3. Establish a session by path (a) or (b) above.
4. Request a locale page with the cookie attached:
   `curl -i -b "<cookie-header>" https://<preview>/es/`.
   The cookie name to look for is **`sb-<project-ref>-auth-token`**, and with a real
   JWT it will be **chunked**: `sb-<ref>-auth-token.0`, `.1`, … because the value
   exceeds the 4 KB per-cookie limit. Chunking is the single most likely thing to break
   on a serverless adapter, so use a REAL token, never a short fake one.
5. **Proof the session survived the runtime**: the response must carry a `set-cookie`
   for `sb-<ref>-auth-token*` whose value **differs** from the one sent — that is
   `getUser()` having refreshed the token inside the Netlify Function and the refreshed
   value having reached the response through `AstroCookies`. No `set-cookie` at all is
   acceptable **only** when the access token had not yet expired. To force the refresh
   path, wait past the access-token TTL or shorten it in the Supabase dashboard.
6. Inspect the flags on that `set-cookie`: `HttpOnly`, `Secure`, `SameSite=Lax`,
   `Path=/`. **`Secure` MUST be present** — the preview is HTTPS, so
   `import.meta.env.PROD` is true there. Its absence means the build ran in dev mode
   and every cookie hardening in slice 1 is inert in production.
7. **Proof identity actually resolved, not just that a cookie moved.** Steps 4–6 alone
   prove transport. Deploy a throwaway `src/pages/api/whoami.ts` returning
   `{ id: locals.user?.id ?? null }`, and delete it before merge. With the session
   cookie it must return the real user id. If it returns `null` while step 5 passed,
   cookies survive and identity does not — which is the failure mode the whole spike
   exists to detect.

### Negative control — do not skip
8. Repeat step 4 with **no cookie**. There must be no session `set-cookie`, and the
   whoami probe must return `{"id":null}`. Without this a cached response reads as a pass.
9. Request `https://<preview>/_astro/<any-hashed-asset>` and `https://<preview>/favicon.ico`.
   Neither may produce a session `set-cookie`. This is `needsSession` observed in the
   real runtime, and it is the only place it can be observed end to end.

### Record
10. Paste into the PR body: the request/response header pairs from 4–6, both whoami
    outputs from 7–8, and the Functions-vs-Edge-Functions listing from step 1.

**PASS requires the refreshed `set-cookie` (step 5) AND the non-null whoami id (step 7)
from the same Netlify Function deploy, AND both negative controls (8, 9).** Anything
less does not close the design's open question.

## Verification commands (slice 2)

| Command | Observed result |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** — `Done in 30.3s`. `+ @supabase/ssr 0.12.7` · `- @supabase/supabase-js 2.110.7` · `+ @supabase/supabase-js 2.116.0`. Required before any test could run; see Baseline |
| `pnpm test` | **PASS** — `Test Files 55 passed (55)` · `Tests 969 passed \| 10 skipped (979)`. Run **three consecutive times**, identical each time. Baseline was 53 / 941 / 10; the delta is exactly this slice's 2 new test files and 28 new tests |
| `pnpm typecheck` | **PASS** — `Result (142 files): 0 errors, 0 warnings, 0 hints`. File count 139 → 142 for the three new files, all of which typecheck clean |
| `pnpm vitest run src/middleware.test.ts` | **PASS** — `Tests 25 passed (25)` |
| `pnpm vitest run src/astroConfig.test.ts` | **PASS** — `Tests 4 passed (4)` |
| `pnpm vitest run src/lib/httpCache.test.ts` | **PASS** — `Tests 5 passed (5)` |
| `pnpm test:e2e` | **NOT RUN** — not in slice 2's task list (2.9 names `pnpm test && pnpm typecheck` only) |

## Deviations and issues (slice 2, COMPRESSED rev 4 — full text in PR #14)

**Deviations.** (1) The forbidden option names live in the guard TEST, not in
`astro.config.mjs`: design §1's literal text assertion and task 2.7's explanatory
comment collide, because raw text cannot tell a comment from a setting. Resolved
in the strictest direction — the guard stays literal and the comment describes
both options in prose, pointing at `src/astroConfig.test.ts` for the names.
Stripping comments before asserting would let a commented-out setting pass, and
that is one keystroke from live. (2) Three page-test harnesses outside the task
list gained `user: null`, forced by the non-optional `Locals.user`; no assertion
was weakened. (3) The config guard sits at `src/astroConfig.test.ts` because
`vitest.config.ts` only includes `src/**`, so a repo-root file would silently
never run. (4) `getUser()` shipped without a `try`/`catch`, exactly as design §1
writes it — see the correction section.

Nothing else deviated: the ordering, the `getUser()`-never-`getSession()` rule,
`PRIVATE_CACHE_CONTROL`, and the non-optional `Locals.user` all match design §1,
§2 and the `user-identity` spec.

**Issues.** (1) `node_modules` was stale on a freshly merged `main`; the error
named `src/lib/supabaseSession.ts` and the cause was a missing `pnpm install`.
**Anyone pulling `main` after PR #13 must install before the suite will run.**
(2) `ShareDialog.test.tsx` flaked under parallel load — proven pre-existing by
stashing slice 2 and reproducing on a clean tree. **RESOLVED since**: fixed and
merged as PR #16 (`f7b86c5`), verified across 17 consecutive clean full-suite
runs, so the slice-3 baseline is genuinely clean. (3) Review budget exceeded at
481 lines against 400 and a ~250 estimate. (4) **RESOLVED** by the correction
below: `getUser()` had no failure path, so a network throw would have been a 500
on every page of the site. It was deliberately not fixed unilaterally — that is
production behaviour the design does not specify, and strict TDD forbids shipping
it untested. (5) Task 2.8 cannot be fully executed at slice 2: nothing renders
from `locals.user` and there is no way to create a session until slice 3.

## Workload / PR boundary (slice 2)

- **Mode**: stacked PR slice (`stacked-to-main`)
- **Current work unit**: slice 2, branch `feat/auth-middleware`, local only
- **Boundary**: starts at `93a9490` (`main`, PR #13 merged), ends at `630f72e`.
  Delivers `locals.user`, the cache-safety helper, and the config guard. No route, no
  UI, no migration, and nothing yet reads `locals.user`, which is what keeps the slice
  autonomous and trivially revertible.
- **Commits** (work units, each independently green and revertible):
  - `141e883` `feat(auth): add private cache-control helper for session responses`
  - `dd17419` `test(config): guard the Netlify adapter against auth-breaking options`
  - `630f72e` `feat(auth): resolve the session user in middleware`
- **Authored review budget**: **481 lines** (`additions + deletions`):

  | File | Lines |
  |---|---|
  | `src/middleware.test.ts` | 181 |
  | `src/middleware.ts` | 104 |
  | `src/astroConfig.test.ts` | 56 |
  | `src/lib/httpCache.test.ts` | 53 |
  | `src/lib/httpCache.ts` | 44 |
  | `src/env.d.ts` | 16 |
  | `astro.config.mjs` | 16 |
  | 3 page-test harnesses | 11 |

- **Over budget by 20%, and unlike slice 1 it CAN be split.** One honest slicing pass
  gives three units that are already the three commits, all under budget and all
  independently reviewable:

  | Unit | Commit | Lines | Independent? |
  |---|---|---|---|
  | cache safety | `141e883` | 97 | Yes — no consumers yet |
  | config guard | `dd17419` | 72 | Yes — test + comment only |
  | middleware + identity | `630f72e` | 312 | Yes — the core |

  The third unit cannot shrink further: `Locals.user` (16) forces the three harness
  fixes (11), and `needsSession` plus the ordering plus the header flush are one
  behavior with one test file. 290 of the 481 lines (60%) are TDD test code and may
  not be cut to reach a number.
- **Recommendation**: promote the three commits to three chained PRs rather than
  accepting `size:exception`. The split costs nothing — the commits already are it.
  If the owner prefers one PR, then `size:exception` at 481 lines, 20% over.

## Delivery state

**Not pushed. No pull request. Not merged.** Delivery is the owner's decision.
Branch `feat/auth-middleware` is local, at `630f72e`, three commits ahead of `93a9490`.
`PRD-arquitectura.md` remains untracked and uncommitted, as instructed.

---

## Remaining tasks as of rev 3 — SUPERSEDED by the slice-3 section at the end

- [ ] 2.8 Preview-deploy spike — **BLOCKED on the owner.** Gates slices 3–4
- [x] 3.1–3.9 `feat/auth-routes` — DONE in rev 4 except the E2E half of 3.8
- [ ] 4.1–4.4 `feat/auth-signin-ui` — localized sign-in page

Slice 2 leaves slice 3 four things it should not rediscover:

1. `markPrivate(Astro.response.headers)` exists and must be called by every
   auth-dependent page and endpoint. It has no callers yet — slice 3 adds the first.
2. `locals.user` is `User | null` and **never** `undefined`. Any new page-render test
   harness must pass `user: null` explicitly or it will not typecheck.
3. Task 2.8's spike is still open and gates slice 3's own E2E. Run it FIRST.
4. Identity resolution fails OPEN and permission enforcement fails CLOSED. `roles.ts`
   must not be aligned with the middleware, nor the middleware with `roles.ts`. The
   reasoning is in the `src/middleware.ts` module header.

## Status

**8 / 9 slice-2 tasks complete** (2.1–2.7, 2.9), plus baseline task 2.0.
Task 2.8 is **blocked on the owner**, deliberately not attempted and not faked.
Cumulative: **15 / 16 executable tasks** across slices 1 and 2.
`pnpm test` → `972 passed | 10 skipped` (after the correction).
`pnpm typecheck` → `0 errors`.
Ready for independent SDD verification of slice 2.

---

# Slice 2 correction — `getUser()` fails OPEN · COMPLETE

Closes issue #4 above. Branch `feat/auth-middleware`, commit `4813e6d`, one work unit.

**Owner's decision, implemented literally**: the middleware RESOLVES identity and fails
OPEN; the guards ENFORCE permission and fail CLOSED. A `getUser()` rejection degrades to
`locals.user = null` and the request renders, so a Supabase blip cannot 500 books, news
or exercises — none of which read `locals.user`. This opens nothing: with no user, every
downstream role guard denies exactly as it would for an anonymous visitor.

**COMPRESSED, rev 4 — full detail in commit `4813e6d` and PR #14.**

**Changed**: `src/middleware.ts` — a `try`/`catch` scoped to the
`client.auth.getUser()` call ALONE, plus `console.error('[middleware] getUser()
threw:', err)` and a 20-line header block documenting the OPEN/CLOSED asymmetry
and naming `src/lib/roles.ts` as the CLOSED counterpart. `src/middleware.test.ts`
— +3 tests and 2 helpers; the pre-existing resolve-with-`error` test was neither
edited nor duplicated. 118 authored lines.

**TDD**: safety net `25 passed (25)` captured first. RED observed as
`Tests 3 failed | 25 passed (28)`, each failing with the rejection propagating
uncaught (`Error: fetch failed`, `Error: ECONNRESET`) — the 500 mechanism itself.
GREEN `28 passed (28)`. Triangulated on: a rejecting `getUser()` vs the existing
`{data:{user:null}, error}` case (an implementation handling only the value shape
passes the old test and fails the new one — exactly the bug that shipped); blast
radius across a locale page and an API path, proving the catch did not swallow
routing; and a `console.error` spy, which a bare `catch {}` fails. `res.status`
is asserted `not.toBe(500)` AND `toBe(200)` with body still `'OK'`, so the
fail-open path is proven to RENDER rather than return a degraded empty response.

**Rollback boundary**: revert `4813e6d`. Two files, removing only the
`try`/`catch`, the log line, the header block and three tests. **Runtime
harness**: N/A — this correction adds no new transport; the real boundary is
still task 2.8.

**Verification**: `pnpm test` ran 7 times — 6 green at `972 passed | 10 skipped`,
1 with a single failure attributed to the then-unfixed `ShareDialog` flake (since
fixed in PR #16). `pnpm typecheck` → `0 errors`.

## Deviations from design (correction)

**One, and it is the point of the correction.** Design §1 writes the `getUser()` call
with no failure path, and slice 2 implemented it literally (deviation #4 above). The
owner has now decided otherwise, so the shipped code intentionally diverges from design
§1 on this line. **Design §1 should be amended during archive** to carry the fail-OPEN
rule and the OPEN/CLOSED asymmetry; until then the module header is the authority.

## Issues found (correction)

**None new.** The `ShareDialog.test.tsx` flake (issue #2) surfaced once and remains
pre-existing and unowned by this work.

## Delivery state (correction)

**Not pushed. No pull request. Not merged.** Branch `feat/auth-middleware` is local, at
`4813e6d`, four commits ahead of `93a9490`. The slice-2 PR boundary above now carries a
fourth commit at 118 lines; the "middleware + identity" unit becomes 430 lines if the
three-way split is taken, which is 7.5% over budget on that unit alone.

*(Slice 2 has since merged to `main` as PR #14; `main` is at `37cf2e3`.)*

---

# Slice 3 — `feat/auth-routes` · COMPLETE except the E2E half of 3.8

Branch `feat/auth-routes`, cut from a clean `main` at `37cf2e3`. Five work-unit
commits, local only. This is the highest security-surface slice in the change:
three of its requirements are vulnerabilities rather than style preferences.

## Baseline (task 3.0) — recorded BEFORE any change, verbatim

| Command | Observed result |
|---|---|
| `pnpm test` | **PASS** — `Test Files 55 passed (55)` · `Tests 972 passed \| 10 skipped (982)` |
| `pnpm typecheck` | **PASS** — `Result (142 files): 0 errors, 0 warnings, 0 hints` |

Typecheck is 0 errors, so the task-3.0 stop condition did not trigger. The
`ShareDialog` flake that plagued slices 1–2 (rev-3 issue #2) was fixed and merged
as PR #16 (`f7b86c5`), so there are **no known environmental failures** and
anything red after this point is slice 3's. Nothing was.

## Completed tasks

- [x] 3.1 RED T1 `src/lib/authRedirect.test.ts`
- [x] 3.2 RED T2 `src/pages/api/auth/confirm.test.ts`
- [x] 3.3 RED `src/pages/api/auth/signin.test.ts` — no account enumeration
- [x] 3.4 GREEN `src/lib/authRedirect.ts` (NEW)
- [x] 3.5 GREEN `src/pages/api/auth/signin.ts` (NEW)
- [x] 3.6 GREEN `src/pages/api/auth/confirm.ts` (NEW)
- [x] 3.7 GREEN `src/pages/api/auth/signout.ts` (NEW)
- [ ] 3.8 **PARTIALLY DONE, remainder BLOCKED** — see the dedicated section below
- [x] 3.9 Verify `pnpm test && pnpm typecheck`

## Files changed

| File | Action | What was done |
|---|---|---|
| `src/lib/authRedirect.ts` | Created | `safeNextPath`, `stripAuthParams`, `withAuthError`, `AUTH_ERROR_PARAM`, `AUTH_ERROR_LINK_INVALID`. Pure, zero I/O |
| `src/lib/authRedirect.test.ts` | Created | 34 unit tests: 15 for `safeNextPath` (T1), 8 for `stripAuthParams` (T2), 5 for `withAuthError`, plus accepted-path and absent-input cases |
| `src/pages/api/auth/signin.ts` | Created | POST — `signInWithOtp`, one uniform response on every path |
| `src/pages/api/auth/signin.test.ts` | Created | 15 tests, 4 of them full-response fingerprint comparisons (T3) |
| `src/pages/api/auth/confirm.ts` | Created | GET — `verifyOtp({type:'email'})`, 303 to a stripped safe target |
| `src/pages/api/auth/confirm.test.ts` | Created | 17 tests: T2 stripping, verification contract, four rejection paths, response mechanics |
| `src/pages/api/auth/signout.ts` | Created | POST-only — `signOut()`, 303 to a guarded target |
| `src/pages/api/auth/signout.test.ts` | Created | 9 tests incl. both provider-failure paths |

Out of scope and untouched, as instructed: `src/pages/[lang]/auth/entrar.astro`
(slice 4), every migration, `src/lib/i18n.ts`, every UI file.
`PRD-arquitectura.md` remains untracked and uncommitted.

## The three security requirements — what was actually decided

### T1 — open redirect (`safeNextPath`)

Rejects, each with its own test: `//evil.com` (protocol-relative — keeps our
scheme, changes our host), `/\evil` (the WHATWG URL parser normalises `\` to `/`
for special schemes, so the browser reads it as `//evil`), `https://evil`,
`javascript:`, `data:`, a bare relative reference, and `\\evil.com`.

**The encoding decision, made deliberately and documented in the module header:
validation runs AFTER decoding, and after EVERY decode pass, not just the first.**
The value is decoded repeatedly to a fixed point (bounded at 4 passes) and every
form along the way — the raw one included — must independently look like a
same-site path. Reasons, in order of weight:

1. `/%2F%2Fevil.com` shows one harmless leading slash and decodes to
   `///evil.com`. A raw-only check passes it.
2. `/%252F%252Fevil.com` survives a *single* decode too, which is why the check
   iterates to a fixed point rather than decoding once.
3. Intermediate forms are checked, not just the endpoints, because we do not
   control how many decoders sit between the return value and the browser — the
   framework, a proxy and a CDN may each decode once. A form unsafe at any depth
   is a form somebody can arrange to have resolved.
4. A value that cannot be decoded (`%zz`) is refused, and so is one still
   changing after the bound. A guard that cannot say what a string means must not
   approve it.

**Control characters are refused outright** (`[\u0000-\u001f\u007f]`). Browsers
STRIP tab, LF and CR from a URL before parsing, so `/<TAB>/evil.com` is resolved
as `//evil.com` — a string we never inspected. Both the literal (`/\t/evil.com`)
and the encoded (`/%0A/evil.com`) forms have tests. Space is deliberately NOT in
the class: browsers do not strip it and it cannot introduce an authority.

### T2 — token leak through the URL (`confirm.ts` + `stripAuthParams`)

`token_hash` and `type` are removed **before** the 303, through two independent
barriers:

1. The redirect target is built from `next` ALONE, never from the confirm
   route's own URL, so the incoming parameters have no default path into it.
2. `stripAuthParams` then removes them from `next` as well, because `next` is
   attacker-supplied and can carry a copy. There is a test for exactly that
   (`next=/es/libros?token_hash=…&type=email&orden=reciente` →
   `/es/libros?orden=reciente`).

Both barriers are asserted on the failure path too, so a rejected link cannot
leak what a successful one does not.

### T3 — account enumeration (`signin.ts`)

**`shouldCreateUser` stays at its default of `true`. Confirmed against design.md,
not assumed.** Design §1 writes the call as
`signInWithOtp({ email, options:{ data:{lang}, emailRedirectTo }})` — the option
does not appear — and the route table at design §1 annotates the endpoint
"always the same body; **no account enumeration by construction**". "By
construction" is the whole point: the default creates the account for an unknown
address and sends it the same link a known one gets, so the two cases are
indistinguishable **at the provider**, not merely at our wrapper. Setting it to
`false` makes Supabase refuse unknown addresses — one case sends an email and the
other does not — and nothing this endpoint returns can hide that from anyone who
controls the destination mailbox. It also matches how the feature works: there is
no separate registration, so the first magic link IS the sign-up. A test asserts
the options object has no `shouldCreateUser` property at all.

The endpoint's own uniformity is proven independently of Supabase's, which is the
part that survives a provider change: three tests compare the FULL response
(status, body text, and every header, sorted) between an address with an account
and one without — including the case where the mocked `signInWithOtp` answers
DIFFERENTLY for the two, and the case where it throws. A 500 on some addresses
and a 200 on others is the same leak with a different cause.

**Residual, honestly stated: response TIMING is not equalised.** A Supabase call
that errors early may return faster than one that succeeds. That is a much
weaker oracle than a status code and is not fixable at this layer without an
artificial delay, which would be its own problem. Not in scope, recorded here.

## TDD cycle evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.1 → 3.4 | `src/lib/authRedirect.test.ts` | Unit | N/A (new file) | ✅ Observed: `Cannot find module './authRedirect'` · `Tests: no tests` | ✅ `29 passed (29)` | ✅ 29 cases across 4 behaviour groups | ✅ `splitPath`/`joinPath` extracted in WU3; 29 still green |
| 3.3 → 3.5 | `src/pages/api/auth/signin.test.ts` | Integration | N/A (new file) | ✅ Observed: `Failed to load url ./signin` · `Tests: no tests` | ✅ `15 passed (15)` | ✅ 15 cases, 4 of them full-response comparisons | ➖ None needed |
| 3.2 → 3.6 | `src/pages/api/auth/confirm.test.ts` | Integration | ✅ 29/29 `authRedirect` green first | ✅ Observed: `Failed to load url ./confirm` AND the missing `AUTH_ERROR_*` exports | ✅ `17 passed (17)`, `authRedirect` still `29 passed` | ✅ 17 cases incl. 4 distinct rejection causes | ➖ None needed |
| 3.7 | `src/pages/api/auth/signout.test.ts` | Integration | N/A (new file) | ✅ Observed: `Failed to load url ./signout` · `Tests: no tests` | ✅ `9 passed (9)` | ✅ 9 cases incl. both provider-failure paths | ➖ None needed |
| `withAuthError` direct coverage | `src/lib/authRedirect.test.ts` | Unit | ✅ 29/29 green first | ✅ **Earned by MUTATION** — see below | ✅ `34 passed (34)` | ✅ 5 cases | ➖ None needed |

**`withAuthError`'s RED was earned, not assumed.** The function shipped under the
confirm route's RED cycle, so by the time direct tests were written the code
already existed and a new test would pass at birth — which proves nothing. Its
`params.set` was therefore temporarily mutated to `params.append` and the suite
run: `Tests 2 failed | 32 passed (34)`, both failures being the smuggling cases.
The mutation was reverted and the suite re-run green. That is the RED
observation, and it is the only proof the anti-smuggling assertion has teeth.
Same technique slice 2 used for the `astro.config.mjs` guard.

Triangulation, per behaviour:

| Behaviour | Cases forcing real logic |
|---|---|
| `safeNextPath` accept vs reject | `/es/ni%C3%B1os` (encoded but harmless — must be KEPT) vs `/%2F%2Fevil.com` (encoded and hostile). An implementation that rejects every escape passes the second and fails the first; one that inspects only raw text does the reverse |
| Decode depth | `/%2F%2Fevil.com` (one pass) vs `/%252F%252Fevil.com` (two). A single-decode guard passes the first case and fails the second, which is exactly what forces the fixed-point loop |
| Control characters | Literal `/\t/evil.com` vs encoded `/%0A/evil.com`. A raw-only character class catches the first and misses the second |
| `stripAuthParams` | A query that empties completely (`?type=email` → no `?` at all) vs one that keeps parameters (`?token_hash=a&nivel=a1` → `?nivel=a1`) vs a repeated parameter (`token_hash` twice). A `replace`-based implementation passes the middle case and fails the other two |
| T3 uniformity | Supabase answering the SAME for both addresses vs answering DIFFERENTLY vs throwing. A pass-through implementation satisfies only the first |
| `confirm` rejection causes | Expired, already-consumed, missing `token_hash`, and provider unreachable. The missing-token case additionally asserts `verifyOtp` was NOT called, which no shared "return the invite" branch can fake |
| `confirm` header ordering | A buffered `cache-control: public, max-age=3600` from `pendingHeaders` must NOT win. An implementation that flushes after `markPrivate` passes every other test and fails this one |
| `signout` failure modes | `{error}` returned vs a thrown rejection. A `try`-less implementation handles the first and 500s on the second |

Tests written: **75** (34 `authRedirect`, 15 `signin`, 17 `confirm`, 9 `signout`).
Passing: **75**. Layers: Unit (34), Integration (41). Approval tests: none — slice
3 refactored no existing behaviour. Pure functions created: **3**
(`safeNextPath`, `stripAuthParams`, `withAuthError`).

No banned assertion patterns. Every assertion calls production code and compares
against a concrete value. There are no `toBeDefined()`-only checks, no empty-array
assertions without a setup that explains the emptiness, no CSS-class assertions,
and no loops over possibly-empty collections. Mock count per file is 1–2, well
inside the healthy band, because the routes' logic was extracted into
`authRedirect.ts` and tested there with **zero** mocks.

## Work unit evidence

Slice 3 is five independent work units, committed separately.

| Unit | Commit | Focused test command and result | Rollback boundary |
|---|---|---|---|
| redirect guards | `561927b` | `pnpm vitest run src/lib/authRedirect.test.ts` → `Test Files 1 passed (1) · Tests 29 passed (29)` | Delete `src/lib/authRedirect.{ts,test.ts}`. No consumers at that commit |
| sign-in endpoint | `4f575be` | `pnpm vitest run src/pages/api/auth/signin.test.ts` → `Tests 15 passed (15)` | Delete `src/pages/api/auth/signin.{ts,test.ts}`. Nothing links to it until slice 4 |
| confirm endpoint | `37dafb9` | `pnpm vitest run src/pages/api/auth/confirm.test.ts src/lib/authRedirect.test.ts` → `Test Files 2 passed (2) · Tests 46 passed (46)` | Delete `src/pages/api/auth/confirm.{ts,test.ts}` and revert the `withAuthError`/`splitPath` block in `authRedirect.ts` |
| sign-out endpoint | `68212dd` | `pnpm vitest run src/pages/api/auth/signout.test.ts` → `Tests 9 passed (9)` | Delete `src/pages/api/auth/signout.{ts,test.ts}` |
| marker coverage | `89a2d09` | `pnpm vitest run src/lib/authRedirect.test.ts` → `Tests 34 passed (34)` | Revert the commit. Test-only; no production line moves |

**Runtime harness: N/A at this layer, and the gap is precisely task 3.8.** These
tests prove the routes' DECISIONS — what they call, with what arguments, and
what they return. They cannot prove the mail transport, the emailed link's shape,
or that a cookie set inside a Netlify Function survives back to a browser. Task
2.8's preview-deploy spike and task 3.8's browser round trip are the only things
that can, and both are blocked on the owner.

## Task 3.8 — what is proven and what is not

**Proven now, at unit level, in `confirm.test.ts`** — everything below the mail
transport, asserted on observable behaviour rather than on the provider:

| Case | Asserted outcome |
|---|---|
| Valid token | `verifyOtp({type:'email', token_hash})` called once; 303 to the requested destination; no error marker |
| Expired token | No session; 303 to `/es/?auth=link-invalid` |
| Already-consumed token | No session; the invite marker present |
| Missing `token_hash` | `verifyOtp` NOT called at all; the invite marker present |
| Provider unreachable | 303 with the invite marker, never a 500 |
| Attacker-chosen `type` | Ignored; `verifyOtp` always receives `'email'` |

**NOT proven, and deliberately not faked — the E2E browser round trip that
actually RECEIVES an email.** Specifically unproven: that Supabase's template
emits a `token_hash` link rather than an implicit fragment link (owner
prerequisite #4); that link tracking does not rewrite and break the URL (prereq
#2); that the confirm URL is in the redirect allow-list (prereq #3); that the
chunked `sb-<ref>-auth-token.0/.1` cookies survive the Netlify Function round
trip (task 2.8); and that a real expired token produces the same observable
outcome as the mocked one.

**On the mail provider.** The owner has deferred the email provider (Resend,
prereq #1) to the final project stages, which is a scheduling decision and not a
blocker for this slice. Worth recording for whoever runs 3.8: **Supabase ships a
built-in SMTP sender, but it is restricted to the project team's own addresses
and rate-limited to 2 messages per hour.** That is enough for the owner to walk
the flow manually and close most of the list above, and nowhere near enough for
an automated E2E suite — which is why 3.8 stays open rather than being marked
done on the strength of a manual pass.

**Recommended order once unblocked**: run task 2.8's preview-deploy spike first
(its checklist is in the slice-2 section above and its step 7 whoami probe is the
only thing that proves identity RESOLVED rather than merely that a cookie moved),
then walk 3.8's round trip on the same deploy.

## Verification commands (slice 3)

| Command | Observed result |
|---|---|
| `pnpm test` run 1 | **PASS** — `Test Files 59 passed (59)` · `Tests 1047 passed \| 10 skipped (1057)` |
| `pnpm test` run 2 | **PASS** — `Test Files 59 passed (59)` · `Tests 1047 passed \| 10 skipped (1057)` — byte-identical to run 1 |
| `pnpm typecheck` | **PASS** — `Result (150 files): 0 errors, 0 warnings, 0 hints` |
| `pnpm vitest run src/lib/authRedirect.test.ts` | **PASS** — `Tests 34 passed (34)` |
| `pnpm vitest run src/pages/api/auth/signin.test.ts` | **PASS** — `Tests 15 passed (15)` |
| `pnpm vitest run src/pages/api/auth/confirm.test.ts` | **PASS** — `Tests 17 passed (17)` |
| `pnpm vitest run src/pages/api/auth/signout.test.ts` | **PASS** — `Tests 9 passed (9)` |
| `pnpm test:e2e` | **NOT RUN** — slice 3 adds no E2E spec, and the magic-link E2E it would carry is the blocked half of 3.8 |

Baseline was `55 / 972 / 10`. The delta is exactly this slice's 4 new test files
and 75 new tests. File count 142 → 150 for the 8 new files, all typechecking
clean. An earlier pair of runs at commit `68212dd` (before the marker-coverage
commit) also gave two identical greens at `1042 passed | 10 skipped`, so the
suite has now been observed stable across four consecutive full runs.

## Deviations from design (slice 3)

1. **`withAuthError` and the `auth=link-invalid` marker are new and NOT in the
   design.** The `user-identity` spec requires that a visitor who opens an
   expired or already-used link "sees a message inviting them to request a new
   link", and design §1 specifies only the success redirect. A 303 has no body to
   render a message into, so something has to survive the redirect. A single
   query marker, emitted from a shared exported constant so the writer and the
   reader cannot disagree, is the smallest thing that satisfies the requirement.
   **Slice 4 must render copy for `?auth=link-invalid` on the sign-in page, or
   this spec scenario stays unmet.** Design §1 should be amended during archive
   to carry the failure path.

2. **`signout.ts` accepts an optional `next`.** Design §1 says "303 home", and
   `safeNextPath(null)` IS the default-locale home, so the default behaviour is
   exactly as specified. The optional parameter exists because dropping an
   English reader onto the Spanish home page after sign-out is a locale bug; it
   goes through the same guard as the magic-link routes, so it cannot become an
   open redirect. Two tests cover it, one of them hostile.

3. **`stripAuthParams` is a second exported function in `authRedirect.ts`.** Task
   3.4 names only `safeNextPath`. The stripping rule is pure string logic and
   belongs beside its sibling where it can be unit-tested directly, rather than
   inline in a route where it could only be reached through a Request/Response
   round trip.

4. **`signin.ts` accepts JSON only, not form encoding.** Design §1 writes the body
   as `{email,lang,next}` without specifying a content type. JSON matches the
   existing island-to-endpoint pattern (`src/pages/api/me-gusta/[id].ts`).
   **Consequence for slice 4: the sign-in page must post with `fetch`, not as a
   plain no-JS `<form>`.** If a no-JS form is wanted, this endpoint needs a
   form-encoded branch and a redirect response — decide it in slice 4, not later.

5. **A syntactically invalid email returns 400, not the uniform 200.** Validity is
   computed locally from the string alone and never depends on whether an account
   exists, so this branch leaks nothing an attacker could use. It exists so the
   form can tell a typo from a sent link.

Nothing else deviates. The route placement under `/api/auth/*` rather than
`/[lang]/auth/*`, the `verifyOtp({type:'email', token_hash})` call, the
`setAll` → 303 ordering, the `signInWithOtp` option shape, and the
`safeNextPath` rule all match design §1 and the `user-identity` spec.

## Issues found (slice 3)

1. **Review budget exceeded by a wide margin: 1,353 authored lines against a 400
   budget and a ~350 estimate.** This is 238% over budget and 286% over estimate,
   and it is the third consecutive slice to overrun. See the boundary section
   below: the work IS already sliced into five commits, four of which are under
   budget on their own.

2. **The estimate model is wrong for this codebase, and it is now wrong three
   times in a row** (slice 1: 360 est / 445 actual; slice 2: 250 / 481; slice 3:
   350 / 1,353). The cause is structural, not accidental: strict TDD plus the
   house's very dense comment style means test code and header blocks dominate.
   In slice 3, **80% of the diff is test code or comment blocks**. Later slices
   should assume roughly 3× the naive estimate, or the forecast will keep being a
   number nobody can hit.

3. **`signOut()` failing leaves a residual signed-in session.** The route logs and
   still redirects, which is right for the visitor — stranding them on an error
   page with a signed-in browser and no way out would be worse. But if the cookie
   clearing did not happen, the session survives until it expires. Not fixable
   without reaching into Supabase's cookie naming, which would then rot when the
   chunking scheme changes. Recorded, not hidden.

4. **T3's timing side channel is unaddressed.** See the T3 section above. Weak,
   real, out of scope.

## Workload / PR boundary (slice 3)

- **Mode**: stacked PR slice (`stacked-to-main`)
- **Current work unit**: slice 3, branch `feat/auth-routes`, local only
- **Boundary**: starts at `37cf2e3` (`main`, PR #16 merged), ends at `89a2d09`.
  Delivers the three magic-link endpoints and the redirect guards. No UI, no
  migration, no navigation entry, and no existing file is modified — the entire
  diff is eight new files, which is what keeps rollback trivial.
- **Authored review budget**: **1,353 lines** (`additions + deletions`), all
  additions:

  | File | Lines |
  |---|---|
  | `src/lib/authRedirect.ts` | 256 |
  | `src/pages/api/auth/confirm.test.ts` | 248 |
  | `src/lib/authRedirect.test.ts` | 220 |
  | `src/pages/api/auth/signin.test.ts` | 211 |
  | `src/pages/api/auth/signout.test.ts` | 138 |
  | `src/pages/api/auth/signin.ts` | 121 |
  | `src/pages/api/auth/confirm.ts` | 100 |
  | `src/pages/api/auth/signout.ts` | 59 |

- **One honest slicing pass, already committed as five chained PRs.** Four of the
  five land inside budget on their own:

  | # | Unit | Commit | Lines | Independent? |
  |---|---|---|---|---|
  | 1 | redirect guards | `561927b` | 370 | Yes — pure module, no consumers |
  | 2 | sign-in endpoint | `4f575be` | 332 | Yes — depends only on #1 |
  | 3 | confirm endpoint | `37dafb9` | **434** | Yes — depends only on #1 |
  | 4 | sign-out endpoint | `68212dd` | 197 | Yes — depends only on #1 |
  | 5 | marker coverage | `89a2d09` | 46 | Yes — test-only |

  Only unit 3 is over, by 8.5%. It could be split once more (the `withAuthError`
  block in `authRedirect.ts` ahead of `confirm.ts`), but the marker has no
  consumer without the confirm route, so that split would produce a PR that
  delivers nothing observable. **`size:exception` is recommended for unit 3 alone,
  at 434 lines.**

  Per the work-unit rules, nothing was cut to reach a number: no comment, blank
  line or test was removed, and no code was compressed. 80% of the 1,353 lines is
  test code and house-style comment blocks, both of which the budget rules
  explicitly forbid trading away.

## Delivery state (slice 3)

**Not pushed. No pull request. Not merged.** Branch `feat/auth-routes` is local,
at `89a2d09`, five commits ahead of `37cf2e3`. Delivery is the owner's decision.
`PRD-arquitectura.md` remains untracked and uncommitted, as instructed.

## Status

**8 / 9 slice-3 tasks complete** (3.1–3.7, 3.9), plus baseline task 3.0.
Task 3.8 is **partially complete**: every outcome below the mail transport is
covered at unit level; the browser round trip that receives a real email remains
**blocked on the owner**, deliberately not attempted and not faked.
Cumulative: **23 / 25 executable tasks** across slices 1–3. The two open items are
2.8 (preview-deploy spike) and the E2E half of 3.8, both owner-gated.
`pnpm test` → `1047 passed | 10 skipped`, twice, identical.
`pnpm typecheck` → `0 errors`.
Ready for independent SDD verification of slice 3.

## What slice 4 should not rediscover

1. **`?auth=link-invalid` must be rendered.** Import `AUTH_ERROR_PARAM` and
   `AUTH_ERROR_LINK_INVALID` from `@lib/authRedirect`; do not re-spell them. Until
   the sign-in page renders copy for that marker, the `user-identity` scenario
   "visitor clicks an expired or already-used link" is not satisfied.
2. **`/api/auth/signin` takes JSON.** The page must post with `fetch`. A no-JS
   `<form>` needs a form-encoded branch added to the endpoint first.
3. **Sign-out is POST-only, and that is a security property**, not an oversight:
   `sameSite: 'lax'` makes the method the CSRF defense. Never add a GET variant.
4. **`markPrivate` now has three callers.** Every new auth-dependent page and
   endpoint must call it too.
5. **`next` is never trusted anywhere.** Both the sign-in endpoint and the confirm
   route run `safeNextPath` independently. Any new surface that accepts a
   destination does the same.
