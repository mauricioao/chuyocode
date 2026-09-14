# Apply Progress: User-Authored Exercises

**Artifact**: `gentle-ai.sdd-apply/v1` · **Rev**: 1 · **Change**: `user-authored-exercises`
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/apply-progress`)
**Mode**: Strict TDD · **Test runner**: `pnpm test` → `vitest run`
**Batch**: Slice 1 only — `feat/auth-session-client`
**Previous apply-progress**: none. This is the first batch.

---

## Baseline (task 1.0) — recorded BEFORE any change

| Command | Observed result |
|---|---|
| `pnpm test` | **PASS** — `Test Files 52 passed (52)` · `Tests 927 passed \| 10 skipped (937)` |
| `pnpm typecheck` | **FAIL** — `Result (137 files): 15 errors, 0 warnings, 0 hints` · exit 1 |

The 15 baseline `astro check` errors, verbatim:

```
src/middleware.test.ts:32:20 - error ts(2558): Expected 0-1 type arguments, but got 2.
src/components/ui/SearchFilter.astro:265:10 - error ts(2339): Property 'dataset' does not exist on type 'Element'.
src/components/ui/SearchFilter.astro:264:14 - error ts(2339): Property 'dataset' does not exist on type 'Element'.
src/components/ui/SearchFilter.astro:250:40 - error ts(7006): Parameter 'e' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:236:11 - error ts(7005): Variable 'onOpenEnd' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:226:50 - error ts(7005): Variable 'onOpenEnd' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:223:20 - error ts(7006): Parameter 'e' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:217:13 - error ts(7005): Variable 'onOpenEnd' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:212:11 - error ts(7005): Variable 'onOpenEnd' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:207:9 - error ts(7034): Variable 'onOpenEnd' implicitly has type 'any' in some locations where its type cannot be determined.
src/components/ui/SearchFilter.astro:180:23 - error ts(7006): Parameter 'root' implicitly has an 'any' type.
src/components/ui/SearchFilter.astro:172:22 - error ts(7006): Parameter 's' implicitly has an 'any' type.
src/pages/index.astro:11:1 - error ts(6133): 'DEFAULT_LANG' is declared but its value is never read.
src/pages/[lang]/noticias/noticias.test.ts:31:15 - error ts(2322): Type 'string' is not assignable to type '"es" | "en" | undefined'.
tests/e2e/hero-carousel.spec.ts:71:14 - error ts(2353): Object literal may only specify known properties, and 'reducedMotion' does not exist in type 'Fixtures<...>'.
```

`pnpm typecheck` was **already red before this batch touched anything**. This is a
`## Known environmental failure`, not a regression introduced here. None of the 15 errors
sits in a file this slice authored or modified. They are unchanged, one-for-one, after the
batch — same files, same lines, same codes.

---

## Completed tasks

- [x] 1.1 RED `src/lib/supabaseSession.test.ts`
- [x] 1.2 Bump `package.json`: `@supabase/supabase-js` `^2.58.0` → `^2.114.0`; add `@supabase/ssr@0.12.7`
- [x] 1.3 GREEN `src/lib/supabaseSession.ts` (NEW)
- [x] 1.4 `src/lib/supabase.ts` header note documenting the third client kind
- [x] 1.5 Re-read the vendored `PostgrestBuilder implements PromiseLike` path
- [x] 1.6 Verify `pnpm why @supabase/supabase-js` reports a single resolved version
- [x] 1.7 Verify the full suite before slice 2 builds on this

---

## Files changed

