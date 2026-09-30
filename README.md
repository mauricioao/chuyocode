<div align="center">

# ChuyoCode

### Learn English by playing — and build your own activities in minutes

_Books, tech news and a growing English playground, made for Spanish speakers across Latin America._

[![Status](https://img.shields.io/badge/status-in_development-orange)]()
[![Stack](https://img.shields.io/badge/Astro_5-SSR-FACC15)]()
[![Tests](https://img.shields.io/badge/tests-4000%2B-16a34a)]()
[![Languages](https://img.shields.io/badge/routes-ES_·_EN-b45309)]()

</div>

---

## 🌎 Why ChuyoCode

Most English platforms are built for someone else: English-first interfaces, explanations you can't follow yet, and every useful feature behind a paywall.

**ChuyoCode starts from the learner who speaks Spanish.** You practise in English, but the help — hints, grammar notes, the "why" behind a wrong answer — comes in Spanish. And you're not only a consumer: upload the worksheet you already use in class, put answer boxes on top, and share it with your students the same afternoon.

> Good learning resources should not be gated behind a language barrier.

---

## ✨ What you can do today

### 🇬🇧 Practise English

| | |
| :-- | :-- |
| **Curated exercises** | Organised by CEFR level (A1 → C2) and grammar point, graded instantly. |
| **Community activities** | Worksheets and question sets created by other learners and teachers — every one reviewed before it goes public. |
| **One activity, many games** | The same questions become a quiz, flashcards, matching pairs, speaking cards dealt one by one, a spin-the-wheel, anagrams, hangman, true-or-false or open-the-box — one click, no extra work for the author. |
| **Listen** | Tap 🔊 to hear any sentence, or 🚶 to hear it slowly. It picks the most natural English voice on your device, US or UK. |
| **Learn from mistakes** | Wrong answer? A 💡 explains the rule in Spanish. |
| **Discover** | Search, filter by level and type, give ❤️ to the best ones, and try the *activity of the day*. |

### ✏️ Create your own activities

- **Upload a worksheet or PDF**, pick the pages, and draw answer boxes right on top — text or multiple choice. Zoom, pan and rotate like in a design tool.
- **Mix blocks**: a worksheet page, then a set of questions, then another page — all in one activity.
- **Never lose work**: autosave, undo/redo, and a clear saved ✓ indicator.
- **Share it**: WhatsApp, a link, a QR code for the classroom, or **print** it with an optional answer key for students without devices.
- **Duplicate & adapt** someone else's public activity, with credit to the original author.

### 📚 Read

- **Books** — a catalog with downloadable material.
- **News** — tech news and long-form reading.

### 🔜 Coming next

- **Courses** — structured learning paths. Premium unlocks every course; any single course can also be bought for lifetime access.
- **Class mode** — students join a live session from a QR code.

---

## 💡 Built so it feels fast, safe and trustworthy

Every technical choice here exists to give the learner something. The technology is the means, not the pitch.

| What you get | How we get there |
| :-- | :-- |
| **Pages that open instantly, even on mobile data** | [Astro 5](https://astro.build) renders on the server and ships ready-to-paint HTML, cached at the edge by the [Netlify](https://netlify.com) CDN. JavaScript loads only where something is interactive ([React 19](https://react.dev) islands). |
| **Smooth navigation, no flicker** | View transitions keep the header in place between pages; your account shows up immediately instead of blinking. |
| **A consistent, premium feel** | One design system — [Tailwind 4](https://tailwindcss.com) tokens and [shadcn/ui](https://ui.shadcn.com)-style components, [Phosphor](https://phosphoricons.com) icons — so every field, button and card behaves the same everywhere. |
| **Works great on phones** | Mobile-first layouts, pinch-to-zoom worksheets, and bottom sheets sized for thumbs. |
| **Sign in in one tap** | Google or email + password, with sessions held in secure `httpOnly` cookies via [Supabase Auth](https://supabase.com/auth). |
| **Community content you can trust** | Every activity is **reviewed by a moderator before it goes public**; uploads live in a private bucket until approved; learners can report anything off. |
| **Your answers stay yours** | Practice answers are **never stored** — every attempt starts fresh. |
| **Data protected by default** | Row-level security on every table, database functions callable only by the server, and access checks that deny on any doubt. |
| **It keeps working when something breaks** | Reads fail safe: if a service is down, a section degrades instead of the whole page failing. |
| **Quality that holds up** | 4,000+ automated tests ([Vitest](https://vitest.dev), [Playwright](https://playwright.dev)) guard every feature, plus guards against whole classes of bugs. |

---

## 🧩 How it works (for the curious)

- **Activities are documents made of blocks.** Each save is a revision; the public only ever sees the approved one, so editing a live activity never hides it and a moderator approves exactly what they reviewed.
- **One set of questions, many games.** Games are derived from the same items (the Wordwall-style "switch template" idea), so a new game mode never needs new content.
- **Stable answers, never positions.** Options are shuffled on screen, but answers point to stable IDs — a shuffled option can never mark a correct learner wrong.
- **Two kinds of storage, each for what it does best.** [Sanity](https://sanity.io) for editorial content (books, news); Supabase Postgres for application data (activities, reactions, courses).

Deeper reading: [`docs/exercise-model.md`](docs/exercise-model.md) · [`docs/exercise-authoring-brief.md`](docs/exercise-authoring-brief.md) · [`docs/news-authoring-brief.md`](docs/news-authoring-brief.md)

---

## 🚀 Run it locally

**Requirements:** Node.js 20+ (22 recommended) · pnpm 9+ via Corepack

```bash
git clone git@github.com:mauricioao/chuyocode.git
cd chuyocode
corepack enable && pnpm install
cp .env.example .env   # then fill in the values
pnpm dev               # http://localhost:4321
```

| Variable | Required | Purpose |
| :-- | :-- | :-- |
| `SANITY_PROJECT_ID` · `SANITY_DATASET` | ✅ | Books and news (CMS) |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | ✅ | Database and sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | ⬜ | Server-side writes (activities, moderation, uploads) |
| `AD_HMAC_SECRET` | ⬜ | Signs the gated-download cookie |
| `LEGAL_OWNER_*` | ⬜ | Owner details shown on the legal pages |

Missing required variables fail at startup, on purpose — loud at boot, never silent at runtime.

**Database:** apply the SQL files in `supabase/migrations/` in order (Supabase SQL editor or CLI). Google sign-in is configured in Supabase (Authentication → Providers).

| Command | What it does |
| :-- | :-- |
| `pnpm dev` | Dev server |
| `pnpm build` · `pnpm preview` | Production build / preview |
| `pnpm test` | All unit tests (~1 min). Run one group with `pnpm vitest run --project node` (or `jsdom` / `astro`) |
| `pnpm test:e2e` | Playwright |
| `pnpm typecheck` | `astro check` |
| `pnpm sanity:start` · `pnpm sanity:deploy` | Sanity Studio |

---

<div align="center">

**ChuyoCode** — English and technology, in your own language.

_Built in Latin America, for Latin America._

</div>
