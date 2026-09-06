# ChuyoCode — Project Guide

> **Purpose of this file.** This is the onboarding/context document for any new
> session (human or AI) working on ChuyoCode. Read it first to understand the
> stack, architecture, conventions, and current state before making changes.
> Keep it updated when architecture-level decisions change.

Last updated: after the English exercises section (Supabase-backed exercise
engine, `/[lang]/ingles`) and the site-wide neutral-Spanish pass.

---

## 1. What ChuyoCode is

An image-first content discovery site (books + news) with a shademanga-style,
dark, streaming-billboard aesthetic. Content comes from Sanity; a premium "pass"
(earned by watching a rewarded ad) gates PDF downloads; downloads are counted to
power a "Más descargados" ranking.

- **Languages:** Spanish (`es`, primary) + English (`en`). Routes are always
  locale-prefixed (`/es/…`, `/en/…`). `/` 302-redirects to `/es/`.
- **Identity:** dark-only, black + amber. Official palette:
  Black `#000000`, Carbon Black `#18181B`, Shadow Grey `#27272A`,
  Platinum `#F4F4F5`, Bright Amber `#FACC15`.

---

## 2. Stack

| Layer | Tech |
|---|---|
| Framework | **Astro 5** (SSR, `output: 'server'`), React 19 islands |
| Adapter | `@astrojs/netlify` (SSR entry → Netlify Function) |
| Styling | **Tailwind CSS 4** (CSS-first `@theme`), **shadcn/ui** |
| CMS | **Sanity** (`@sanity/client`, server-only) |
| Backend | **Supabase** (pass writes + download counters, service-role) |
| Pkg manager | **pnpm** |
| Tests | **Vitest** (unit) + Playwright (e2e) |

### Commands
- `pnpm dev` — dev server (port 4321)
- `pnpm build` — production build (also the real "does it compile" check)
- `pnpm test` — vitest unit suite
- `pnpm typecheck` — `astro check`
- `pnpm sanity:deploy` — deploy the Sanity Studio (studioHost `chuyocode`)

### Environment (`.env`, all server-only)
Required: `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`. Optional-but-needed for features:
`SUPABASE_SERVICE_ROLE_KEY` (download counter + pass writes),
`AD_HMAC_SECRET` (pass cookie signing). `env.ts` merges `import.meta.env`
(build) + `process.env` (Netlify runtime) — set vars in Netlify with **all
scopes** (Functions is the critical one; the SSR runs as a Function).

---

## 3. Architecture principles ("the soul")

1. **Astro-first.** HTML is server-rendered. React islands ONLY where there is
   real interactivity (`AdModal`, `HeroCarouselIsland`). Everything else is
   static Astro.
2. **shadcn "two flavors" rule (important):**
   - **Non-interactive UI** → import the cva function (`buttonVariants`,
     `badgeVariants`) or copy shadcn token classes onto native Astro elements.
     **Zero client JS.** This is the default.
   - **Interactive UI** → mount the real shadcn React component as an island
     (`client:load`). Only for state/behavior (dialogs, carousel).
3. **Fail-safe data.** Every Sanity/Supabase read returns `[]`/`null` on error
   and never throws, so an outage degrades a section instead of 500-ing.
4. **Server-only secrets.** `@sanity/client` + Supabase clients never ship to
   the browser (`astro.config.mjs` `ssr.noExternal`, service-role only in
   server code).
5. **Image pipeline is server-only.** `buildImage` (`src/lib/image.ts`) needs
   env + `@sanity/image-url`. It must run in `.astro`; islands receive already
   resolved `{src, srcset, sizes, lqip}` as plain props.
