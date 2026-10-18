/**
 * Sanity client + image-URL-builder configuration, with ONE test-only switch.
 *
 * `SANITY_FIXTURE_API_HOST` exists for the visual snapshot suite
 * (`pnpm test:visual`, tests/e2e/README.md): it points the content client AND
 * the image URL builder at a local fixture server that answers the app's GROQ
 * queries from a synthetic dataset, so screenshots never depend on live CMS
 * content.
 *
 * Safety: the override is honoured only for an http(s) origin on a loopback
 * host (127.0.0.1, localhost, [::1]); any other value is ignored. A stray or
 * mistyped value in a deployed environment therefore cannot redirect content
 * anywhere — it simply falls back to the real Sanity API. Unset (every real
 * environment), both configs are exactly what they were before this switch
 * existed (`sanityConfig.test.ts` pins that).
 */
import type { ClientConfig } from '@sanity/client';

/** Env fields these configs read (a subset of `Env` from `./env`). */
export interface SanityEnv {
  SANITY_PROJECT_ID: string;
  SANITY_DATASET: string;
  /** Optional; may be absent in mocked envs. Empty/absent → real Sanity API. */
  SANITY_FIXTURE_API_HOST?: string;
}

const API_VERSION = '2024-01-01';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * The fixture origin (`http://127.0.0.1:4335`, no trailing slash) when `raw`
 * is a loopback http(s) URL, otherwise `null` (fixture mode off).
 */
export function resolveSanityFixtureHost(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
  return url.origin;
}

/** Config for `createClient` (`./sanity.ts`). */
export function sanityClientConfig(env: SanityEnv): ClientConfig {
  const base = {
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: API_VERSION,
  };
  const fixtureHost = resolveSanityFixtureHost(env.SANITY_FIXTURE_API_HOST);
  if (!fixtureHost) {
    // `useCdn` is enabled for read performance; pass-gated reads never rely
    // on Sanity, so CDN staleness is acceptable here.
    return { ...base, useCdn: true };
  }
  // No CDN and no `<projectId>.` subdomain: requests go to
  // `<fixtureHost>/v<apiVersion>/data/query/<dataset>` verbatim.
  return { ...base, useCdn: false, apiHost: fixtureHost, useProjectHostname: false };
}

/** Config for `createImageUrlBuilder` (`./image.ts`). */
export function sanityImageBuilderConfig(env: SanityEnv): {
  projectId: string;
  dataset: string;
  baseUrl?: string;
} {
  const base = { projectId: env.SANITY_PROJECT_ID, dataset: env.SANITY_DATASET };
  const fixtureHost = resolveSanityFixtureHost(env.SANITY_FIXTURE_API_HOST);
  return fixtureHost ? { ...base, baseUrl: fixtureHost } : base;
}
