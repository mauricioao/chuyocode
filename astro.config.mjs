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