6. **Storage follows the SHAPE of the data, not habit.**
   - **Sanity** = editorial content: rich text, mirrored `{es,en}` bodies, its own
     image pipeline, draft/publish workflow. Books and news.
   - **Supabase/Postgres** = application data: uniform rows, indexable flags,
     queryable audit columns (`updated_at`/`updated_by` via trigger), volume.
     Exercises and counters.

   This is not "two CMSs for one job" — they are two different data shapes. The
   English exercises were originally designed for Sanity and moved; the deciding
   factors were external image URLs (Sanity's asset pipeline added nothing),
   audit metadata as a queryable column, and extensibility to many exercise
   mechanics without a migration per mechanic.
7. **Decision logic lives in pure `src/lib/` modules, never in templates.**
   `.astro` files compose; they do not decide. Pure modules are unit-testable in
   the node environment with no DOM, which is the only layer of this codebase
   that can be verified cheaply and exhaustively. `sections.ts`, `exerciseGrading.ts`
   and `exerciseFacets.ts` are the pattern.

---

## 4. Theme / tokens (Tailwind 4 + shadcn)

All theming lives in **`src/styles/global.css`** (there is NO `tailwind.config`).

- `@import 'tailwindcss';` then `@import 'tw-animate-css';`
- `@custom-variant dark (&:where(.dark, .dark *));` (dark mode is class-based;
  the site ships `<html class="dark">` always).
- **`@theme { … }`** — brand tokens: `--color-base[-soft|-muted]`,
  `--color-platinum`, `--color-accent[-hover|-soft]` (amber), `--font-display`
  (Raleway), `--font-sans`, `--shadow-elevation-1/2/3`, `--transition-*-theme`.
  Renaming these breaks 20+ call sites — keep names stable.
- **shadcn token bridge** — `:root` + `.dark` define `--background`,
  `--foreground` (Platinum), `--card`, `--primary` (amber, black ink),
  `--border`, `--ring` (amber), etc. An `@theme inline { … }` re-exports them as
  utilities (`bg-primary`, `text-card-foreground`, …).
  - ⚠️ **Naming gotcha:** our brand `--color-accent` = amber. shadcn's semantic
    "accent" role was remapped to `--color-accent-role` to avoid clobbering the
    brand accent. Don't reintroduce a bare shadcn `--color-accent`.

Token cheat-sheet for restyling: `bg-base`→`bg-background`, surfaces→`bg-card`,
`border-base-muted`→`border-border`, `text-zinc-300/400`→`text-muted-foreground`,
`text-accent` (as a role) →`text-primary`, focus `ring-accent`→`ring-ring`.

---

## 5. Directory map (what matters)

```
src/
  layouts/BaseLayout.astro      # <html>/<head>, sticky-footer flex, favicon, imports global.css
  components/
    layout/{Header,Footer}.astro
    ui/                         # shadcn primitives (*.tsx) + Astro presentational components
      button.tsx badge.tsx card.tsx dialog.tsx carousel.tsx
      separator.tsx skeleton.tsx aspect-ratio.tsx   # shadcn (React)
      MediaCard.astro           # canonical image-first card (posters, catalog, rows)
      NewsCard.astro            # text card (news list)
      Spotlight.astro           # featured block (Card+Badge tokens)
      EditorialRow.astro        # standard horizontal row (shadcn lucide arrows)
      RankedRow.astro           # numbered "top 10" rail ("Más vistos")
      Spotlight.astro           # single-doc featured block (LEGACY: kept, unused)
      HeroCarousel.astro        # SERVER wrapper: buildImage → mounts hero island
      SpotlightCarousel.astro   # SERVER wrapper: buildImage → mounts spotlight island
    islands/                    # React (client:*)
      AdModal.tsx               # rewarded-ad unlock (shadcn Dialog)
      HeroCarouselIsland.tsx    # interactive hero (shadcn Carousel + Embla autoplay)
      SpotlightCarouselIsland.tsx # featured "Destacados" carousel (Carousel + Embla)
  lib/
    sanity.ts                   # all Sanity queries + types + LRU cache (60s)
    downloads.ts                # Supabase download counter + "most downloaded"
    supabase.ts pass.ts env.ts i18n.ts image.ts reveal.ts utils.ts (cn)
  pages/[lang]/                 # index (home), libros/, noticias/, legal/
  pages/api/                    # validar-anuncio (pass), descargar/[slug] (download proxy)
schemas/                        # Sanity document schemas (book, news)
supabase/migrations/            # SQL (book_downloads table + increment RPC)
```

---

## 6. Key features & how they work

### Home (`src/pages/[lang]/index.astro`) — section order
1. **HeroCarousel** — featured items (`getHeroItems`), tall billboard with
   ~40% overlap of the next row.
2. **"Libros Recomendados"** — reserved theme `recomendados` (overlaps hero).
3. **"Más vistos"** — RankedRow "top 10" chart. PRODUCT DECISION: a "view"
   equals a download/read in this product, so this rail reuses the SAME real
   download count (`getMostDownloaded`) — there is NO separate view counter. It
   is a wider, framed showcase box (thicker side padding `px-6 sm:px-10
   lg:px-16`) with oversized outlined rank numerals; self-hides with no data.
4. **Other themes** — one EditorialRow per remaining theme. Prev/next arrows are
   shadcn icon buttons (lucide chevrons inlined as SVG, zero-JS); the amber
   "next" arrow is the always-visible "there's more" affordance.
5. **Destacados** — SpotlightCarousel: rotates through ALL featured docs
   (`getSpotlights`) as wide 16/9 slides so the art never distorts. Server
   wrapper (`SpotlightCarousel.astro`) runs buildImage → mounts
   `SpotlightCarouselIsland` (shadcn Carousel + Embla) `client:visible`.

### Themes (`themes` field, Sanity)
- `themes` is a **free-text multi-select array** (tags layout). A document can
  belong to several themes and appears in one row per theme.
- Reserved slugs get curated titles via `themeTitle()` + `THEME_TITLE_OVERRIDES`
  in `sanity.ts` (`recomendados` → "Libros Recomendados"). Others are
  auto-titled (hyphens→spaces, capitalized: `frontend`→"Frontend").

### Download counter → "Más descargados"
- Download button links to **`/api/descargar/[slug]`** (proxy), NOT the CDN
  directly. The endpoint: gate pass (403 if none) → count best-effort with a
  24h per-browser dedup cookie (`chu_dl_<slug>`) → 302 to the real `pdfUrl`.
- Counting is FAIL-SAFE (Supabase down ⇒ download still works, ranking empty).
- Requires: `SUPABASE_SERVICE_ROLE_KEY` set AND
  `supabase/migrations/0001_book_downloads.sql` run in Supabase.

### Premium pass / rewarded ads
- `AdModal` island (shown on gated pages without a pass) simulates an ad, POSTs
  to `/api/validar-anuncio`, which mints an HMAC-signed `chu_pass` cookie
  (`pass.ts`). Gated pages read it server-side and reveal the download.

### English exercises (`/[lang]/ingles`) — Supabase-backed

The full data contract lives in **`docs/exercise-model.md`**; that file is the
source of truth. Summary of the load-bearing ideas:

- **One table, one payload shape, one grading function.** `exercises` in Supabase:
  columns for what you FILTER by (`level`, `focus`, `skill`, `published`, `slug`),
  `payload jsonb` for what you RENDER.
- **`focus` is the PRIMARY axis; `topic` is secondary context.** `focus` is the
  LANGUAGE POINT (`present-simple`, `second-conditional`, `phrasal-verbs`) —
  what the learner is practising. `topic` (`travel`, `food`, `code-review`) is
  only WHERE the language happens, and was never the subject of an exercise.
  Filing the section under `topic` answered "where does this happen?" while the
  question actually being asked first is "what am I practising?".
  - `topic` was KEPT, not dropped: "Present simple, in a food context" is more
    useful than "Present simple" alone, and the setting is what distinguishes
    several exercises on the same point. It is a badge now, not a filter.
  - `topic` is **NULLABLE**: a pure grammar drill has no natural setting, and a
    NOT NULL context column only makes authors invent fake ones. An absent topic
    renders **no badge**, never an empty one — an empty chip looks deliberate.
  - `FOCUSES` is a **flat list, NOT a map keyed by level.** `present-simple` is
    an A1 introduction and a B1 contrast; the level lives on the ROW.
  - The axis moved at ~5 published rows ON PURPOSE. `focus` is in the URL and in
    the uniqueness key `(level, focus, slug)`, so the cost of this change is
    proportional to the number of published deep links.
  - `0004_exercises_focus.sql` adds the column **nullable → backfill → NOT NULL**,
    never with a DEFAULT. A default survives as an authoring hazard: an INSERT
    that forgot `focus` would succeed and file the exercise under a real but
    wrong language point. Unclassifiable rows are parked unpublished under the
    sentinel `'unassigned'`, which is deliberately OUTSIDE the taxonomy so every
    guard discards it.
- **Payload = `pools` / `slots` / `answer`.** A pool is a named, reusable set of
  items; a slot is a thing to answer and carries its own `answer` inline (a
  separate key map allowed orphaned keys — a silent bug class).
- **Stable ids, never positions.** `answer: ["b"]`, never `answer: [2]`. Positional
  answers break silently the moment options are shuffled or reordered: the learner
  answers correctly and is marked wrong, with nothing thrown or logged.
- **Two orthogonal axes.** `payload.media` is the STIMULUS (audio → "listening");
  `slot.input` is the MECHANIC (`choice`/`text`/`select`, later `drop`/`order`).
  **Listening is not an exercise type** — modelling it as one would duplicate every
  mechanic inside it.
- **Dispatch is PER SLOT, not per exercise.** That is what lets a single exercise
  mix a dropdown and a text blank (the liveworksheets-style case), and what makes
  an unknown `slot.input` degrade that slot alone.
- **Adding a mechanic = one renderer file + one registry line.** No migration, no
  table change, no change to grading, no change to existing rows.
- **A slot that could not be RENDERED is never GRADED** (`comparatorForRenderable`).
  The comparator map is routinely wider than the renderer registry, because a
  comparator is cheap and a renderer is not. Grading from the comparator map alone
  would mark a learner wrong for an answer they were never offered.
- **Grading is stateless and client-side.** No accounts, no progress, no scores.
  The answer key ships to the browser and is readable in DevTools — accepted and
  documented; there is nothing to protect.
- Routes: entry `/[lang]/ingles` (CEFR chips, level in `?nivel=`, zero JS; the
  grid under a level lists LANGUAGE POINTS), listing
  `/[lang]/ingles/[level]/[focus]`, detail `…/[slug]`.
- **404 vs 200 is principled**: a segment outside the closed taxonomy can never
  exist → 404. A valid `(level, focus)` pair with nothing published EXISTS and is
  merely unstocked → 200 with an empty state. `isFocus` also rejects every old
  `topic` slug, so a link shared before the axis moved 404s loudly instead of
  quietly resolving to the wrong screen.
- **Related exercises are keyed on LEVEL** — unchanged by the axis move.
  Narrowing to the current focus would empty the block for every language point
  holding one exercise. Its `ORDER BY` did have to follow the new unique key
  (`topic` → `focus`): a nullable, non-unique column is not a total order, and
  the block would reshuffle between two SSR renders of the same URL.

---

## 7. Conventions & gotchas

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `style:`). No AI
  attribution / Co-Authored-By.
