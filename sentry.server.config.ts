/**
 * Sentry SERVER (SSR) init — auto-loaded by the `@sentry/astro` integration
 * (see astro.config.mjs). That integration is only ever added to
 * `integrations` when `PUBLIC_SENTRY_DSN` is set at BUILD time, so this
 * file — and the `@sentry/astro` server runtime it imports — is never
 * bundled into the Netlify Function at all otherwise.
 *
 * See sentry.client.config.ts's header for the shared reasoning (the
 * `PUBLIC_`/build-time var posture, errors-only, the `dataCollection`
 * option that replaced the older `sendDefaultPii` boolean, the shared
 * scrub backstop). No source-map upload here either — that needs
 * `org`/`project`/`authToken` on the `sentryAstro()` integration call in
 * astro.config.mjs, which is deliberately not set.
 */
import * as Sentry from '@sentry/astro';
import { scrubSensitiveRequestData } from './src/lib/sentryScrub';

const dsn = import.meta.env.PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    dataCollection: {
      cookies: false,
      httpHeaders: { deny: ['cookie', 'set-cookie', 'authorization', 'proxy-authorization'] },
    },
    beforeSend(event) {
      scrubSensitiveRequestData(event as unknown as Record<string, unknown>);
      return event;
    },
    beforeSendTransaction(event) {
      scrubSensitiveRequestData(event as unknown as Record<string, unknown>);
      return event;
    },
  });
}
