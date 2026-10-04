/**
 * Shared timing constants for the rewarded-ads flow (spec 4: rewarded-ads).
 *
 * Imported by BOTH the client island (`AdModal`) and the server endpoints
 * (`/api/anuncio/inicio`, `/api/validar-anuncio`), so the minimum watch time
 * and the start-proof TTL can never drift between what the UI shows the
 * visitor and what the server actually enforces.
 *
 * This module is deliberately pure and import-free: it touches no env vars
 * and no Node builtins, so it is safe for the CLIENT bundle. The
 * `serverOnlyModules()` Vite plugin (`src/lib/build/serverOnlyModules.ts`)
 * fails the build if `src/lib/env.ts` becomes reachable from client code —
 * this module must never import anything that chains into it.
 */

/** How long the simulated ad must "play" before a completion can be valid. */
export const AD_MIN_WATCH_SECONDS = 3;

/** {@link AD_MIN_WATCH_SECONDS} in milliseconds — the unit the server checks in. */
export const AD_MIN_WATCH_MS = AD_MIN_WATCH_SECONDS * 1000;

/**
 * Maximum age of the ad-start cookie: how long a visitor has, after starting
 * the ad, to finish watching and call `validar-anuncio` before the start
 * proof is considered stale and rejected. Also the cookie's `Max-Age`.
 */
export const AD_START_TTL_MS = 5 * 60 * 1000;