- **Git:** the human pushes manually (SSH not available to the AI here). The AI
  commits locally; you run `git push`.
- **`legacy` branch** = the pre-migration Tailwind-3 snapshot (local backup).
  `main` is the current shadcn/Tailwind-4 line.

### Language rules (three different rules — do not collapse them)

| Layer | Language |
|---|---|
| Code, identifiers, comments, commit messages | **English**, always |
| Site chrome (nav, buttons, hints, empty states) | Localized `es` / `en` |
| **Exercise taxonomy labels** (`focus`, `topic`, `skill`) | **English in EVERY locale** |
| Exercise content (prompts, options, blanks) | **English only**, never mirrored |

- **Exercise taxonomy is DATA, not chrome.** `focus`, `topic` and `skill`
  describe the content, so they read "Present simple" / "Code review" /
  "Writing" under `/es/` too. The DB always stored English slugs; a translation
  map in the render layer was the mistake. CEFR levels stay literal — only the
  surrounding word "Nivel"/"Level" is chrome.
- **`focus` is the strongest case of the three**: it names the grammar the
  learner came here to acquire, so translating it removes the one term they need
  to be able to recognize in English. The grid HEADING ("Puntos gramaticales" /
  "Language points") is chrome and localizes; the point NAMES do not.
- **Spanish is NEUTRAL and IMPERSONAL. No regional forms, ever.** No voseo
  (`Elegí`, `Revisá`, `Aprendé`), no `vos` conjugations (`buscás`, `podés`).
  Register: **infinitive for instructions** ("Revisar las respuestas"), impersonal
  prose for descriptions. Nothing addresses the user in the second person — that
  removes the tú/vos fork at the root instead of picking a side of it.
  Enforced by `src/lib/neutralSpanish.ts`, guarded over all of `UI_LABELS.es` plus
  the island `COPY` maps. English keeps second person; it carries no regional signal.