| File | Action | What was done |
|---|---|---|
| `src/lib/supabaseSession.test.ts` | Created | 13 unit tests: cookie-flag matrix, explicit-flag proof, `cookieOptions` pass-through, `getAll` parse + non-string filter, `setAll` set/delete/header buffering |
| `src/lib/supabaseSession.ts` | Created | `sessionCookieOptions(isProd)`, `createSessionClient({request, cookies, isProd})`, `SessionClient` interface |
| `package.json` | Modified | `@supabase/supabase-js` `^2.58.0` → `^2.114.0`; added `@supabase/ssr` `0.12.7` |
| `pnpm-lock.yaml` | Modified | Generated. Resolves `supabase-js` to `2.116.0`, `postgrest-js` to `2.116.0` |
| `src/lib/supabase.ts` | Modified | Header note only. No behavior change to either existing client |
| `src/lib/exercises.test.ts` | Modified | Comment only. Refreshed the vendored-path citation after the bump |

Out of scope and untouched, as instructed: `src/middleware.ts`, `src/env.d.ts`,
`astro.config.mjs`, every route, every migration, every UI file.

---

## TDD cycle evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 → 1.3 | `src/lib/supabaseSession.test.ts` | Unit | N/A (new file) | ✅ Observed failing: `Error: Cannot find module './supabaseSession'` | ✅ `13 passed (13)` | ✅ 13 cases across 5 behaviors | ➖ None needed — written clean |
| 1.2 | — (dependency bump) | — | ✅ 927/927 baseline captured first | ➖ Not applicable | ✅ `940 passed \| 10 skipped` | ➖ N/A | ➖ N/A |
| 1.4 | — (comment only) | — | ✅ Covered by full suite | ➖ Not applicable — no behavior | ✅ Suite green | ➖ N/A | ➖ N/A |
| 1.5 | `src/lib/exercises.test.ts` | Unit | ✅ Existing suite green before and after | ➖ Comment-only change | ✅ Suite green | ➖ N/A | ➖ N/A |

RED was **observed by execution**, not asserted: `pnpm vitest run src/lib/supabaseSession.test.ts`
returned `Test Files 1 failed (1) · Tests no tests` with
`Failed to load url ./supabaseSession … Does the file exist?`.

Triangulation, per behavior:

| Behavior | Cases forcing real logic |
|---|---|
| `sessionCookieOptions` | `isProd=true` vs `isProd=false` — a hardcoded constant cannot satisfy both |
| Explicit-flag rule | `Object.keys().sort()` + `hasOwnProperty` on `httpOnly` and `secure` — distinguishes a set flag from an inherited default, which `toEqual` alone cannot |
| `cookieOptions` pass-through | Asserted in both environments plus the URL/key arguments |
| `getAll` | With cookies (non-empty result), without a `Cookie` header (empty result, and the emptiness is caused by the guard), and with a parser emitting a value-less entry |
| `setAll` | Two cookies set with their own options · empty value routes to `delete` and never `set` · headers buffered · headers absent leaves the map at size 0 |

Tests written: **13**. Tests passing: **13**. Layers: Unit (13). Approval tests: none — no
refactoring task in this slice. Pure functions created: **1** (`sessionCookieOptions`).

No banned assertion patterns: every `toEqual([])` in this file is paired with a non-empty
counterpart and a stated precondition, and no assertion touches a CSS class or an internal.

---

## Work unit evidence

| Evidence | Value |
|---|---|
| Focused test command | `pnpm vitest run src/lib/supabaseSession.test.ts` → `Test Files 1 passed (1) · Tests 13 passed (13)` |
| Runtime harness | **N/A with reason.** Slice 1 introduces no runtime boundary: `createSessionClient` performs no I/O at construction and is not yet wired into any request path. The first real runtime boundary is the middleware work unit, whose plan already carries the Netlify preview-deploy spike (task 2.8) as the owner-blocking proof that a `@supabase/ssr` session survives a real deploy. |
| Rollback boundary | Delete `src/lib/supabaseSession.ts` and `src/lib/supabaseSession.test.ts`, revert the `package.json` / `pnpm-lock.yaml` bump, revert two comment blocks (`src/lib/supabase.ts` header, `src/lib/exercises.test.ts:34`). Nothing else in the repo imports the new module, so the revert removes no unrelated work and no schema exists to unwind. |

---

## Verification commands

