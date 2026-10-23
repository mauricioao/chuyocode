/**
 * PostHog product analytics + feature flags — INERT unless `PUBLIC_POSTHOG_KEY`
 * is set, same posture as `src/lib/webAnalytics.ts` (Cloudflare) and
 * `src/lib/turnstile.ts`: no script tag, no network call, no cookie, until a
 * real key is configured.
 *
 * `PUBLIC_POSTHOG_KEY`/`PUBLIC_POSTHOG_HOST` ARE PUBLIC, BUILD-TIME
 * VARIABLES — Astro/Vite inline any `PUBLIC_`-prefixed var into the CLIENT
 * bundle at BUILD time, same as `PUBLIC_SENTRY_DSN`/`PUBLIC_TURNSTILE_SITE_KEY`
 * (see their own files' headers). Set in Netlify's BUILD environment, not
 * only "available at runtime", before a deploy.
 *
 * `PUBLIC_POSTHOG_HOST` defaults to PostHog Cloud's EU region
 * (`https://eu.i.posthog.com`) when a key is set but no host is — this
 * project's owner/user data lives in the EU (Peru-targeted but EU-hosted
 * infra elsewhere in this codebase's conventions), and PostHog requires an
 * explicit region pick with no cross-region default of its own.
 *
 * {@link getPosthogConfig} returning `null` is this feature's ONE off
 * switch: `src/layouts/BaseLayout.astro` renders no script element, and
 * `src/lib/securityHeaders.ts` adds no PostHog host to the CSP, while it is
 * unset.
 */

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

export interface PosthogConfig {
  /** The project API key (public — safe to ship in a client bundle). */
  key: string;
  /** The ingestion host, e.g. `https://eu.i.posthog.com`. */
  host: string;
}

function readPublicEnvString(key: string): string | undefined {
  const source = import.meta.env as Record<string, unknown>;
  const raw = source[key];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * The active PostHog configuration, or `null` while
 * `PUBLIC_POSTHOG_KEY` is unset/blank.
 *
 * Blank/whitespace-only counts as unset, same posture as
 * `src/lib/webAnalytics.ts`'s `getWebAnalyticsToken`.
 */
export function getPosthogConfig(): PosthogConfig | null {
  const key = readPublicEnvString('PUBLIC_POSTHOG_KEY')?.trim();
  if (!key) {
    return null;
  }
  const host = readPublicEnvString('PUBLIC_POSTHOG_HOST')?.trim();
  return { key, host: host || DEFAULT_POSTHOG_HOST };
}

/**
 * Just the host PostHog will be reached at, or `null` while inert — the one
 * thing `src/lib/securityHeaders.ts` needs, without pulling the key (which
 * the CSP never carries) into that module.
 */
export function getPosthogHost(): string | null {
  return getPosthogConfig()?.host ?? null;
}

/**
 * The "-assets" sibling host `posthog-js` itself derives for a recognized
 * PostHog Cloud region — e.g. `https://us.i.posthog.com` additionally
 * reaches `https://us-assets.i.posthog.com` for the library's own remote
 * config/extensions requests, on top of the main ingestion host. A custom/
 * self-hosted host (anything not in this exact list) has no such sibling:
 * posthog-js reaches it verbatim.
 *
 * `src/lib/securityHeaders.ts` is the one caller: the CSP must allow this
 * host too, alongside the main one from {@link getPosthogHost}, or
 * posthog-js's own config/extensions requests get blocked once PostHog is
 * configured with a Cloud host.
 *
 * (PostHog's own CSP docs recommend a `https://*.posthog.com` wildcard
 * instead of an exact-host table, precisely because they reserve the right
 * to add subdomains later — but this project already has a test pinning
 * the NO-wildcard, exact-host posture for a custom/self-hosted host, so a
 * small exact-match table is the fix that fits here, not the wildcard.)
 */
const POSTHOG_CLOUD_ASSETS_HOSTS: Readonly<Record<string, string>> = {
  'https://us.i.posthog.com': 'https://us-assets.i.posthog.com',
  'https://eu.i.posthog.com': 'https://eu-assets.i.posthog.com',
};

export function getPosthogAssetsHost(): string | null {
  const host = getPosthogHost();
  if (!host) return null;
  // Normalize case and a trailing slash before the lookup so a host that is
  // STILL the same recognized Cloud region (e.g. a stray trailing "/", or
  // mixed case from a copy-pasted env var) doesn't silently miss its
  // sibling — `getPosthogHost()` itself only trims surrounding whitespace.
  const normalized = host.toLowerCase().replace(/\/+$/, '');
  return POSTHOG_CLOUD_ASSETS_HOSTS[normalized] ?? null;
}
