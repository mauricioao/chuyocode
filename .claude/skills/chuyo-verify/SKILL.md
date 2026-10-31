---
name: chuyo-verify
description: "Trigger: before declaring any ChuyoCode code change done, finished, or ready for a PR. Load before running tests/typecheck/build/e2e or drafting a PR description — nothing is 'done' on this project without this checklist."
---

Owner's rule (`ChuyoCode_others/docs/COMO-TRABAJAMOS.md` §4): nothing is "hecho" until seen in a real screenshot, not just green tests, and a subagent's delivery is re-verified by the session that asked for it — never trust the report alone.

## Node PATH trap (this machine)

The default `node` on PATH is v16, so `pnpm` fails. Before any pnpm command:

```
export PATH="/c/Users/mauri/AppData/Roaming/nvm/v22.23.4:$PATH"
```

## The checks

Run all four before calling anything done: `pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e`.

- `pnpm test` — Vitest, split into 3 projects (node/jsdom/astro — see `vitest.config.ts`). Run one with `pnpm vitest run --project node` (or `jsdom`/`astro`), or a single file as usual.
- `pnpm typecheck` — `astro check`, ~2 minutes, don't skip because it's slow.
- `pnpm build` — `astro build`.
- `pnpm test:e2e` — Playwright (`playwright.config.ts`, `tests/e2e/*.spec.ts`), boots the dev server on port 4321. For a targeted run during iteration, pass a file; run the full suite before calling the change done.

Test the **observable result** (the returned `Response` — status, headers, `Set-Cookie` — the rendered DOM, the stored row), never the mocked call.

Tests under `src/pages/` must be named `_<name>.test.ts` — Astro routes every `.ts` under `src/pages/` as a page, and the `_` prefix keeps tests out of the production server (guarded by `src/pagesTestNaming.test.ts`).

## Visual changes — also required

Any UI/visual change needs real browser screenshots, not just passing tests (see `glass-desk-ui` for the reference-first loop and where tokens live):

- 1440×900 and 1230×740 desktop, a phone size (390×844 or 360×800), and inside the desk window specifically where relevant.
- Saved under `ChuyoCode_others/capturas/<tema>/` and **looked at** — not just captured.
- For a change touching several screens, a full walkthrough (see `ChuyoCode_others/docs/historico/RECORRIDO-2026-10-15.md` as an example) verifies it end to end.

## AI attribution — must print nothing

```
git log --format='%an %s%n%b' -n <N> | rg -i 'co-authored|claude|anthropic'
```

Conventional Commits only, one commit per coherent change, tests alongside the code. Never `Co-Authored-By` or any AI attribution line in a commit.

## Worktrees

- The shared main checkout (`E:\Mauricio\Freelancer\ChuyoCode`) never changes branch while another session might be using it — a `git switch` there once destroyed another session's state. Work in your own worktree under `E:\Mauricio\Freelancer\ChuyoCode-worktrees\<name>`, with its own `pnpm install` and its own `.env` copy (copied without reading it).
- An e2e run from a worktree needs its own port (not the default 4321) so it doesn't reuse another session's dev server — the convention is 4327, 4328, … per worktree.
- Kill your own dev/preview servers (and any background monitor) when you're done with them — don't leave one running or waiting.

## Delivery

- Sessions have no GitHub SSH — they never `git push` or open a PR. Draft the PR text in `ChuyoCode_others/docs/PRs/pr-<tema>.md` with `Title:`, a `## Summary`, and a `## Verification` section (see that folder's existing files for the exact shape); the owner pushes and opens the PR.
- After a big change, audit git: review branches/worktrees and tell the owner what to push, merge, or delete — this is a fixed rule, not optional (see `glass-desk-ui`'s reference-first loop for the visual half of "done").

## Upcoming tooling (branch `chore/quality-tooling`)

New scripts may land there: knip (unused code), axe accessibility checks, visual snapshots (`pnpm test:visual`), a Supabase local e2e fixture. If these scripts exist in `package.json`, run them too as part of this checklist.
