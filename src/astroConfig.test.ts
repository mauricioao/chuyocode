import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * HARD RULE guard for `astro.config.mjs` (design §1 and §2).
 *
 * Two adapter options would break authentication, and both would break it
 * SILENTLY — no error, no log, nothing a test of behavior could observe:
 *
 *  1. Edge middleware mode. Under it the Netlify adapter JSON-serializes
 *     `context.locals` into a header and ships it to the rendering function.
 *     A Supabase session client cannot survive JSON serialization, so every
 *     visitor would simply never be signed in.
 *  2. On-demand page caching. A page that renders differently per session must
 *     never reach a shared CDN cache, or an anonymous visitor is served an
 *     authenticated visitor's HTML. The option is off today only because the
 *     adapter is called with no options — an accident of configuration, not a
 *     guarantee.
 *
 * The config exports an opaque integration object, so there is nothing to
 * introspect at runtime: a text assertion is the only thing that catches a
 * future edit. Crude, and correct for this failure mode.
 *
 * 🔴 The forbidden option names are deliberately NOT spelled out in
 * `astro.config.mjs` itself, not even inside its warning comment, because this
 * guard reads the file as raw text and cannot tell a comment from a setting.
 * Writing either identifier there — even commented out — fails this test. That
 * is intentional: a commented-out setting is one keystroke from being live.
 */
const configPath = fileURLToPath(
  new URL('../astro.config.mjs', import.meta.url),
);
const config = readFileSync(configPath, 'utf8');

/** Option names that must never appear in the Astro config, in any form. */
const FORBIDDEN_OPTIONS = ['middlewareMode', 'cacheOnDemandPages'] as const;

describe('astro.config.mjs auth-safety guard', () => {
  // Anchors every assertion below to the real config. Without this, a wrong
  // relative path or a gutted file would make the absence checks pass vacuously.
  it('reads the SSR Netlify config this project actually ships', () => {
    expect(config).toContain("output: 'server'");
    expect(config).toContain('adapter: netlify(');
  });

  it('calls the Netlify adapter with no options at all', () => {
    // `netlify()` with an empty argument list is what keeps middleware in the
    // Node function, the only mode `@supabase/ssr` is verified against here.
    expect(config).toContain('adapter: netlify(),');
  });

  it.each(FORBIDDEN_OPTIONS)('never mentions %s', (option) => {
    expect(config).not.toContain(option);
  });
});
