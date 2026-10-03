/**
 * Vite plugin: fail the build if a module that must stay server-only is
 * reachable from the CLIENT build graph.
 *
 * `src/lib/env.ts` reads `SUPABASE_SERVICE_ROLE_KEY` and `AD_HMAC_SECRET`.
 * Bundling it for the browser leaks their NAMES into `dist/_astro/*.js`
 * (string literals survive minification) even on a day `loadEnv()` happens
 * to throw there for lack of `SUPABASE_URL` — one future change to what the
 * module reads, or to a fallback around it, and the VALUES would ship too.
 * This plugin turns that silent, fallback-shaped leak into a build error at
 * the exact import that caused it, instead of something only a bundle
 * inspection would ever catch.
 *
 * Astro 5.18 runs on Vite 6.4 internally, which is what the `this.environment`
 * / `consumer` check below targets (Vite's per-environment Plugin API).
 * {@link SERVER_ONLY_MODULES} is the single place new server-only modules
 * get added as the app grows.
 */
import type { Plugin } from 'vite';

/**
 * Modules that must never resolve from a client-consumer import graph.
 * Matched by suffix against the normalized (forward-slash, query-stripped)
 * resolved module id — see {@link normalizeModuleId}.
 */
export const SERVER_ONLY_MODULES = ['/src/lib/env.ts'] as const;

/**
 * Cheap prefilter so the thousands of ordinary imports in the app skip the
 * real (async) resolve call below. Deliberately loose: a false positive
 * just costs one extra `resolve`, a false negative would silently defeat
 * the whole guard — this is a HARD GATE, not backed by a resolve-based
 * check (a rejected specifier returns before `context.resolve` is ever
 * called, see {@link resolveServerOnlyModule}). Matches a last path segment
 * of exactly `env`, with an optional `.ts`/`.js`/`.mts`/`.mjs`/`.cts`/`.cjs`
 * extension — covering `./env`, `../env`, `@lib/env` and `@/lib/env` alike,
 * including a `.js` specifier TS resolves to a `.ts` file. Applied AFTER
 * {@link stripSpecifierSuffix}, so a trailing `?query` (e.g. `@lib/env?raw`,
 * `@lib/env?url`) or `#hash` on the raw specifier cannot be used to dodge it.
 */
const ENV_SPECIFIER_PATTERN = /(^|\/)env(\.(?:ts|js|mts|mjs|cts|cjs))?$/i;

/**
 * Strips a trailing `?query` or `#hash` from a RAW (not-yet-resolved) import
 * specifier, so {@link ENV_SPECIFIER_PATTERN} matches regardless of a
 * Vite-specific query (`@lib/env?raw`, `@lib/env?url`) or hash suffix.
 */
function stripSpecifierSuffix(source: string): string {
  return source.split(/[?#]/)[0] ?? source;
}

/** Does `source` (the raw, not-yet-resolved import specifier) look like it
 * could point at one of {@link SERVER_ONLY_MODULES}? */
export function looksLikeServerOnlySpecifier(source: string): boolean {
  return ENV_SPECIFIER_PATTERN.test(stripSpecifierSuffix(source));
}

/**
 * Normalizes a resolved module id for suffix comparison: Windows backslashes
 * become forward slashes, and any `?query` Vite appended (e.g. a dev-server
 * cache-busting suffix) is stripped.
 */
export function normalizeModuleId(id: string): string {
  const withoutQuery = id.split('?')[0] ?? id;
  return withoutQuery.replace(/\\/g, '/');
}

/** Is the normalized id one of {@link SERVER_ONLY_MODULES}? */
export function isServerOnlyModuleId(normalizedId: string): boolean {
  return SERVER_ONLY_MODULES.some((suffix) => normalizedId.endsWith(suffix));
}

/**
 * The minimal shape of Vite's plugin-context `this` that this hook reads,
 * so unit tests can drive the real logic with a plain fake object instead
 * of a real Vite dev server / build environment.
 */
export interface ServerOnlyResolveContext {
  /** Absent in a fake/edge call shape; {@link isClientBuild} then falls
   * back to `options.ssr`. */
  environment?: { config: { consumer?: string } };
  resolve(
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ): Promise<{ id: string } | null> | { id: string } | null;
  error(message: string): never;
}

/**
 * Is this resolution happening for the CLIENT build? Prefers Vite's real
 * per-environment flag; falls back to the legacy `ssr` resolve option when
 * no environment is attached to the context (older/edge call shapes).
 */
export function isClientBuild(
  context: Pick<ServerOnlyResolveContext, 'environment'>,
  options: { ssr?: boolean } | undefined,
): boolean {
  if (context.environment) {
    return context.environment.config.consumer === 'client';
  }
  return !options?.ssr;
}

/**
 * The hook body, factored out from the plugin object below so it can be
 * unit tested with a fake context — see {@link ServerOnlyResolveContext}.
 * Always resolves to `null`: this plugin only ever vetoes (via `error`,
 * which throws), never claims a module.
 */
export async function resolveServerOnlyModule(
  context: ServerOnlyResolveContext,
  source: string,
  importer: string | undefined,
  options: { ssr?: boolean } & Record<string, unknown>,
): Promise<null> {
  if (!looksLikeServerOnlySpecifier(source)) {
    return null;
  }

  const resolved = await context.resolve(source, importer, { ...options, skipSelf: true });
  if (!resolved) {
    return null;
  }

  const normalizedId = normalizeModuleId(resolved.id);
  if (isServerOnlyModuleId(normalizedId) && isClientBuild(context, options)) {
    context.error(
      `"${importer ?? '<unknown importer>'}" imports "${normalizedId}", which is server-only ` +
        'and must never reach a client bundle.',
    );
  }

  return null;
}

/** The actual Vite plugin — see this module's header comment. */
export function serverOnlyModules(): Plugin {
  return {
    name: 'chuyocode:server-only-modules',
    // `enforce: 'pre'` is required: Vite's own core `vite:resolve` plugin
    // (which resolves a plain relative/aliased specifier to an absolute
    // path) runs ahead of any default (no-`enforce`) plugin's `resolveId`
    // and returns a result first, short-circuiting the hook chain before a
    // later plugin is ever called. Running `pre` puts this plugin first in
    // line for every resolution, so it actually gets to veto one.
    enforce: 'pre',
    resolveId(source, importer, options) {
      // Cast: `this` is Vite's real PluginContext (richer than the minimal
      // fake-able shape above), which always satisfies it structurally.
      return resolveServerOnlyModule(this as unknown as ServerOnlyResolveContext, source, importer, options ?? {});
    },
  };
}
