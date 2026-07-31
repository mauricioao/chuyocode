# ChuyoCode — Project Guide

> **Purpose of this file.** This is the onboarding/context document for any new
> session (human or AI) working on ChuyoCode. Read it first to understand the
> stack, architecture, conventions, and current state before making changes.
> Keep it updated when architecture-level decisions change.

Last updated: after the shadcn/ui + Tailwind 4 migration (all phases complete).

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
      EditorialRow.astro        # standard horizontal scroll-snap row
      RankedRow.astro           # numbered "top N" rail ("Más descargados")
      HeroCarousel.astro        # SERVER wrapper: buildImage → mounts island
    islands/                    # React (client:*)
      AdModal.tsx               # rewarded-ad unlock (shadcn Dialog)
      HeroCarouselIsland.tsx    # interactive hero (shadcn Carousel + Embla autoplay)
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
3. **"Más descargados"** — RankedRow, automatic ranking by real download count.
4. **Other themes** — one EditorialRow per remaining theme.
5. **Spotlight** — single featured doc.

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

---

## 7. Conventions & gotchas

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `style:`). No AI
  attribution / Co-Authored-By.
- **Git:** the human pushes manually (SSH not available to the AI here). The AI
  commits locally; you run `git push`.
- **`legacy` branch** = the pre-migration Tailwind-3 snapshot (local backup).
  `main` is the current shadcn/Tailwind-4 line.
- **Artifacts language:** code, UI copy, comments default to English (or neutral
  Spanish when the project already uses Spanish, e.g. "Libro"/"Noticia" tags).
- **Tests coupled to classes break on restyles** — when changing token classes,
  update the asserting test (e.g. `bg-accent`→`bg-primary`).
- **Astro Container + React islands in tests:** register the renderer, e.g.
  `AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) })`
  or you get `NoMatchingRenderer`.
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
- Tests: **282 passing** (`pnpm test`), build Complete.

### Manual TODO for the maintainer
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` (local `.env` + Netlify) — needed for the
      download ranking.
- [ ] Run `supabase/migrations/0001_book_downloads.sql` in Supabase.
- [ ] `pnpm sanity:deploy` so the new `themes` field is editable in the Studio;
      reassign themes on existing docs (old `themeTag` is orphaned).
- [ ] Visual QA pass in the browser (the shadcn restyle was verified by build +
      tests; confirm the look, especially the hero carousel and AdModal).
- [ ] `tests/e2e/hero-carousel.spec.ts` may need updating for the new
      island-based hero DOM.

### Possible next steps
- Bklit charts for a future admin/stats dashboard (download analytics).
- Motion/Magic UI animations on the hero/cards if more polish is wanted.
