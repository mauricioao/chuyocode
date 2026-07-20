<div align="center">

# ChuyoCode

### The tech education platform with a Latin soul

_Learn technology in your own language — no paywalls, no subscriptions._

[![Status](https://img.shields.io/badge/status-in_development-orange)]()
[![Stack](https://img.shields.io/badge/Astro_5-SSR-ea580c)]()
[![Tests](https://img.shields.io/badge/tests-159_passing-16a34a)]()
[![i18n](https://img.shields.io/badge/languages-ES_·_EN-b45309)]()

</div>

---

## 🌎 The Business

**ChuyoCode** is a tech education platform with a strong Latin and Peruvian identity. It brings together books, articles, and —soon— courses in a modern, streaming-platform-style experience.

Its edge is a **non-intrusive monetization model**: instead of charging subscriptions or locking content behind a paywall, ChuyoCode offers a **fair value exchange**.

### The model: 24-hour Premium Pass

> The user voluntarily watches **one rewarded ad** and unlocks **all premium content for 24 hours**.

```
   User wants to read  ──►  Watches 1 ad  ──►  24h Pass activated
        a book               (voluntary)         PDF unlocked
```

**Why it works**

| For the user | For the business |
| :-- | :-- |
| ✅ Access without paying money | 💰 Revenue from rewarded ads |
| ✅ No subscriptions, no cards | 📈 Zero conversion friction |
| ✅ Full 24h from a single ad | 🔁 Recurring return every 24h |
| ✅ Content in their own language | 🌎 Underserved Latin market |

It's the **YouTube and mobile-app model** applied to tech education: the content is free, the advertiser pays, and everyone wins.

### Who is it for?

Developers, students, and tech-curious people across **Latin America** who want to learn in Spanish (and English), with quality content and a polished visual experience — not just another blog with a boring dark mode.

### Product lines

| Line | Status | Description |
| :-- | :-- | :-- |
| 📚 **Books** | ✅ Live | Catalog with unlockable premium PDFs |
| 📝 **Articles** | ✅ Live | Free news and reading content |
| 🎓 **Courses** | 🔜 Coming soon | Structured learning paths |
| 🇬🇧 **English App** | 🔮 On the roadmap | Independent English-for-developers section |

---

## ✨ The Experience

- **Modern Andean identity** — warm palette (terracotta, ochre, amaranth) over an elegant dark base, Fraunces display typography, and a subtle geometric texture inspired by Andean textiles. Not a generic dark mode.
- **Streaming-style home** — horizontal content rows with smooth scrolling, like the platforms you already know.
- **Truly bilingual** — Spanish and English with dedicated routes (`/es/`, `/en/`), not a translator bolted on top.
- **Flash-free dark mode** — the theme is applied before the first render.
- **Blazing fast** — server-side rendering (SSR), pure HTML, JavaScript only where needed.
- **Accessible** — keyboard navigation, skip-to-content, and `prefers-reduced-motion` support.

---

## 🏗️ The Architecture (why it's solid)

ChuyoCode is not a prototype: it's a **professional, tested, and scalable** foundation, built to grow without rewrites.

### Design philosophy

- **Server-first**: content is assembled on the server and delivered as ready-to-paint HTML. Maximum speed, maximum SEO.
- **Islands of interactivity**: React loads only in the components that need it (ad modal, theme toggle). Everything else is lightweight static HTML.
- **Fail-closed by design**: on any error, the system denies premium access instead of giving it away.
- **Zero secrets in code**: all keys live in environment variables.

### Flow diagram

```
                    ┌──────────────────────────────────────┐
   User ─────────►  │          Astro (Server / SSR)          │
   requests a book  │                                        │
                    │  1. Fetch content       ──►  Sanity   │  (Headless CMS)
                    │  2. Verify 24h pass     ──►  Cookie   │  (HMAC-signed)
                    │     (signed, HMAC)                     │
                    │  3. Decide what to serve:              │
                    │     ✅ Valid pass → full PDF           │
                    │     ❌ No pass    → ad modal           │  (React island)
                    └──────────────────────────────────────┘
                                     │
                            User watches the ad
                                     │
                    ┌──────────────────────────────────────┐
                    │  POST /api/validar-anuncio             │
                    │  → signs pass cookie (+24h)            │
                    │  → content unlocked                    │
                    └──────────────────────────────────────┘
```

### Tech stack

Every choice answers a business goal, not a trend:

| Layer | Technology | Why |
| :-- | :-- | :-- |
| **Core** | [Astro 5](https://astro.build) (SSR + Node adapter) | Ultra-fast HTML ideal for content; SSR to verify the pass before serving |
| **Interactivity** | [React 19](https://react.dev) (islands) | JS only where it matters: ad modal and theme toggle |
| **CMS** | [Sanity.io](https://sanity.io) | The team edits books and articles without touching code |
| **Backend / Auth** | [Supabase](https://supabase.com) | Database ready for users, analytics, and future features |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com) | Consistent design, native dark mode, custom token system |
| **Typography** | [Fraunces](https://fonts.google.com/specimen/Fraunces) (self-hosted) | Warm display serif that gives Latin personality |
| **Testing** | [Vitest](https://vitest.dev) + [Playwright](https://playwright.dev) | 159 tests ensure nothing breaks as it grows |

### Project structure

```
chuyocode/
├── src/
│   ├── components/
│   │   ├── islands/          # Interactive React (AdModal, ThemeToggle)
│   │   ├── layout/           # Header, Footer
│   │   └── ui/               # Button, BookCard, NewsCard, ContentRow, AndeanPattern
│   ├── layouts/
│   │   └── BaseLayout.astro  # Global shell: SEO, dark mode, skip-link, favicon
│   ├── lib/                  # Business logic (server-only)
│   │   ├── sanity.ts         #   CMS client + LRU cache + GROQ queries
│   │   ├── supabase.ts       #   Anon + service-role clients
│   │   ├── pass.ts           #   Premium pass: HMAC-signed cookie (fail-closed)
│   │   ├── i18n.ts           #   Languages, resolution, and localized labels
│   │   ├── env.ts            #   Environment variable validation at startup
│   │   └── reveal.ts         #   Scroll animations (IntersectionObserver)
│   ├── middleware.ts         # Language validation + redirects
│   ├── pages/
│   │   ├── [lang]/           # Bilingual routes (es, en)
│   │   │   ├── index.astro           # Streaming-style home
│   │   │   ├── libros/               # Catalog + detail with pass gate
│   │   │   ├── noticias/             # Paginated articles + reading page
│   │   │   └── legal/                # Terms and privacy
│   │   └── api/
│   │       └── validar-anuncio.ts    # Endpoint that grants the 24h pass
│   └── styles/               # Fonts + global CSS (tokens, reveals)
├── schemas/                  # Sanity content models (book, news)
├── astro.config.mjs
├── tailwind.config.cjs       # Andean palette + theme tokens
└── sanity.config.ts          # Studio (CMS) configuration
```

---

## 🚀 Getting Started

### Requirements

- **Node.js 22 LTS** (`node --version` → `v22.x`)
- **pnpm** (via Corepack: `corepack enable`)

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
# Edit .env and fill in SUPABASE_URL, SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, and AD_HMAC_SECRET
```

> **Generate `AD_HMAC_SECRET`:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Use **the same value** across all your machines: it signs the pass cookies.

### Commands

| Command | What it does |
| :-- | :-- |
| `pnpm dev` | Dev server at `http://localhost:4321` |
| `pnpm build` | Production build |
| `pnpm preview` | Preview the build |
| `pnpm test` | Run the test suite (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright) |
| `pnpm typecheck` | Type checking |
| `pnpm sanity:deploy` | Publish the content Studio |

### Content management

Content (books and articles) is managed from **Sanity Studio**:

👉 **[chuyocode.sanity.studio](https://chuyocode.sanity.studio)**

Create a document, fill in the fields in Spanish and English, and hit **Publish**. The site picks it up automatically.

---

## 🔐 Security & Secrets

- The `.env` file is **never** committed (it's in `.gitignore`).
- Use `.env.example` as a template.
- Sensitive keys (`SUPABASE_SERVICE_ROLE_KEY`, `AD_HMAC_SECRET`) are **server-only** and never reach the browser.
- When cloning onto a new machine, recreate `.env` by hand (store secrets in a password manager).

---

## 🗺️ Roadmap

- [x] Base platform: books, articles, premium pass, rewarded ads
- [x] Identity redesign: streaming home, Andean typography and palette
- [ ] **Courses**: learning paths with progress tracking
- [ ] **English App**: independent section for developers
- [ ] Advanced SEO: sitemap, structured data, dynamic OG images
- [ ] Usage analytics and admin dashboard

---

<div align="center">

**ChuyoCode** — Technology learned in your own language. 🧡

_Built with Andean warmth, from Latin America._

</div>