### Verification gotchas (each of these cost real debugging time)

- **Verify library DOM contracts against the RUNTIME build (`dist/*.mjs`), never
  the `.d.ts`.** A type export does not tell you what attribute is rendered. The
  shadcn generator styled a radio's checked state with `data-checked:`; Radix
  emits `data-state="checked"`. Nothing failed — the control was simply invisible,
  amber-on-amber missing and a black dot on a near-black background.
- **The shadcn CLI has generated broken code twice here.** Once `import { cn } from "cn"`
  plus a stray npm package literally named `cn`; once the `data-checked` variants
  above. **Review every generated component before committing.**
- **PowerShell `Select-String -Path` treats `[...]` as a WILDCARD.** Every route
  lives under `src/pages/[lang]/`, so a grep silently matches nothing and returns
  an empty result *indistinguishable from a clean pass*. Use `-LiteralPath`, or
  `git show HEAD:'path'`.
- **A doc comment can break the build.** A literal `'<script>'` inside frontmatter
  JSDoc made Vite's dependency scanner fail, which killed the startup pre-bundle of
  every island's transitive deps and caused mid-request re-optimization (and the
  Windows `EPERM` rename errors). `astro build` does NOT catch it — `optimizeDeps`
  scanning is a dev-server-only path. Only `astro dev` + empty stderr does.
