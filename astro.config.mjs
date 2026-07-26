import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// ChuyoCode runs in SSR mode: every gated page checks the 24h pass per request
// against Supabase, so static output is not an option (see design decision #1).
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [
    // React powers the islands only (AdModal).
    react(),
    // Tailwind with a JS config so darkMode:'class' and the zinc/orange
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
