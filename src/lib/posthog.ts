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