| Command | Observed result |
|---|---|
| `pnpm install` | **PASS** — `Done in 3m 6.2s`. `+ @supabase/ssr 0.12.7` · `- @supabase/supabase-js 2.110.7` · `+ @supabase/supabase-js 2.116.0`. Unrelated pre-existing peer warning: `@rolldown/plugin-babel 0.2.3 → unmet peer vite@^8.0.0: found 6.4.3` |
| `pnpm why @supabase/supabase-js` | **PASS — single resolved version.** `@supabase/ssr 0.12.7 └── @supabase/supabase-js 2.116.0 peer` and the direct `@supabase/supabase-js 2.116.0` resolve to the same copy. Confirmed on disk: `node_modules/.pnpm` holds exactly one `@supabase+supabase-js@*` directory (`2.116.0_@opentelemetry+api@1.9.1`) |
| `pnpm test` | **PASS** — `Test Files 53 passed (53)` · `Tests 940 passed \| 10 skipped (950)`. Baseline was 52 / 927 / 10; the delta is exactly this slice's 1 new file and 13 new tests |
| `pnpm typecheck` | **FAIL (pre-existing)** — `Result (139 files): 15 errors, 0 warnings, 0 hints`, exit 1. Identical 15 errors to the baseline, same files and lines. File count rose 137 → 139 because this slice added two files, both of which typecheck clean |

---

## Design verification table (design §10) — status

| # | Item | Result |
|---|---|---|
| 1 | `createClient(url, key, { auth: {...} })` still typechecks | ✅ No new error in `src/lib/supabase.ts` |
| 2 | `PostgrestBuilder implements PromiseLike` still holds | ✅ Re-verified at `@supabase+postgrest-js@2.116.0/.../src/PostgrestBuilder.ts:17`; `then` at `:222`. Citation updated |
| 3 | `.maybeSingle()` / `.eq()` / `.order()` / `.limit()` signatures | ✅ No new typecheck error |
| 4 | `rpc('increment_exercise_like', …)` / `decrement_…` | ✅ `likes.test.ts` green inside the full suite |
| 5 | One resolved copy of `@supabase/supabase-js` | ✅ See `pnpm why` above |
| 6 | Full suite green before slice 2 | ⚠️ `pnpm test` green; `pnpm typecheck` red at the pre-existing baseline. `pnpm test:e2e` NOT run — out of this slice's task list |

---

## Deviations from design

1. **`parseCookieHeader` no longer emits `undefined` values at `0.12.7`.** The design
   instructs filtering entries whose `value` is `undefined`, citing the
   `{ name, value?: string }` shape. At the pinned `0.12.7` the declared return type is
   `{ name: string; value: string }[]` and the implementation coalesces with
   `parsed[name] ?? ""`, so no `undefined` can reach the caller today. **The filter was
   implemented anyway**, as the design requires: it costs one predicate, it keeps the
   `GetAllCookies` contract true under any version drift, and removing it would make a
   future downgrade or upgrade fail somewhere far from the cause. Because the real parser
   can no longer produce the case, the test drives it through a spy that wraps the real
   implementation and is overridden for exactly that one assertion.

2. **Scope addition, within the slice.** Tasks 1.1–1.3 name only the cookie-options tests.
   Strict TDD forbids shipping `getAll` / `setAll` without a test written first, so RED
   coverage for both was written in the same file before the implementation. No production
   behavior beyond task 1.3's own description was added.

Nothing else deviates. `sameSite: 'lax'`, the unconditional `httpOnly`/`path`, the
environment-qualified `secure`, the both-parameter `setAll`, the empty-value delete, and
the buffered `pendingHeaders` all match design §1 and the amended `user-identity` spec.

---

## Issues found

1. **`pnpm typecheck` is red on `main`.** 15 pre-existing errors, most of them
   `SearchFilter.astro` inline-script `any` inference. This means the project's own
   `pnpm test && pnpm typecheck` gate — which the tasks artifact names for every slice —
   cannot currently be met by any slice. Either fix the 15 as a separate work unit or
   the gate should be restated as "no NEW typecheck errors". Worth deciding before slice 2,
   because right now every slice will report the same ambiguous red.