- **Switching git branches under a running dev server leaves it stale.** Vite keeps
  its module graph in memory; new files are invisible. Restart and clear
  `node_modules/.vite`.
- **Shell Node may be v16**, too old for pnpm (needs ≥ 22.13). A working
  interpreter lives at `C:\Users\mauri\AppData\Roaming\nvm\v22.23.1\node.exe`; run
  `node_modules\vitest\vitest.mjs run` and `node_modules\astro\astro.js check`
  directly. `node_modules\@astrojs\check\dist\bin.js` does **not** exist.
- **Never start `astro dev` unbounded from tooling.** Use start → bounded readiness
  poll → request → `Stop-Process`, on a port other than 4321 so it cannot collide
  with the maintainer's own server.

### Testing

- **Tests coupled to classes break on restyles** — when changing token classes,
  update the asserting test (e.g. `bg-accent`→`bg-primary`).
- **`AstroContainer` DOES render `.astro` components.** `MediaCard.test.ts`,
  `Header.test.ts`, `EditorialRow.test.ts`, `ExerciseCard.test.ts` and others have
  always done so. The limitation is **React islands**, and even those work once the
  renderer is registered:
  `AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) })`
  — without it you get `NoMatchingRenderer`.
  ⚠️ A single `it.skip` in `libros.test.ts` was misread for ten slices as "pages
  can only be status-code tested", which cost the English section all of its markup
  coverage. **Do not repeat that generalization.** Extract presentational markup
  into an island-free `.astro` component and assert it.
- **Embla in jsdom:** stub `matchMedia`/`ResizeObserver`/`IntersectionObserver`
  in `beforeAll` (see `HeroCarouselIsland.test.tsx`). Test render output, not
  scroll physics.
