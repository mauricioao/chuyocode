# ChuyoCode — Project Guide

> **Purpose of this file.** Onboarding/context document for any new session
> (human or AI) working on ChuyoCode. Read it first to understand the stack,
> architecture, conventions, and current state before making changes. Keep it
> updated when architecture-level decisions change.

---

## 1. What ChuyoCode is

Two products share one codebase:

1. **Books + news** (`/[lang]/libros`, `/[lang]/noticias`) — editorial content
   from Sanity, public, no account needed. A rewarded-ad "pass" (`pass.ts`,
   `AdModal`, `/api/validar-anuncio`) unlocks downloads for 24h; downloads are
   counted (`downloads.ts`) to power a "Más descargados" ranking.
2. **Inglés** — a Wordwall-style English-practice platform: CEFR-leveled
   curated exercises, plus a community layer where signed-in users author,
   publish and play **activities** (worksheets and game templates) from a
   desktop-style UI (the "escritorio"). Signed-in access is required for
   Inglés and Cursos; Premium unlocks paid features (`user_subscriptions`,
   Paddle as merchant of record).

- **Languages:** Spanish (`es`, primary) + English (`en`). Routes are always
  locale-prefixed (`/es/…`, `/en/…`). `/` 302-redirects to `/es/`.
- **Identity:** Sanity content and the brand shell (home, libros, noticias)
  keep the frozen dark/amber identity. Inglés has its own lighter identity: a
  "glass desk with ink" UI kit (white/grey surfaces, glass windows and
  widgets, a desktop metaphor, B&W ink-drawn characters). Full direction:
  `ChuyoCode_others/docs/DIRECCION-VISUAL.md` (owner's private doc). Applying
  it: the `glass-desk-ui` project skill (`.claude/skills/glass-desk-ui`,
  landing on branch `chore/claude-setup`).

---

## 2. Stack (verified against `package.json`)

| Layer | Tech |
|---|---|
| Framework | **Astro 7** (`^7.3.5`, SSR `output: 'server'`), **React 19** islands (`@astrojs/react` 7) |
| Adapter | `@astrojs/netlify` (SSR entry → Netlify Function) |
| Styling | **Tailwind CSS 4** (CSS-first `@theme`, no `tailwind.config`), shadcn/ui + radix-ui + lucide/phosphor icons |
| CMS | **Sanity** (`@sanity/client`), schemas in `schemas/` — books and news only |
| Backend | **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) — auth, exercises, activities, courses, billing |
| Drag & drop | `@dnd-kit/core` / `@dnd-kit/sortable` |
| Billing | Paddle (merchant of record), wired through `src/lib/billing/` |
| Bot protection | Cloudflare Turnstile (`src/lib/turnstile.ts`, `TurnstileWidget`) |
| Error tracking | Sentry (`@sentry/astro`, `sentry.server.config.ts` / `sentry.client.config.ts`) |
| Pkg manager | **pnpm** `9.15.9`, Node `>=22.12.0` (`package.json engines`) |
| Tests | **Vitest 5** (unit, 3 projects: node/jsdom/astro) + **Playwright** (e2e) |

### Commands
- `pnpm dev` — dev server (port 4321)
- `pnpm build` — production build
- `pnpm test` — Vitest unit suite (`pnpm vitest run --project node|jsdom|astro` for one project)
- `pnpm test:e2e` — Playwright
- `pnpm typecheck` — `astro check`
- `pnpm sanity:deploy` / `pnpm sanity:start` — Sanity Studio

### Environment (`.env`, server-only)
Required: `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`. Needed for specific features: `SUPABASE_SERVICE_ROLE_KEY`
(every service-role read/write — exercises, activities, roles, downloads),
`AD_HMAC_SECRET` (book/news pass cookie), Turnstile site/secret keys, Paddle
keys, Sentry DSN. `env.ts` merges `import.meta.env` (build) with `process.env`
(Netlify runtime) — set vars in Netlify with **all scopes** (the SSR runs as a
Function).

---

## 3. Architecture principles ("the soul")

1. **Astro-first.** HTML is server-rendered. React islands only where there is
   real interactivity. Everything else is static Astro.
2. **shadcn "two flavors" rule:**
   - **Non-interactive UI** → cva token classes on native Astro elements, zero
     client JS. Default.
   - **Interactive UI** → a real shadcn React component as an island
     (`client:load`/`client:visible`), only for state/behavior.
