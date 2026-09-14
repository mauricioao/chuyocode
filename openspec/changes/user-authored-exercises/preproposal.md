# Pre-proposal state — user-authored-exercises

**Artifact**: `gentle-ai.sdd-preproposal/v1`
**Revision**: 3 (supersedes revisions 1 and 2)
**Change**: `user-authored-exercises`

## State

| Field | Value |
|---|---|
| Exploration outcome | `done` |
| Exploration reference | `openspec/changes/user-authored-exercises/exploration.md` |
| Research selected | yes |
| Research request | 4 lanes / 21 questions — A: Supabase Auth session for Astro SSR (blocking), B: transactional email provider, C: `@dnd-kit/sortable`, D: Postgres generated columns on Supabase |
| Requested source classes | `documentation`, `open-web` |
| Admission | **partial** — `documentation = [context7]` admitted (declared tools present at runtime); `open-web = [webfetch]` denied (declared tool `mcp_Webfetch` absent from runtime) |
| Observed exact grants | `documentation = [context7]` |
| Research outcome | `partial` |
| Evidence reference — OpenSpec | `openspec/changes/user-authored-exercises/research.md` (revision 3, outcome `partial`, 34 sources, claims mapped) |
| Evidence reference — Engram | `sdd/user-authored-exercises/research` (project `chuyocode`, revision 3, outcome `partial`) |
| Artifact store mode | `hybrid` |
| Store parity | verified — both stores hold revision 3 with identical bytes |
| Product decisions | `pending` |
| `proposal_ready` | **false** |

## Persistence note — why revision 3

Revision 2 was written to both stores, but the Engram write truncated the artifact from 57,765 to 50,000 characters, leaving OpenSpec and Engram **divergent**. Hybrid mode requires identical bytes, and a divergent store denies readiness on its own.

Per the hybrid persistence contract, recovery did **not** derive content from either surviving store. The artifact was rebuilt from retained canonical intent, sized to persist within the Engram limit, and written as a new positive revision to both stores, then read back and compared.

**Operational lesson for future SDD phases**: Engram observations are capped at 50,000 characters and truncate silently apart from a warning in the tool result. Hybrid-mode artifacts must be sized under that cap, or the two stores will diverge without the file write ever failing.

## What changed from revision 1

Revision 1 recorded a full admission denial (`documentation=[]`, `open-web=[]`) and emitted zero claims. The orchestrator supplied a corrected capability envelope on re-entry. Per-class runtime verification then admitted `documentation` and denied `open-web`, because the tool named by the `open-web` grant does not exist in this runtime. A declared-but-unsupported class confers no capability, and no substitute was used.

Result: 4 lanes moved from *entirely unanswered* to *two answered, one partial, one still blocked*.

| Lane | Revision 1 | Revision 3 |
|---|---|---|
| A — Supabase Auth for Astro SSR (blocking) | unanswered | **answered** |
| B — transactional email | unanswered | still blocked (needs `open-web` or an owner decision) |
| C — `@dnd-kit/sortable` | unanswered | partial |
| D — Postgres generated columns | unanswered | **substantially answered** |

## Why not ready

Selected research is `partial`, and the readiness matrix denies readiness for any `partial` outcome regardless of store or decision state. Product decisions also remain `pending`.

`sdd-propose` MUST NOT be invoked from this state.

## What is no longer blocking

The blocking lane is resolved. Design can proceed on auth and on the generated-column migration once readiness is satisfied:

- **Auth approach confirmed** — `@supabase/ssr` + `createServerClient` wired to `AstroCookies`, backed by a first-party Supabase quickstart for Astro.
- **`getUser()` (never `getSession()`)** for all server-side authorization.
- **Magic link confirmed viable** for SSR via `token_hash` + `verifyOtp` on a server confirm route.
- **The "anon key gets nothing" posture survives authentication unchanged** — RLS enabled with zero policies denies authenticated JWTs exactly as it denies anonymous ones. No RLS policies need to be written for this feature.
- **Generated-column migration procedure specified**, with three named hazards (explicit `STORED` keyword, `status` backfill ordering, and an unaudited set of write sites to `published`).

## Recovery path

Two viable routes. This is an orchestrator/owner choice, not a research decision.

**Route 1 — re-run research with working `open-web`**
1. Supply `gentle-ai.sdd-research-capability/v1` with an `open-web` grant whose declared tool actually exists in the target runtime.
2. Re-run `sdd-research`, scoped to Lane B and remaining unknowns 2, 3, 6, 7, 11 from `research.md`. Lanes A and D do not need re-running.
3. On `done`, advance this state to revision 4.

**Route 2 — re-scope and accept the partial result (recommended)**
1. Owner selects the email provider directly. Lane B is substantially a product decision (which vendor to pay), not a technical unknown — selection criterion from research: prefer a provider offering **both** an HTTP API and SMTP credentials, so one verified domain serves both moderation email and Supabase Auth email.
2. Owner resolves the four in-repo/one-command unknowns (#5, #8, #9, #10 in `research.md`) — none require external research.
3. Orchestrator runs product discovery to move decisions from `pending` to `confirmed`.
4. Research is re-entered only to record the narrowed outcome as `done`, or the orchestrator explicitly accepts the documented gaps.

Route 2 is likely the better use of time: Lane A was the blocking lane, and Lane A is answered.

## Owner prerequisites with external lead time

These gate implementation and should start immediately, independent of which route is taken. Full detail in `research.md` → *Owner prerequisites*.

- Supabase dashboard: redirect URL allow-list, Site URL, magic-link email template check.
- Email provider selection → account → **domain verification → SPF/DKIM/DMARC DNS records** (hours to 48h propagation; the classic late-discovered blocker).
- Custom SMTP configuration in Supabase Auth, and **disabling link tracking** on the sending domain (link tracking deforms magic links and breaks sign-in).

Retained intent for re-entry lives in `research.md` / `sdd/user-authored-exercises/research`. In hybrid mode, do not reconstruct the request from either store alone; compare revision and bytes across both first.