- **`@testing-library/jest-dom` is NOT installed.** Use plain attribute/ARIA
  assertions (`getAttribute('aria-checked')`), not `toBeChecked()`.
- **Typecheck is RED at baseline** (~15 pre-existing errors in
  `src/pages/index.astro`, `middleware.test.ts`, `noticias.test.ts`,
  `SearchFilter.astro`, `tests/e2e/hero-carousel.spec.ts`). It is NOT a green gate.
  The bar for any change is **zero NEW errors** — always report before/after counts.
- 🔴 **Purely visual failures are invisible to vitest, typecheck AND `astro build`.**
  jsdom has no layout engine, no line breaking, no font metrics and no painting;
  its focus model is not a browser's. Contrast, wrapping, baseline alignment, focus
  rings, a native `<select>`'s intrinsic-width jump and OS-drawn dropdown popups can
  only be verified by a human in a real browser. Four bugs here already proved it.
  **A green suite is not evidence that a screen looks right.**
- **Embla in jsdom:** stub `matchMedia`/`ResizeObserver`/`IntersectionObserver`
  in `beforeAll` (see `HeroCarouselIsland.test.tsx`). Test render output, not
  scroll physics.
- **Pre-existing typecheck errors** (unrelated to recent work):
  `src/pages/index.astro` (DEFAULT_LANG unused), `middleware.test.ts`,
  `noticias.test.ts`, `tests/e2e/hero-carousel.spec.ts`. Don't attribute these
  to new changes; the e2e spec may need updating for the new hero DOM.

---

## 8. Current state

- ✅ Tailwind 3 → 4 migration (CSS-first).
- ✅ shadcn/ui fully adopted across all components (6 phases).
- ✅ Download counter + ranking, themes-as-array, layout/footer fixes.
- ✅ **Homepage CDN caching.** The homepage ran a full Netlify Function on every
  request; the in-memory LRU meant to offset that does not survive serverless cold
  starts or horizontal scaling. Now emits `CDN-Cache-Control` per route via
  `src/lib/cache.ts`. **Netlify does not cache Function responses by default** —
  caching is opt-in per route via headers, which makes default-deny the natural
  security posture. Gated routes emit `no-store`.
  ⚠️ Trade-off: published Sanity content can lag up to ~1h. The proper fix is a
  Sanity publish webhook that purges the Netlify cache — not yet built.
- ✅ **English exercises section** — live end to end. Closes the `/[lang]/ingles`
  404 the header had been linking to from every page. Supabase table, three
  mechanics (`choice`/`text`/`select`), inline blanks, retry that preserves correct
  answers, related-exercise cards, entry + listing + detail routes.
- ✅ **Neutral Spanish site-wide**, guarded by tests.
- Tests: **632 passing**, 10 skipped. Build Complete.

### English section — what remains
Full backlog in Engram (`sdd/english-exercises-section/remaining-backlog`).
- **Content is the real gap.** ~5 seed exercises exist; the target is ~50 per CEFR
  level. Everything else is polish on an empty shelf.
- **Search** (Postgres FTS + shadcn `command`) is blocked on content.
- **Topic illustrations** are blocked on the maintainer: 8 illustrations (one per
  topic, not one per exercise) from Blush/Humaaans. ⚠️ Blush mixes free and paid
  collections in one UI — verify the licence per collection. Character SVGs run
  100–300 KB; run SVGO and lazy-load.
- Mechanics not built: `drop` (needs `dnd-kit` — a new dependency, but it ships
  keyboard support a hand-rolled version would not), `order`, matching-with-lines
  (fully custom SVG), `hotspot`. All degrade correctly today.
- No `speaking` skill, deliberately: nothing can auto-grade speech.
- Only the FIRST `___` in a label splices; N blanks per slot would need an answer
  per blank, i.e. a model change.

### Open decisions surfaced but not taken
- **`home.hero.*` is dead copy** — referenced by nothing but `i18n.test.ts`; the
  redesign replaced the static hero with `getHeroItems`. Deletion candidate.
