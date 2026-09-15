/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SANITY_PROJECT_ID: string;
  readonly SANITY_DATASET: string;
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly AD_HMAC_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  // Populated by src/middleware.ts for locale-prefixed pages so they can read
  // the validated active language without re-parsing the URL.
  interface Locals {
    lang?: import('@lib/i18n').Lang;
    /**
     * The server-verified caller, resolved once per request by middleware from
     * `client.auth.getUser()` — never from `getSession()`, which does not
     * revalidate the token. `null` means anonymous.
     *
     * 🔴 NEVER make this optional. `user: User | null` forces middleware to
     * assign it on every path, and forces every reader to handle `null`. Under
     * `user?: User | null` a forgotten assignment reads as "no user" and the
     * bug becomes a silent, permanent sign-out instead of a type error.
     *
     * Only plain, serializable data belongs on `locals`. The Supabase client is
     * deliberately absent: API routes build their own with
     * `createSessionClient`, and construction does no I/O, so that costs
     * nothing.
     */
    user: import('@supabase/supabase-js').User | null;
  }
}
