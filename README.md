<div align="center">

# ChuyoCode

### Free tech knowledge, in your own language

_Books and articles about technology, open to everyone — no paywalls, no subscriptions._

[![Status](https://img.shields.io/badge/status-in_development-orange)]()
[![Stack](https://img.shields.io/badge/Astro_5-SSR-FACC15)]()
[![Tests](https://img.shields.io/badge/tests-249_passing-16a34a)]()
[![Content](https://img.shields.io/badge/routes-ES_·_EN-b45309)]()

</div>

---

## 🌎 Purpose

**ChuyoCode** exists to put quality technical information in front of people who are usually served last: Spanish-speaking developers, students, and tech-curious readers across Latin America.

The premise is simple:

> Good technical content should not be gated behind a price tag or a language barrier.

- **Free by default.** Books and articles are published to be read, not to be sold.
- **Spanish first.** Content is written and edited in Spanish, with English routes available in the platform.
- **Made to be read.** An image-first, streaming-style catalog instead of another wall of gray text.

### Who is it for?

Developers, students, and self-taught learners who want solid material in their own language — with a reading experience that respects their time and their eyes.

### Content lines

| Line | Status | Description |
| :-- | :-- | :-- |
| 📚 **Books** | ✅ Live | Catalog with detail pages and downloadable material |
| 📝 **Articles** | ✅ Live | Paginated news and long-form reading |
| 🎓 **Courses** | 🔜 Planned | Nav entry exists, section not built yet |
| 🇬🇧 **English App** | 🔮 Roadmap | Nav entry exists, section not built yet |

---

## ✨ The Experience

- **Image-first discovery** — a full-bleed auto-rotating hero, editorial rows, a ranked rail, and a spotlight block, all built from a single `MediaCard` primitive.
- **High-contrast identity** — yellow accent (`#FACC15`) over pure black (`#000000`), Raleway Variable for display headings, system sans for body text.
- **Dark by design** — the site is dark-only. No toggle, no persistence, no flash: `class="dark"` ships in the HTML.
- **Bilingual routing** — `/es/` and `/en/` route trees with a full label dictionary; the visible chrome is Spanish-only today.
- **Blazing fast** — server-side rendering, real HTML, JavaScript only where it is unavoidable.
- **Accessible** — keyboard navigation, skip-to-content, and `prefers-reduced-motion` support in every animation.

---

## 🏗️ Architecture

ChuyoCode is not a prototype: it's a **tested, server-first foundation** built to grow without rewrites. 249 tests across 23 files guard the contracts described below.

### Design principles

- **Server-first.** Pages are assembled on the server and delivered as ready-to-paint HTML. Maximum speed, maximum SEO.
- **Islands, not a SPA.** React is loaded in exactly **one** component (`AdModal`). Everything else is static Astro output plus a couple of dependency-free inline scripts.
- **Fail-safe reads, fail-closed access.** CMS failures log and return empty collections so the page still renders; access checks deny by default on any doubt.
- **Zero secrets in code.** Every key lives in environment variables and is validated at startup by `src/lib/env.ts`.
- **Server-only boundaries.** Sanity, Supabase, and signing secrets are never imported into client bundles.

### Request flow

```
                     ┌────────────────────────────────────────┐
   Request           │           Astro (Server / SSR)          │
   /es/libros/slug   │                                        │
        ─────────►   │  1. middleware.ts → validate locale     │
                     │  2. lib/sanity.ts → GROQ + LRU cache ──►│──► Sanity (Headless CMS)
                     │  3. lib/image.ts  → srcset + LQIP       │
                     │  4. lib/pass.ts   → verify access cookie │
                     │                                        │
                     │  5. Render decision:                    │
                     │     ✅ valid pass  → full content       │
                     │     ❌ no pass     → access island      │──► React (AdModal)
                     └────────────────────────────────────────┘
                                       │
                              POST /api/validar-anuncio
                                       │
                     ┌────────────────────────────────────────┐
                     │  Validates a ±5 min timestamp window    │
                     │  Mints an HMAC-SHA256 signed cookie     │
                     │  Grants 24h of access, then expires     │
                     └────────────────────────────────────────┘
```

### Access control

Premium material is gated by a self-contained, stateless token — no session table, no extra round trip:

| Property | Implementation |
| :-- | :-- |
| Transport | `chu_pass` cookie, `base64url(payload).base64url(signature)` |
| Payload | `{ exp }` — a single UTC unix timestamp |
| Signature | HMAC-SHA256 under `AD_HMAC_SECRET`, compared with `timingSafeEqual` |
| Lifetime | 24 hours from issuance |
| Replay window | The issuing endpoint rejects timestamps outside ±5 minutes |
| Failure mode | **Fail-closed** — missing, malformed, unsigned, or expired ⇒ access denied |

The secret never leaves the server. Verification is pure computation, so it costs nothing at request time.

### Tech stack

Every choice answers a goal, not a trend:

| Layer | Technology | Why |
| :-- | :-- | :-- |
| **Core** | [Astro 5](https://astro.build) (SSR + Node adapter) | Content-shaped framework; SSR lets us decide what to serve before the first byte |
| **Interactivity** | [React 19](https://react.dev) (one island) | JS ships only where a real interaction exists |
| **CMS** | [Sanity](https://sanity.io) + `@sanity/image-url` | Editors publish without touching code; responsive images and LQIP for free |
| **Data** | [Supabase](https://supabase.com) | Postgres ready for future accounts, analytics, and progress tracking |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com) | Design tokens in one file, zero CSS drift |
| **Typography** | [Raleway Variable](https://fonts.google.com/specimen/Raleway) (self-hosted) | Sharp editorial headings, no Google Fonts CDN request |
| **Testing** | [Vitest](https://vitest.dev) + [Playwright](https://playwright.dev) | 249 unit tests + e2e coverage of the hero carousel |

### Project structure

```
chuyocode/
├── public/                       # Static assets (logo.svg pending)
├── schemas/                      # Sanity content models
│   ├── book.ts
│   ├── news.ts
│   └── index.ts
├── scripts/
│   └── seed-discovery.mjs        # Seeds demo content into the dataset
├── src/
│   ├── components/
│   │   ├── islands/
│   │   │   └── AdModal.tsx       # The ONLY React island
│   │   ├── layout/               # Header, Footer
│   │   └── ui/
│   │       ├── HeroCarousel.astro    # Full-bleed auto-rotating billboard
│   │       ├── EditorialRow.astro    # Scroll-snap row with arrows + edge fades
│   │       ├── RankedRow.astro       # Numbered "top N" rail
│   │       ├── Spotlight.astro       # Single featured item, editorial layout
│   │       ├── MediaCard.astro       # Poster card — primitive of every row
│   │       ├── BookCard.astro        # Catalog card (libros)
│   │       ├── NewsCard.astro        # Article card (noticias)
│   │       ├── Button.astro
│   │       ├── ContentRow.astro      # legacy, superseded by EditorialRow
│   │       └── AndeanPattern.astro   # legacy, no longer mounted
│   ├── layouts/
│   │   └── BaseLayout.astro      # Global shell: SEO, dark class, skip-link
│   ├── lib/                      # Business logic (server-only)
│   │   ├── sanity.ts             #   CMS client + 60s LRU cache + GROQ queries
│   │   ├── image.ts              #   Responsive srcset + LQIP blur-up
│   │   ├── supabase.ts           #   Anon + lazy service-role clients
│   │   ├── pass.ts               #   Access cookie: HMAC-signed, fail-closed
│   │   ├── i18n.ts               #   Locales, resolution, and UI label dictionary
│   │   ├── env.ts                #   Env validation at startup
│   │   └── reveal.ts             #   Scroll reveals (IntersectionObserver)
│   ├── middleware.ts             # Locale validation + redirects
│   ├── pages/
│   │   ├── index.astro           # 302 → /es/
│   │   ├── 404.astro
│   │   ├── [lang]/
│   │   │   ├── index.astro       # Discovery home
│   │   │   ├── libros/           # Catalog + gated detail page
│   │   │   ├── noticias/         # Paginated list + article page
│   │   │   └── legal/            # Terms and privacy
│   │   └── api/
│   │       └── validar-anuncio.ts    # Issues the 24h access cookie
│   └── styles/                   # fonts.css + global.css
├── tests/
│   └── e2e/hero-carousel.spec.ts
├── astro.config.mjs
├── tailwind.config.cjs           # Yellow/black tokens + elevation scale
├── vitest.config.ts
├── playwright.config.ts
└── sanity.config.ts              # Studio configuration
```

Unit tests live **next to the code they cover** (`pass.ts` ↔ `pass.test.ts`), not in a mirrored tree.

---

## 🚀 Getting Started

### Requirements

- **Node.js 20+** (`engines.node: ">=20"`; developed on v22 LTS)
- **pnpm 9+** via Corepack (`packageManager: pnpm@9.15.9`)

### Installation

```bash
# 1. Clone
git clone git@github.com:mauricioao/chuyocode.git
cd chuyocode

# 2. Dependencies
corepack enable
pnpm install

# 3. Environment variables
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | Purpose |
| :-- | :-- | :-- |
| `SANITY_PROJECT_ID` | ✅ | CMS project |
| `SANITY_DATASET` | ✅ | CMS dataset |
| `SUPABASE_URL` | ✅ | Database endpoint |
| `SUPABASE_ANON_KEY` | ✅ | Public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ | Server-only privileged client |
| `AD_HMAC_SECRET` | ⬜ | Signs the access cookie (required for gated content) |

> **Generate `AD_HMAC_SECRET`:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Use **the same value** across every environment: it signs and verifies the access cookies.

Missing required variables throw a `MissingEnvError` at startup — by design. Fail loudly at boot, never silently at runtime.

### Commands

| Command | What it does |
| :-- | :-- |
| `pnpm dev` | Dev server at `http://localhost:4321` |
| `pnpm build` | Production build |
| `pnpm preview` | Preview the build |
| `pnpm test` | Full test suite, single run (Vitest) |
| `pnpm test:watch` | Test suite in watch mode |
| `pnpm test:e2e` | End-to-end tests (Playwright) |
| `pnpm typecheck` | `astro check` |
| `pnpm sanity:start` | Sanity Studio locally |
| `pnpm sanity:deploy` | Publish the Studio |

### Content management

Books and articles are managed from **Sanity Studio** — run `pnpm sanity:start` for the local Studio, or `pnpm sanity:deploy` to publish the hosted one.

Create a document, fill the fields in Spanish and English, hit **Publish**. The site picks it up on the next request (content is cached for 60 seconds).

To load demo content into an empty dataset:

```bash
node scripts/seed-discovery.mjs
```

---

## 🔐 Security & Secrets

- `.env` is **never** committed (it is in `.gitignore`). `.env.example` is the template.
- `SUPABASE_SERVICE_ROLE_KEY` and `AD_HMAC_SECRET` are **server-only** and never reach the browser.
- The service-role client is created lazily, so a missing key only fails when privileged access is actually attempted.
- Signature comparison uses `timingSafeEqual` — no early-exit leaks.
- When cloning onto a new machine, recreate `.env` by hand and keep the secrets in a password manager.

---

## 🗺️ Roadmap

- [x] Base platform: books, articles, bilingual routing, access control
- [x] Discovery redesign: image-first home, hero carousel, editorial rows, ranked rail
- [ ] Ship `public/logo.svg` (the masthead currently points at a missing asset)
- [ ] **Courses**: learning paths with progress tracking (`/[lang]/cursos` not built yet)
- [ ] **English App**: dedicated section for developers (`/[lang]/ingles` not built yet)
- [ ] Restore a visible language switcher for the existing `/en/` routes
- [ ] Advanced SEO: sitemap, structured data, dynamic OG images
- [ ] Usage analytics and admin dashboard
- [ ] Remove legacy `ContentRow` / `AndeanPattern` components

---

<div align="center">

**ChuyoCode** — Technology learned in your own language.

_Built in Latin America, for Latin America._

</div>
