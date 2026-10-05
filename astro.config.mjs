import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import sentry from '@sentry/astro';
import tailwindcss from '@tailwindcss/vite';
import { serverOnlyModules } from './src/lib/build/serverOnlyModules.ts';

// INERT until the owner sets a DSN (same pattern as Turnstile/Paddle in
// this repo — see src/lib/turnstile.ts / src/lib/env.ts's own headers).
// `PUBLIC_SENTRY_DSN` is a public, build-time var: Astro loads `.env` into
// `process.env` before this file runs, same as Netlify's build environment.
// Unset here means the `sentryAstro()` integration below is never added to
// `integrations` at all — not just configured to no-op — so neither its
// client runtime (sentry.client.config.ts) nor its server runtime
// (sentry.server.config.ts) is ever bundled into either build graph.
const sentryDsn = process.env.PUBLIC_SENTRY_DSN?.trim();

// ChuyoCode runs in SSR mode: every gated page verifies the access cookie per
// request against Supabase, so static output is not an option (design
// decision #1). The Netlify adapter compiles that SSR entry into a Netlify
// Function, and `dist/` keeps only the prerendered/static assets that Netlify
// serves from its CDN.
export default defineConfig({
  // SEO basics: backs the canonical/hreflang/OG tags (`BaseLayout.astro`) and
  // the sitemap (`src/pages/sitemap.xml.ts`) with one absolute origin. Netlify
  // sets the `URL` build-time env var to the site's primary URL — today's
  // `*.netlify.app` subdomain, and the custom domain automatically once one is
  // attached (bought 2026-11-01) — so this needs no code change that day. The
  // literal fallback covers a local `pnpm build`/test run with no `URL` set.
  site: process.env.URL || 'https://chuyocode.netlify.app',
  output: 'server',
  // 🔴 HARD RULE — the Netlify adapter is called with NO options, and must stay
  // that way. Two of its options break authentication, and both break it
  // SILENTLY: no error, no log, nothing a behavioral test could observe.
  //
  //  - Edge middleware mode. The adapter then JSON-serializes `context.locals`
  //    into a header and ships it to the rendering function. The Supabase
  //    session client that `src/middleware.ts` builds cannot survive JSON
  //    serialization, so every visitor would simply never be signed in.
  //  - On-demand page caching. A page rendered from `Astro.locals.user` must
  //    never reach the shared CDN, or an anonymous visitor is served an
  //    authenticated visitor's HTML.
  //
  // `src/astroConfig.test.ts` enforces this by reading THIS FILE as raw text,
  // and it cannot tell a comment from a setting. That is why neither option is
  // spelled by name here: a commented-out setting is one keystroke from live.
  // The two names, and the full reasoning, live in that test.
  adapter: netlify(),
  integrations: [
    // React powers the islands only (AdModal).
    react(),
    // Runtime options (dsn, tracesSampleRate, …) live in
    // sentry.client.config.ts / sentry.server.config.ts instead (the only
    // place they can go as of @sentry/astro v11 — passing them here is
    // silently ignored). `org`/`project`/`authToken` stay unset: that is
    // what would turn on source-map upload at build time, which this task
    // deliberately does not wire up. `telemetry: false` because the
    // underlying sentry-vite-plugin sends build-time usage telemetry to
    // Sentry by default — observed directly in `pnpm build`'s own output
    // ("[sentry-vite-plugin] Info: Sending telemetry...") — independently
    // of authToken/source maps; nothing about this integration should talk
    // to Sentry at build time while it is otherwise this minimal.
    ...(sentryDsn ? [sentry({ telemetry: false })] : []),
  ],
  // Locale routing (spec 5). `prefixDefaultLocale: true` means the default
  // locale (es) is always URL-prefixed (`/es/…`), never served unprefixed.
  // This requires a root index route (src/pages/index.astro) which now exists
  // and 302-redirects `/` -> `/es/`. Middleware (src/middleware.ts) enforces
  // the invalid-lang 404 and hands the validated lang to pages.
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    // Tailwind 4 plugs into Vite directly (replaced the @astrojs/tailwind
    // integration). It reads the `@theme` block in src/styles/global.css.
    // `serverOnlyModules()` fails the build if a server-only module (secret
    // names/values, see its own header comment) is reachable from the
    // client bundle.
    plugins: [tailwindcss(), serverOnlyModules()],
    // Keep server-only secrets (service role, HMAC) out of the client bundle.
    ssr: {
      noExternal: ['@sanity/client'],
    },
  },
});