3. **Two failure postures, by design, never confused:**
   - **Read paths fail OPEN.** Content reads (Sanity, exercises, likes) and
     identity resolution (`src/middleware.ts`) return `[]`/`null` on any
     error rather than throwing — a degraded section or an anonymous visitor,
     never a 500.
   - **Authorization fails CLOSED.** `src/lib/roles.ts` returns `[]` (deny) on
     any error, unconfigured key, or thrown client. An outage must never
     silently grant access; it may only ever degrade to "signed out" or
     "no roles," both of which deny by default. Every mutating endpoint
     verifies on the server — hiding a button is UX, not a security boundary.
4. **RLS enabled, zero policies, service-role only.** Every table in
   `supabase/migrations/` follows this: the anon key reads/writes nothing;
   only server code with the service-role key touches data. `BYPASSRLS` does
   **not** imply table `GRANT`s — a SQL-Editor-created table needs them
   explicitly or reads fail with `42501` while writes (via a `SECURITY
   DEFINER` RPC) still succeed, which is a read path that fails open through
   the back door. Grant explicitly, every time.
5. **Server-only secrets.** Sanity and Supabase clients never ship to the
   browser; the service-role client is created lazily, server-side only.
6. **Storage follows the SHAPE of the data, not habit.** Sanity = editorial
   content a human writes and publishes (rich text, draft/publish, its own
   image pipeline). Supabase/Postgres = application data: uniform rows,
   indexable/queryable columns, volume (exercises, activities, roles,
   subscriptions, counters).
7. **Decision logic lives in pure `src/lib/` modules, never in templates.**
   `.astro`/`.tsx` files compose; they do not decide. Pure modules are
   unit-testable with no DOM — the cheapest, most exhaustive layer of this
   codebase to verify. `exerciseGrading.ts`, `gameModes.ts`, `roles.ts` are
   the pattern.
8. **One purpose per creation surface.** A given activity template plays one
   game; `TEMPLATE_GAME_SWITCHING_ENABLED = false` in
   `src/lib/activities/gameModes.ts` keeps "Varios juegos" templates from
   mixing modes. The older curated-exercise engine's "Básico" blocks still
   derive every alternate game mode from one set of questions.

---

## 4. Directory map (what matters)

```
src/
  middleware.ts                 # locale routing + session/identity resolution + security headers (runs on every request)
  layouts/BaseLayout.astro      # <html>/<head>, global.css import
  components/
    layout/{Header,Footer}.astro
    legal/                      # Terms, Privacy, Refunds content
    ui/                         # shadcn primitives (*.tsx) + Astro presentational components
    islands/                    # React (client:*): auth forms, Turnstile widget, carousels, AdModal
      activities/               # ActivityEditorIsland, PresentationIsland, QuizLivePreview, …
      mechanics/                # one renderer per exercise mechanic + registry (ChoiceRenderer, DropRenderer, …)
    activities/                 # Astro: CommunityFiltersPanel, …
    courses/                    # Astro: CourseCtaButtons, …
    ingles/                     # Astro: DeskHost, DeskScene, DeskWindowManager, DeskChrome, DeskHelper, desk widgets
  lib/                          # domain logic; every module has a sibling *.test.ts
    activities/                 # worksheets/templates: blocks, grading, moderation, presentation, autosave, paste-import, game feel/sounds
    aventura/                   # RPG-style prototype mode
    billing/                    # paddle.ts, apply.ts, events.ts
    courses/                    # catalog, access, admin
    ingles/                     # desk scene data, status toasts
    placement/                  # placement-test logic
    speech/ text/ ui/ http/ build/
    roles.ts                    # moderator role check (fail-closed)
    access.ts                   # gated sections (ingles/cursos/perfil), guest carve-outs
    exercise*.ts                # curated-exercise engine: taxonomy, grading, validator, payload
    securityHeaders.ts          # CSP (report-only), other security headers, applied on every response exit
    sanity.ts supabase.ts supabaseSession.ts pass.ts env.ts i18n.ts image.ts cache.ts
  pages/
    [lang]/                     # es | en, prefixDefaultLocale: true
      index.astro libros/ noticias/ legal/
      ingles/[level]/ ingles/actividades/[id]/{presentar,imprimir}.astro  # presentation + print modes
      ingles/nivel/ ingles/propuestos/ ingles/aventura/
      crear/ mis-actividades/ cursos/ premium.astro perfil.astro
      admin/{ejercicios,actividades,cursos}/   # moderator-only (requireRole)
      auth/
    api/
      auth/                     # signin, password, google, confirm, signout, consentimiento, nueva-clave
      actividades/ admin/ cursos/ cuenta/ ejercicios/ reacciones/ me-gusta/
      descargar/ validar-anuncio.ts anuncio/ webhooks/   # [provider] webhook (Paddle)
      me.ts csp-report.ts clima.ts
schemas/                        # Sanity document schemas (book, news)
supabase/migrations/            # SQL, 0001..0021, sequential, additive
docs/                           # exercise-model.md (data-model source of truth), authoring briefs
tests/e2e/                      # Playwright
openspec/                       # historical SDD artifacts; not the current workflow
```

