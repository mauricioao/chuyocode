<div align="center">

# ChuyoCode

### A developer toolbox, in your own language

_Books, news and English practice — open to everyone, no paywalls, no subscriptions._

[![Status](https://img.shields.io/badge/status-in_development-orange)]()
[![Stack](https://img.shields.io/badge/Astro_5-SSR-FACC15)]()
[![Tests](https://img.shields.io/badge/tests-691_passing-16a34a)]()
[![Routes](https://img.shields.io/badge/routes-ES_·_EN-b45309)]()

</div>

---

## 🌎 What this is

**ChuyoCode** is a multi-purpose platform gathering the tools a developer actually reaches for, built for the people usually served last: Spanish-speaking developers, students and self-taught learners across Latin America.

> Good technical resources should not be gated behind a price tag or a language barrier.

Not another blog. Each section is a **working tool** — a catalog you can read from, a newsroom, an exercise engine that grades you. More tools follow the same rule: free, in Spanish, and actually usable.

### What is open today

| Tool | Status | What it does |
| :-- | :-- | :-- |
| 📚 **Books** | ✅ Live | Catalog with detail pages and downloadable material |
| 📝 **News** | ✅ Live | Paginated articles and long-form reading |
| 🇬🇧 **English** | ✅ Live | Interactive exercises by CEFR level and language point, graded instantly |
| 🎓 **Courses** | 🔜 Planned | Learning paths with progress tracking |

---

## ✨ The experience

- **Image-first discovery** — full-bleed rotating hero, editorial rows, a ranked rail and a spotlight block, all composed from a single `MediaCard` primitive.
- **Practice, not reading** — the English section grades in the browser: pick an answer, get told immediately, keep the ones you got right when you retry.
- **High-contrast identity** — amber (`#FACC15`) on pure black, Raleway Variable for headings.
- **Dark by design** — no toggle, no persistence, no flash: `class="dark"` ships in the HTML.
- **Bilingual routing** — `/es/` and `/en/` route trees with a full label dictionary.
- **Fast** — server-rendered HTML, CDN-cached at the edge, JavaScript only where an interaction genuinely exists.
- **Accessible** — keyboard navigation, skip-to-content, and real focus management (correcting an exercise moves the cursor to the first wrong answer).

---

## 🏗️ Architecture

A tested, server-first foundation built to grow without rewrites. **691 tests** guard the contracts below.

### Principles

- **Server-first.** Pages are assembled on the server and delivered as ready-to-paint HTML.
- **Islands, not a SPA.** React mounts only where a real interaction exists — the ad modal, the carousels, the exercise player. Everything else is static Astro.
- **Storage follows the shape of the data.** Sanity for editorial content (rich text, bilingual bodies, its own image pipeline). Postgres for application data (uniform rows, indexed filters, audit columns). They are not interchangeable.
- **Decision logic lives in pure modules**, never in templates. `.astro` files compose; they do not decide. That is what makes the logic testable without a DOM.
- **Fail-safe reads, fail-closed access.** A CMS or database outage degrades a section instead of 500-ing; access checks deny by default on any doubt.
- **Zero secrets in code.** Every key is an environment variable, validated at startup by `src/lib/env.ts`, and never imported into a client bundle.

### The exercise engine

The most structurally interesting part of the codebase. **One table, one payload shape, one grading function** — for every kind of exercise.

```jsonc
{
  "pools": { "verbs": [{ "id": "v_sits", "text": "sits" }] },
  "slots": [{
    "id": "s1",
    "label": "The cat ___ on the mat.",
    "input": "choice",          // the mechanic
    "pool": "verbs",
    "answer": ["v_sits"]        // a stable ID, never a position
  }]
}
```

Three ideas carry the whole design:

- **Two orthogonal axes.** `media` is the *stimulus* (audio ⇒ listening); `slot.input` is the *mechanic*. Listening is therefore **not an exercise type** — it is audio layered on any mechanic. Treating it as a type would duplicate every mechanic inside it.
- **Dispatch is per slot, not per exercise.** One exercise can mix a dropdown and a typed blank, and an unrecognised mechanic degrades that slot alone instead of breaking the page.
- **Stable IDs, never positions.** Options are shuffled on render. A positional answer key would mark a correct learner wrong, silently — the worst failure this kind of system can produce.

Adding a mechanic is **one renderer file plus one registry line**: no migration, no table change, no change to grading, no change to existing rows. A slot that could not be *rendered* is never *graded*.

Full contract: [`docs/exercise-model.md`](docs/exercise-model.md). Authoring guide: [`docs/exercise-authoring-brief.md`](docs/exercise-authoring-brief.md).

### Access control

Premium material is gated by a self-contained, stateless token — no session table, no extra round trip:

| Property | Implementation |
| :-- | :-- |
| Transport | `chu_pass` cookie, `base64url(payload).base64url(signature)` |
| Payload | `{ exp }` — a single UTC unix timestamp |
| Signature | HMAC-SHA256 under `AD_HMAC_SECRET`, compared with `timingSafeEqual` |
| Lifetime | 24 hours from issuance |
| Replay window | The issuing endpoint rejects timestamps outside ±5 minutes |
| Failure mode | **Fail-closed** — missing, malformed, unsigned or expired ⇒ denied |

### Tech stack

| Layer | Technology | Why |
| :-- | :-- | :-- |
| **Core** | [Astro 5](https://astro.build) (SSR, Netlify adapter) | Content-shaped framework; SSR decides what to serve before the first byte |
| **Interactivity** | [React 19](https://react.dev) islands | JS ships only where a real interaction exists |
| **Styling** | [Tailwind 4](https://tailwindcss.com) (CSS-first) + [shadcn/ui](https://ui.shadcn.com) | Design tokens in one file, zero CSS drift |
| **CMS** | [Sanity](https://sanity.io) | Editors publish books and news without touching code |
| **Database** | [Supabase](https://supabase.com) | Exercises, download counters, audit columns |
| **Caching** | Netlify CDN | Responses cached at the edge; in-process caches do not survive serverless |
| **Testing** | [Vitest](https://vitest.dev) + [Playwright](https://playwright.dev) | 691 unit tests + e2e coverage |

### Layout

```
src/
  components/
    islands/            # React — mounted only for real interaction
      ExerciseIsland    #   grades answers in the browser, stateless
      mechanics/        #   one renderer per mechanic + the registry
      AdModal, HeroCarouselIsland, SpotlightCarouselIsland
    ui/                 # shadcn primitives + presentational Astro components
    layout/             # Header, Footer
  lib/                  # server-only business logic, all unit-tested
    sanity.ts           #   CMS client + GROQ queries
    exercises.ts        #   Supabase reads, fail-safe
    exerciseGrading.ts  #   the single grading function
    exerciseTaxonomy.ts #   the closed vocabularies (levels, focuses, topics)
    pass.ts             #   access cookie: HMAC-signed, fail-closed
    cache.ts            #   CDN cache policies
    i18n.ts  env.ts  image.ts  neutralSpanish.ts
  pages/[lang]/         # libros/ · noticias/ · ingles/ · legal/
  pages/api/            # validar-anuncio · descargar/[slug]
schemas/                # Sanity models (book, news)
supabase/
  migrations/           # schema
  seeds/                # exercise content
docs/                   # exercise-model.md · exercise-authoring-brief.md
```

Unit tests live **next to the code they cover** (`pass.ts` ↔ `pass.test.ts`), not in a mirrored tree.

---

## 🚀 Getting started

**Requirements:** Node.js 20+ · pnpm 9+ via Corepack

```bash
git clone git@github.com:mauricioao/chuyocode.git
cd chuyocode
corepack enable && pnpm install
cp .env.example .env
```

| Variable | Required | Purpose |
| :-- | :-- | :-- |
| `SANITY_PROJECT_ID` · `SANITY_DATASET` | ✅ | CMS |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | ✅ | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ | Download counter, exercise reads |
| `AD_HMAC_SECRET` | ⬜ | Signs the access cookie (required for gated content) |

> Generate the secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and use **the same value** in every environment — it signs and verifies the cookies.

Missing required variables throw at startup, by design: fail loudly at boot, never silently at runtime.

### Commands

| Command | What it does |
| :-- | :-- |
| `pnpm dev` | Dev server at `http://localhost:4321` |
| `pnpm build` · `pnpm preview` | Production build / preview |
| `pnpm test` · `pnpm test:watch` | Vitest |
| `pnpm test:e2e` | Playwright |
| `pnpm typecheck` | `astro check` |
| `pnpm sanity:start` · `pnpm sanity:deploy` | Sanity Studio |

### Content

- **Books and news** → Sanity Studio. Create, fill the Spanish and English fields, publish.
- **Exercises** → SQL. Run the migrations in `supabase/migrations/`, then the seeds in `supabase/seeds/`. To write new ones, follow [`docs/exercise-authoring-brief.md`](docs/exercise-authoring-brief.md) — it is self-contained.

---

## 🔐 Security

- `.env` is never committed; `.env.example` is the template.
- `SUPABASE_SERVICE_ROLE_KEY` and `AD_HMAC_SECRET` are server-only and never reach the browser.
- The service-role client is created lazily, so a missing key fails only when privileged access is actually attempted.
- Signature comparison uses `timingSafeEqual` — no early-exit leaks.
- CDN caching is **opt-in per route**: Netlify does not cache function responses by default, and gated routes explicitly emit `no-store`.

---

## 🗺️ Roadmap

- [x] Base platform: books, news, bilingual routing, access control
- [x] Image-first discovery home
- [x] English section: exercise engine, three mechanics, CEFR levels and language points
- [ ] Grow the exercise catalog beyond A1–A2
- [ ] Search across exercises (Postgres full-text)
- [ ] More mechanics: drag-and-drop, matching, listening with audio
- [ ] **Courses** — learning paths with progress tracking
- [ ] Visible language switcher for the existing `/en/` routes
- [ ] Advanced SEO: sitemap, structured data, dynamic OG images

---

<div align="center">

**ChuyoCode** — Technology learned in your own language.

_Built in Latin America, for Latin America._

</div>
