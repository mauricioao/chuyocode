import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// ChuyoCode runs in SSR mode: every gated page verifies the access cookie per
// request against Supabase, so static output is not an option (design
// decision #1). The Netlify adapter compiles that SSR entry into a Netlify
// Function, and `dist/` keeps only the prerendered/static assets that Netlify
// serves from its CDN.
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [
    // React powers the islands only (AdModal).
    react(),
    // Tailwind with a JS config so darkMode:'class' and the zinc/yellow
    // palette live in tailwind.config.cjs.
    tailwind({
      applyBaseStyles: true,
    }),
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
    // Keep server-only secrets (service role, HMAC) out of the client bundle.
    ssr: {
      noExternal: ['@sanity/client'],
    },
  },
});