2. **`src/middleware.test.ts:32` is one of those 15** (`Expected 0-1 type arguments, but got 2`).
   Slice 2 edits exactly that file, so the fix will land naturally there — but slice 2
   should be told, or it will read the error as its own regression.

3. **Review budget exceeded.** 445 authored changed lines against a 400 budget and a ~360
   estimate. See below.

---

## Workload / PR boundary

- **Mode**: stacked PR slice (`stacked-to-main`) — recommending `size:exception`
- **Current work unit**: slice 1, `feat/auth-session-client`
- **Boundary**: starts at `0b826d2` (`main`), ends at `e5030ee`. Delivers the session-client
  factory and the blocking dependency bump. Nothing imports the new module yet, which is
  what makes the slice autonomous and trivially revertible.
- **Commits** (work units):
  - `3ed324c` `chore(deps): move to supabase-js 2.114+ and add @supabase/ssr`
  - `e5030ee` `feat(auth): add request-scoped Supabase session client`
- **Authored review budget**: **445 lines** (`additions + deletions`), excluding the
  generated `pnpm-lock.yaml` (70 lines). Breakdown: `supabaseSession.test.ts` 279 ·
  `supabaseSession.ts` 139 · `exercises.test.ts` 15 · `supabase.ts` 9 · `package.json` 3.
- **Why it cannot shrink** (one honest slicing pass, per the chained-PR rule): the three
  parts are mutually blocking. The RED test cannot even resolve its import without the
  dependency bump; the bump with no consumer is dead weight a reviewer cannot evaluate;
  the `exercises.test.ts` citation is caused by the bump and belongs in the same diff as
  its cause. A "bump only" PR would be under budget and unreviewable, because the thing
  the reviewer must judge — does the new client set its own cookie flags? — would not be
  in it. The overage is 11%, and 63% of the diff is the TDD test file plus the house-style
  comment blocks, neither of which may be cut to reach a number.
- **Recommendation**: `size:exception` for slice 1. It was pre-flagged Medium risk in the
  forecast; the estimate was simply 85 lines low.

---

## Delivery state

**Not pushed. No pull request. Not merged.** Delivery is the owner's decision.
Branch `feat/auth-session-client` is local, at `e5030ee`, two commits ahead of `0b826d2`.
`openspec/` remains untracked and uncommitted, as instructed.

---

## Remaining tasks (slice 2 onward — NOT started)

- [ ] 2.1 RED `src/middleware.test.ts`: `needsSession(pathname)`
- [ ] 2.2 RED HARD RULE guard: `astro.config.mjs` contains neither `middlewareMode` nor `cacheOnDemandPages`
- [ ] 2.3 RED T7 `src/lib/httpCache.test.ts`: `markPrivate(headers)`
- [ ] 2.4 GREEN `Locals.user: User | null` in `src/env.d.ts`
- [ ] 2.5 GREEN `src/middleware.ts` ordering per design §1
- [ ] 2.6 GREEN `src/lib/httpCache.ts`
- [ ] 2.7 GREEN `astro.config.mjs` edge-mode prohibition comment
- [ ] 2.8 Preview-deploy spike (owner-blocking)
- [ ] 2.9 Verify `pnpm test && pnpm typecheck`

Slice 1 leaves slice 2 a note rather than a test: the `middlewareMode: 'edge'` prohibition
is documented in the `src/lib/supabaseSession.ts` header, where the module that dies under
edge serialization actually lives. Task 2.2 still owes the executable guard.

---

## Status

**7 / 7 slice-1 tasks complete** (1.1–1.7), plus baseline task 1.0.
`pnpm test` green. `pnpm typecheck` red at the pre-existing baseline, unchanged.
Ready for independent SDD verification of slice 1.