- Three `.astro` local `COPY` maps are unguarded by the neutral-Spanish detector
  (`libros/index`, `libros/[slug]`, `noticias/[...page]`). Clean today, but
  structurally unreachable by any test — the exact hole that hid `404.astro`'s
  `buscás`.
- Hardcoded Spanish outside `UI_LABELS` at `src/pages/[lang]/index.astro`
  (`'Destacado'`, `'Más vistos'`).
- Exercise cards use a border-colour focus indicator, not a ring like `MediaCard`.
  Weaker a11y; preserved deliberately during a pure refactor. One line to change.
- `/cursos` (`Header.astro:37`) is still a live 404 — the same bug class `/ingles`
  was.
- No CI guard for the Vite dependency-scan bug class. `astro dev` + assert empty
  stderr would close it.
- Sanity-authored news/book bodies were never swept for voseo; that is a Studio fix.

### Manual TODO for the maintainer
- [x] Set `SUPABASE_SERVICE_ROLE_KEY` (local `.env`) — done (uses the NEW
      `sb_secret_...` key format; works fine as the `service_role` Postgres role).
- [x] Run `supabase/migrations/0001_book_downloads.sql` in Supabase (table + RPC
      exist; rows are being written via the RPC).
- [ ] **Run `supabase/migrations/0002_book_downloads_grants.sql` in Supabase.**
      REQUIRED for the "Más vistos" ranking to READ. Root cause: `service_role`
      has BYPASSRLS but NOT table GRANTs, so the SECURITY DEFINER RPC could WRITE
      but a direct SELECT failed with `42501 permission denied for table
      book_downloads`. This grant fixes the read. GOTCHA for any future table:
      SQL-Editor-created tables need explicit `GRANT ... TO service_role`.
- [ ] `pnpm sanity:deploy` so the new `themes` field is editable in the Studio;
      reassign themes on existing docs (old `themeTag` is orphaned).
- [ ] Visual QA pass in the browser (the shadcn restyle was verified by build +
      tests; confirm the look, especially the hero carousel and AdModal).
- [ ] `tests/e2e/hero-carousel.spec.ts` may need updating for the new
      island-based hero DOM.

### Possible next steps
- Bklit charts for a future admin/stats dashboard (download analytics).
- Motion/Magic UI animations on the hero/cards if more polish is wanted.

### Ad monetization roadmap (deferred — not built yet)
The 24h-pass-after-one-ad business model is ALREADY implemented architecturally
(`pass.ts` mints a global `chu_pass` for 24h; `AdModal` + `validar-anuncio` +
`descargar/[slug]` gate + count). Only the ad itself is a 3s placeholder. Path
to real ads (Peru context):
1. **Legal prerequisites (blocking):** Privacy Policy + Cookie Policy + consent
   banner. Google rejects without these.
2. **AdSense** simple display blocks; learn payouts, validate the site.
3. **Google Ad Manager (GAM)** for the real Rewarded Ad: wire GPT's
   `rewardedSlotGranted` → `AdModal`, add SSV/postback → `validar-anuncio`
   (the existing HMAC is the correct anti-DevTools-fraud base). This is where the
   current arch plugs in cleanly.
4. **Only with traffic:** Adsterra / AdMaven Content Locker for the aggressive
   fallback (ad-per-download). Premature today (Header Bidding wants 50k–100k
   sessions/mo).
- **News blur gate:** news is currently FREE (no `getPassState`); blurring news
  behind the ad-pass is a NEW feature (reuses the existing 24h pass).
- **Payouts (Peru):** Payoneer + PayPal-Interbank; Binance P2P/USDT only at
  volume. SEO: delay the ad-wall (scroll/2nd-click, not zero-second) and mark
  gated content with JSON-LD `isAccessibleForFree: false` to avoid the intrusive
  interstitial penalty and cloaking flags.
- Research doc (over-scoped for current stage):
  `ChuyoCode_others/Redes Publicitarias Generales para Web TI.docx`.