---

## 5. Key features & how they work

### Auth & roles
Supabase Auth via `@supabase/ssr`: magic link, password, and Google OAuth
(`src/pages/api/auth/{signin,password,google}.ts`). Sessions are server-side
cookies; `src/middleware.ts` resolves `locals.user` on every request via
`getUser()` (never `getSession()` for an authorization decision). There is no
custom "admin" role in code — the only DB-checked role is **`moderator`**
(`supabase/migrations/0008_user_roles.sql`, enforced by a `check` constraint
and by `src/lib/roles.ts`'s closed `ROLES` list). Moderator gates the
`/[lang]/admin/**` surfaces (exercise/activity/course moderation) and returns
a plain 404 to non-moderators, never a 403, so the surface's existence is
never confirmed to an unauthorized visitor. Every other signed-in visitor is
just "a user" — there is no separate stored "user" role to assign.

### Access gating
`src/lib/access.ts` gates `ingles`, `cursos` and `perfil` behind sign-in, with
two guest carve-outs: the community catalog (`/[lang]/ingles/actividades`,
no id) and a published activity's practice/presentation pages, so a
WhatsApp/QR link works without an account. The desk hub itself
(`/[lang]/ingles`) stays account-only; an anonymous visitor there is sent to
the catalog instead of the login wall.

### Curated exercises (`exercises` table)
CEFR-leveled, closed-taxonomy drills (`src/lib/exerciseTaxonomy.ts`,
`exerciseFacets.ts`). Payload = `media` (stimulus) / `pools` (option sets) /
`slots` (answered items, each carrying its own answer by stable id, never
position). Mechanics are dispatched **per slot** via a renderer registry
(`src/components/islands/mechanics/registry.tsx`); an unrenderable slot
degrades alone and is never graded. Grading is stateless and client-side — no
accounts, no stored progress for this engine. Full model:
**`docs/exercise-model.md`** (source of truth for the payload contract; keep
this guide in sync with it, not the other way around).

### Community activities & templates
Signed-in users author **activities**: documents made of blocks — worksheet
pages (PDF/image, with drawn answer boxes) and quiz blocks. A quiz block has
a `QuizTemplate`: `'match' | 'reorder' | 'cloze' | 'groupsort'`
(`src/lib/activities/blocks.ts`), rendered under the umbrella name "Varios
juegos." The older "Básico" block instead derives several alternate games
(flashcards, matching, wheel, anagram, hangman, true/false, "Caja sorpresa")
from one set of questions — `src/lib/activities/gameModes.ts`. Each save is a
revision; the public only ever sees the moderator-approved one
(`src/lib/activities/moderation.ts`), so editing a live activity never hides
it mid-review. Reactions, autosave, undo/redo, paste-import (lines, match
pairs, group-sort), and per-sheet audio markers are all pure modules under
`src/lib/activities/`.

### The desk ("escritorio")
`DeskHost.astro` composes `DeskScene`, `DeskHelper`, `DeskWindowManager`, and
`DeskChrome`. Each open item is a draggable floating window; state lives in
`src/lib/deskWindowsState.ts` (pure) and `src/lib/ui/deskWindowManager.ts`
(DOM side). Minimized windows become independent tray blocks
(`MinimizedWindowsTray.astro`); desk widgets (calendar, clock, weather,
player) are their own Astro components. Guests get a full-screen window, no
desk.

### Presentation mode
`/[lang]/ingles/actividades/[id]/presentar.astro` drives classroom play from
`PresentationIsland.tsx`, including a "live quiz rhythm" (timer, per-tile
✓/✕, auto-advance, score — `presentationQuiz.ts`, `presentationReducer.ts`,
`presentationSlides.ts`). `imprimir.astro` is the print view, with an optional
answer key. Both practice and presentation pages are reachable by guests for
a published activity (see Access gating above).

### Premium / billing
`user_subscriptions` (migration `0019_billing_foundation.sql`) tracks paid
access; `src/lib/billing/{paddle,apply,events}.ts` and
`src/pages/api/webhooks/[provider].ts` wire Paddle as the merchant of record
(chosen over a Peru-based biller to avoid a RUC requirement). `premium.astro`
is the pricing/upsell page.

### Security & operational wiring
- **CSP is report-only today** (`src/lib/securityHeaders.ts`,
  `/api/csp-report.ts` receives reports) — not yet enforced.
- **Turnstile** guards the password/sign-in forms (`turnstile.ts`,
  `TurnstileWidget.tsx`); Supabase's own captcha is prepared but intentionally
  **not** activated until Turnstile is confirmed stable in production.
- **Sentry** is wired (`sentry.server.config.ts`, `sentry.client.config.ts`,
  `sentryScrub.ts` scrubs before send) via `@sentry/astro` in
  `astro.config.mjs`.
- Books/news keep the original 24h rewarded-ad pass (`pass.ts`, `AdModal`,
  `/api/validar-anuncio`) — unrelated to Inglés's sign-in-gated model.

---

## 6. Conventions & gotchas

- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`,
  `docs:`, …), one per coherent change, tests alongside. No AI attribution /
  Co-Authored-By, ever.
- **Work directly.** A fix is: a failing test that reproduces it, the fix,
  one commit. New features start with a short plan agreed in chat; no SDD
  phases or progress documents unless asked. `openspec/` is historical.
- **One worktree per parallel task**, under
  `ChuyoCode-worktrees/<name>`, never a branch switch in a shared checkout —
  that has destroyed another session's in-progress state before.
- **No prerendered routes.** `src/middleware.ts` imports modules that call
  `loadEnv()` at import time; any `prerender = true` page makes `astro build`
  load secrets and fail with `MissingEnvError`. Cache SSR responses with
  headers instead. Guarded by `src/pagesNoPrerender.test.ts`.
- **No literal `<script>` tags in `.astro` frontmatter or comments.** Breaks
  Vite's dev dependency scan ("Failed to fetch dynamically imported module").
  `astro build` does not catch this — only `astro dev` with empty stderr
  does. Guarded by `src/astroScriptTags.test.ts`.
- **Tests under `src/pages/` are named `_<name>.test.ts`.** Astro routes every
  `.ts` under `src/pages/`; the `_` prefix keeps tests out of the production
  server. Guarded by `src/pagesTestNaming.test.ts`.
- **A role check and an identity check fail in opposite directions on
  purpose** (see Architecture principles §3). Don't "fix" one to match the
  other.
- **PowerShell's `Select-String -Path` treats `[...]` as a wildcard** — every
  route lives under `src/pages/[lang]/`, so a naive search can silently match
  nothing. Use `-LiteralPath`, `rg`, or `git show HEAD:'path'`.
- **A green test suite is not evidence a screen looks right.** jsdom has no
  layout engine — contrast, wrapping, focus rings and native control sizing
  need a real browser.

---

## 7. Testing

- `pnpm test` — Vitest, split into **node / jsdom / astro** projects
  (`vitest.config.ts`). Run one with `pnpm vitest run --project node` (or
  `jsdom` / `astro`), or target a single file as usual.
- `pnpm test:e2e` — Playwright.
- `pnpm typecheck` — `astro check`.
- Test the observable result (the returned `Response` — status, headers,
  `Set-Cookie` — the rendered DOM, the stored row), not the mocked call.
- Pure logic lives in `src/lib/*.test.ts` beside its module; this is the
  cheapest layer to verify exhaustively and where most grading/validation/
  state-machine correctness should be proven.

---

## 8. Current state

`main` is the active line; see recent commits and open PRs for exactly what
has shipped. The launch plan, business decisions, and day-to-day pending-work
tracking are kept in the owner's private docs (`ChuyoCode_others/docs`), not
in this repository. `docs/exercise-model.md` remains the data-model source of
truth for the curated-exercise payload — update it, not this guide, when that
contract changes.
