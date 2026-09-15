import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// ChuyoCode runs in SSR mode: every gated page verifies the access cookie per
// request against Supabase, so static output is not an option (design
// decision #1). The Netlify adapter compiles that SSR entry into a Netlify
// Function, and `dist/` keeps only the prerendered/static assets that Netlify
// serves from its CDN.
export default defineConfig({
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
    plugins: [tailwindcss()],
    // Keep server-only secrets (service role, HMAC) out of the client bundle.
    ssr: {
      noExternal: ['@sanity/client'],
    },
  },
});
